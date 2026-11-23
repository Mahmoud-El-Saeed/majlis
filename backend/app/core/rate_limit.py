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

Ticket 25: Heroku's router appends the address it saw to the RIGHT of any
client-supplied X-Forwarded-For, so the walk above would trust a forged
prefix there. Production sets RATE_LIMIT_CLIENT_IP_SOURCE=xff_rightmost and
keys on the last entry. Router 2.0 (the Common Runtime default since the
legacy router's 2025 EOL) combines duplicate headers per RFC 7230 and
appends after them, so `_forwarded_chain` joins every header value before
taking the last; reading only the first header would let a client rotate
buckets by sending a second one.
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
        _redis = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            **settings.redis_kwargs(),
        )
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


def _forwarded_chain(request: Request) -> list[str]:
    """Parsed X-Forwarded-For entries across duplicate headers.

    Router 2.0 combines duplicate header fields (RFC 7230) and appends the
    address it saw at the right of the combined list, so every value must be
    joined before the last entry is read.
    """
    values = request.headers.getlist("x-forwarded-for")
    return [
        part.strip()
        for value in values
        for part in value.split(",")
        if part.strip()
    ]


def client_key(request: Request) -> str:
    """Bucket key identity for one request.

    `xff_rightmost` (Heroku): the router appends the address it saw to the
    right of any client-supplied header, so the last entry is the only one
    that cannot be forged. A shorter/absent header falls back to the peer.

    `xff_trusted_walk` (compose): each trusted proxy appends the peer it saw
    to X-Forwarded-For; the rightmost `RATE_LIMIT_TRUSTED_PROXIES` entries
    are therefore trusted proxy chains, and the entry before them is the
    client as the innermost trusted proxy saw it. XFF shorter than that
    walks the chain back to the leftmost entry.

    `peer` keeps the raw TCP peer; with RATE_LIMIT_TRUSTED_PROXIES > 0 it
    retains the ticket-22 walk for configs that only set the hop count.
    """
    direct = request.client.host if request.client else "unknown"
    source = settings.RATE_LIMIT_CLIENT_IP_SOURCE
    if source == "peer" and settings.RATE_LIMIT_TRUSTED_PROXIES <= 0:
        return direct
    chain = _forwarded_chain(request)
    if not chain:
        return direct
    if source == "xff_rightmost":
        return chain[-1]
    hops = settings.RATE_LIMIT_TRUSTED_PROXIES
    if hops <= 0:
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
