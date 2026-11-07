"""Ticket 02: env admin seed is the only bootstrap path (no public admin signup)."""

from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

import app.services.admin_seed as seed_module
from app.core.config import Settings
from app.core.database import Base
from app.models.user import Role
from app.services.admin_seed import ensure_admin_seed
from tests.conftest import TEST_DATABASE_URL
from tests.helpers import open_db_session


@pytest.fixture
def fileless_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    """Isolate the seed from the developer's local `backend/.env`: settings
    read os.environ only, so delenv/setenv fully control the seed."""
    monkeypatch.setattr(seed_module, "get_settings", lambda: Settings(_env_file=None))


@pytest_asyncio.fixture
async def db() -> AsyncGenerator[AsyncSession]:
    """Fresh schema per test so this file also passes on a virgin
    `majlis_test` (it runs before any `client` fixture has created tables);
    the schema is dropped again so the DB is left as we found it."""
    from sqlalchemy.ext.asyncio import create_async_engine

    engine = create_async_engine(TEST_DATABASE_URL, future=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    try:
        async with open_db_session() as session:
            yield session
            await session.rollback()
    finally:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
        await engine.dispose()


async def test_seed_noop_without_env(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch, fileless_settings: None
) -> None:
    monkeypatch.delenv("ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    assert await ensure_admin_seed(db) is None


async def test_seed_creates_verified_admin_once(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch, fileless_settings: None
) -> None:
    monkeypatch.setenv("ADMIN_EMAIL", "root@example.com")
    monkeypatch.setenv("ADMIN_PASSWORD", "root12345")
    admin = await ensure_admin_seed(db)
    assert admin is not None
    assert admin.role == Role.admin
    assert admin.is_verified is True
    await db.commit()

    again = await ensure_admin_seed(db)
    assert again is not None
    assert str(again.id) == str(admin.id)


async def test_seed_rejects_invalid_email_loudly(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch, fileless_settings: None
) -> None:
    monkeypatch.setenv("ADMIN_EMAIL", "root@majlis.local")
    monkeypatch.setenv("ADMIN_PASSWORD", "root12345")
    with pytest.raises(RuntimeError, match="Invalid ADMIN_EMAIL"):
        await ensure_admin_seed(db)
