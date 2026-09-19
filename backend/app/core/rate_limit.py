"""Fixed-window rate limiting on Redis (spec: Redis for rate-limiting).

Falls back to in-memory when Redis is unreachable (tests / local without redis).
User-facing 429 message is Arabic-first.
"""

import time
from collections import defaultdict
from typing import Any, cast

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from redis import asyncio as aioredis

from app.core.config import get_settings

settings = get_settings()

_memory_hits: defaultdict[str, list[float]] = defaultdict(list)
_redis: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis


def _limit_for_path(path: str) -> int:
    if "password-reset" in path:
        return settings.RATE_LIMIT_RESET_PER_MIN
    if "login" in path or "token" in path:
        return settings.RATE_LIMIT_LOGIN_PER_MIN
    return settings.RATE_LIMIT_SIGNUP_PER_MIN


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


async def rate_limit_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
    if not request.url.path.startswith("/api/v1/auth/"):
        return await call_next(request)
    if request.method not in ("POST",):
        return await call_next(request)

    limit = _limit_for_path(request.url.path)
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
        allowed = await _memory_allowed(key, limit)

    if not allowed:
        return JSONResponse(
            status_code=429,
            content={"detail": "طلبات كثيرة جدًا. حاول مرة أخرى بعد دقيقة."},
        )
    response: Response = await call_next(request)
    return response
