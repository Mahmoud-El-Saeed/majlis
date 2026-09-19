"""Fixed-window rate limiting on Redis (spec: Redis for rate-limiting).

Only the ticket-01 public endpoints are limited: signup, login/token, and
password-reset. Verify/refresh/me are cheap authenticated-or-token reads and
are deliberately NOT limited.
Falls back to in-memory when Redis is unreachable (tests / local without
redis) and logs a warning instead of failing silently.
Backend messages stay English; the frontend localizes them (default Arabic).
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
}


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

    client = request.client.host if request.client else "unknown"
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
