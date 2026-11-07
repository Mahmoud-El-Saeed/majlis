"""Ticket 22: the interactive API contract ships only outside production.

`/docs`, `/redoc` and `/openapi.json` are development surfaces: publishing
them in production leaks the whole route/permission map. ADR-0009 records
the decision; compose runs the API with APP_ENV=prod.
"""

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.core.config import Settings


async def _http_for(monkeypatch: pytest.MonkeyPatch, env: str) -> AsyncClient:
    """Build the app under a chosen APP_ENV (create_app reads module-level
    settings) and hand back a client bound to it."""
    from app import main as app_main

    monkeypatch.setattr(app_main, "settings", Settings(APP_ENV=env, _env_file=None))
    transport = ASGITransport(app=app_main.create_app())
    return AsyncClient(transport=transport, base_url="http://test")


@pytest_asyncio.fixture
async def dev_http(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    client = await _http_for(monkeypatch, "dev")
    async with client:
        yield client


@pytest_asyncio.fixture
async def prod_http(monkeypatch: pytest.MonkeyPatch) -> AsyncIterator[AsyncClient]:
    client = await _http_for(monkeypatch, "prod")
    async with client:
        yield client


async def test_dev_serves_docs(dev_http: AsyncClient) -> None:
    assert (await dev_http.get("/openapi.json")).status_code == 200
    assert (await dev_http.get("/docs")).status_code == 200
    assert (await dev_http.get("/redoc")).status_code == 200


async def test_prod_hits_health_not_docs(prod_http: AsyncClient) -> None:
    assert (await prod_http.get("/health")).status_code == 200
    assert (await prod_http.get("/openapi.json")).status_code == 404
    assert (await prod_http.get("/docs")).status_code == 404
    assert (await prod_http.get("/redoc")).status_code == 404
