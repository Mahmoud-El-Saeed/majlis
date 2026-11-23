"""Baseline security headers emitted by the API itself (ticket 25).

ADR-0010 put these at the reverse proxy, and compose's nginx still stamps
them. Heroku has no proxy hop we control, so the app stamps the same set on
every response the app layer produces: health, 4xx, and CORS preflights.
Unhandled exceptions are answered by Starlette's outer ServerErrorMiddleware,
which sits above this middleware; nginx hides the upstream copies
(proxy_hide_header) so each response carries exactly one of each. HSTS stays
at the edge (Cloudflare).
"""

from collections.abc import Awaitable, Callable

from fastapi import Request, Response

BASELINE_SECURITY_HEADERS: dict[str, str] = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
}


async def security_headers_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    response = await call_next(request)
    for name, value in BASELINE_SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    return response
