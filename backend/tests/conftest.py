import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.database import Base, get_db
from app.core.rate_limit import reset_memory_limits
from app.main import create_app

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture
async def client():
    reset_memory_limits()
    engine = create_async_engine(TEST_DATABASE_URL, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app = create_app()
    # Lifespan would try real DB; tables already created above.
    app.router.lifespan_context = None  # type: ignore[attr-defined]
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def noop_lifespan(_app):  # type: ignore[no-untyped-def]
        yield

    app.router.lifespan_context = noop_lifespan
    app.dependency_overrides[get_db] = override_get_db

    # Fake SMTP at seam boundary: capture instead of network.
    import app.core.mail as mail_module
    import app.services.auth_service as auth_service

    sent: list[dict] = []

    def fake_send(to: str, subject: str, body: str) -> None:
        sent.append({"to": to, "subject": subject, "body": body})

    mail_module.send_email = fake_send  # type: ignore[method-assign]
    # auth_service imported `mail` module object, so patching attribute works.
    assert auth_service.mail.send_email is fake_send
    app.state.test_outbox = sent  # type: ignore[attr-defined]

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    await engine.dispose()
