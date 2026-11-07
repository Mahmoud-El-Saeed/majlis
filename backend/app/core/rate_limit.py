"""Fixed-window rate limiting on Redis (spec: Redis for rate-limiting).

Limited: ticket-01 public endpoints (signup, login/token, password-reset)
plus ticket-02 invite create/accept. Verify/refresh/me are cheap
authenticated-or-token reads and are deliberately NOT limited.
Falls back to in-memory when Redis is unreachable (tests / local without
redis) and logs a warning instead of failing silently.
Backend messages stay English; the frontend localizes them (default Arabic).

Ticket 22: buckets are keyed on the real client. With
RATE_LIMIT_TRUSTED_PROXIES > 0 the rightmost N entries of X-Forwarded-For
name the trusted proxies (Cloudflare, then nginx); the bucket keys on the
rightmost entry before them. 0 keeps the raw TCP peer (dev, direct access),
which was exactly the shared-bucket bug behind the reverse proxy.
"""

import logging
import time
from collections import defaultdict
from collections.abc import Awaitable, Callable
from typing import Any, cast

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from redis import asyncio as aioredis

from app.core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

_memory_hits: defaultdict[str, list[float]] = defaultdict(list)
_redis: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


# Exact endpoint suffix -> per-minute limit. Anything not listed is not limited.
LIMITED_ENDPOINTS: dict[str, int] = {
    "/api/v1/auth/signup": settings.RATE_LIMIT_SIGNUP_PER_MIN,
    "/api/v1/auth/login": settings.RATE_LIMIT_LOGIN_PER_MIN,
    "/api/v1/auth/token": settings.RATE_LIMIT_LOGIN_PER_MIN,
    "/api/v1/auth/password-reset/request": settings.RATE_LIMIT_RESET_PER_MIN,
    "/api/v1/auth/password-reset/confirm": settings.RATE_LIMIT_RESET_PER_MIN,
    "/api/v1/invites": settings.RATE_LIMIT_INVITE_PER_MIN,
    "/api/v1/invites/accept": settings.RATE_LIMIT_INVITE_PER_MIN,
    "/api/v1/enrollments/join": settings.RATE_LIMIT_JOIN_PER_MIN,
}


def client_key(request: Request) -> str:
    """Bucket key identity for one request.

    Trusted-proxy walk: each trusted proxy appends the peer it saw to
    X-Forwarded-For; the rightmost `RATE_LIMIT_TRUSTED_PROXIES` entries are
    therefore trusted proxy chains, and the entry before them is the client
    as the innermost trusted proxy saw it. XFF shorter than that walks the
    chain back to the leftmost entry (a no-forgery client behind the proxy).
    No header → direct peer (dev, no proxy in front).
    """
    direct = request.client.host if request.client else "unknown"
    hops = settings.RATE_LIMIT_TRUSTED_PROXIES
    if hops <= 0:
        return direct
    xff = request.headers.get("x-forwarded-for")
    if not xff:
        return direct
    chain = [part.strip() for part in xff.split(",") if part.strip()]
    if not chain:
        return direct
    trusted_cut = max(len(chain) - hops, 0)
    untrusted = chain[:trusted_cut]
    return untrusted[-1] if untrusted else chain[0]


async def _memory_allowed(key: str, limit: int, window: int = 60) -> bool:
    now = time.time()
    hits = [t for t in _memory_hits[key] if now - t < window]
    _memory_hits[key] = hits
    if len(hits) >= limit:
        return False
    hits.append(now)
    _memory_hits[key] = hits
    return True


def reset_memory_limits() -> None:
    _memory_hits.clear()


async def rate_limit_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    limit = LIMITED_ENDPOINTS.get(request.url.path)
    if limit is None or request.method != "POST":
        return await call_next(request)

    client = client_key(request)
    key = f"rl:{request.url.path}:{client}"

    allowed = True
    try:
        r = get_redis()
        count: int = await cast(Any, r.incr(key))
        if count == 1:
            await cast(Any, r.expire(key, 60))
        allowed = count <= limit
    except Exception:
        logger.warning("Redis unavailable for rate limiting; using in-memory fallback.")
        allowed = await _memory_allowed(key, limit)

    if not allowed:
        return JSONResponse(
            status_code=429,
            content={"detail": "Too many requests. Try again in a minute."},
        )
    return await call_next(request)
