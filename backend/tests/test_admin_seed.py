"""Ticket 02: env admin seed is the only bootstrap path (no public admin signup)."""

from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import Role
from app.services.admin_seed import ensure_admin_seed
from tests.helpers import open_db_session


@pytest_asyncio.fixture
async def db() -> AsyncGenerator[AsyncSession]:
    async with open_db_session() as session:
        yield session
        await session.rollback()


async def test_seed_noop_without_env(db: AsyncSession, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ADMIN_EMAIL", raising=False)
    monkeypatch.delenv("ADMIN_PASSWORD", raising=False)
    assert await ensure_admin_seed(db) is None


async def test_seed_creates_verified_admin_once(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch
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
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ADMIN_EMAIL", "root@majlis.local")
    monkeypatch.setenv("ADMIN_PASSWORD", "root12345")
    with pytest.raises(RuntimeError, match="Invalid ADMIN_EMAIL"):
        await ensure_admin_seed(db)
