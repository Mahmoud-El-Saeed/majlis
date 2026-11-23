"""Ticket 25: the API emits ADR-0010's headers itself and admits both
production frontend origins.

On Heroku there is no nginx hop to stamp security headers, so the app must
do it on every response — including CORS preflights and errors. The two
production origins are the custom domain and the Pages alias; anything
else must be refused.
"""

from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings
from app.core.security_headers import BASELINE_SECURITY_HEADERS

PROD_ORIGINS = ("https://majlis.elsaeed.dev", "https://majlis-elsaeed.pages.dev")


def _client(monkeypatch: pytest.MonkeyPatch, **overrides: object) -> AsyncClient:
    from app import main as app_main

    monkeypatch.setattr(
        app_main,
        "settings",
        Settings(_env_file=None, **overrides),
    )
    return AsyncClient(
        transport=ASGITransport(app=app_main.create_app()),
        base_url="http://test",
    )


@pytest_asyncio.fixture
async def api(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    client = _client(
        monkeypatch,
        FRONTEND_URL="https://majlis.elsaeed.dev/",
        CORS_ORIGINS="https://majlis-elsaeed.pages.dev",
    )
    async with client:
        yield client


def _preflight(origin: str) -> dict[str, str]:
    return {
        "Origin": origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    }


async def test_health_carries_the_baseline_security_headers(api: AsyncClient) -> None:
    response = await api.get("/health")

    assert response.status_code == 200
    for name, value in BASELINE_SECURITY_HEADERS.items():
        assert response.headers[name] == value


async def test_error_responses_carry_the_baseline_security_headers(api: AsyncClient) -> None:
    response = await api.get("/does-not-exist")

    assert response.status_code == 404
    for name, value in BASELINE_SECURITY_HEADERS.items():
        assert response.headers[name] == value


async def test_cors_preflight_allows_both_production_origins(api: AsyncClient) -> None:
    for origin in PROD_ORIGINS:
        response = await api.options("/api/v1/auth/login", headers=_preflight(origin))

        assert response.status_code == 200, origin
        assert response.headers["access-control-allow-origin"] == origin
        # The preflight is answered by CORSMiddleware before routing; the
        # outermost security middleware must still stamp it.
        assert response.headers["x-content-type-options"] == "nosniff"


async def test_cors_preflight_refuses_a_foreign_origin(api: AsyncClient) -> None:
    response = await api.options(
        "/api/v1/auth/login",
        headers=_preflight("https://evil.example"),
    )

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_compose_nginx_stamps_the_same_baseline_headers() -> None:
    """ADR-0010's coupling guard: the five values exist in Python and nginx.

    `proxy_hide_header` keeps the proxied response single-source, but nginx's
    own `add_header` is what the browser sees on the compose origin. Drift
    between the two lists would silently weaken one deployment.
    """
    nginx = (Path(__file__).resolve().parents[2] / "infra" / "nginx.conf").read_text()

    for name, value in BASELINE_SECURITY_HEADERS.items():
        assert f'add_header {name} "{value}" always;' in nginx

