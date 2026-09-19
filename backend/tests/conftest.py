import os
import sys
from collections.abc import AsyncGenerator, AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest
import pytest_asyncio
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.core.rate_limit import reset_memory_limits
from app.main import create_app

# Standing decision: tests run against Postgres (same version as prod),
# never SQLite — SQLite hides ENUM/Uuid/TZ/JSONB-class bugs.
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://majlis:majlis@localhost:5432/majlis_test",
)


async def _flush_rate_limits() -> None:
    """Isolate rate-limit counters between tests.

    Counts persist in real Redis across runs (60s TTL); the memory
    fallback reset alone is not enough, otherwise tests flake with 429.
    Only touches the ephemeral `rl:*` counter keys.
    """
    reset_memory_limits()
    try:
        from app.core.rate_limit import get_redis

        r = get_redis()
        keys = await r.keys("rl:*")  # type: ignore[misc]
        if keys:
            await r.delete(*keys)  # type: ignore[misc]
    except Exception:
        pass


@pytest_asyncio.fixture
async def client(monkeypatch: pytest.MonkeyPatch) -> AsyncGenerator[AsyncClient]:
    await _flush_rate_limits()
    engine = create_async_engine(TEST_DATABASE_URL, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():  # type: ignore[no-untyped-def]
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app = create_app()

    # Lifespan would try real DB; tables already created above.
    @asynccontextmanager
    async def noop_lifespan(_app: FastAPI) -> AsyncIterator[None]:
        yield

    app.router.lifespan_context = noop_lifespan
    app.dependency_overrides[get_db] = override_get_db

    # Fake SMTP at seam boundary: capture instead of network.
    import app.core.mail as mail_module
    import app.services.auth_service as auth_service

    sent: list[dict] = []

    def fake_send(to: str, subject: str, body: str) -> None:
        sent.append({"to": to, "subject": subject, "body": body})

    # Fake SMTP at seam boundary: capture instead of network.
    monkeypatch.setattr(mail_module, "send_email", fake_send)
    # auth_service imported `mail` module object, so patching attribute works.
    assert auth_service.mail.send_email is fake_send
    app.state.test_outbox = sent  # type: ignore[attr-defined]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    await _flush_rate_limits()
    await engine.dispose()
