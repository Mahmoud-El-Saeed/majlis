"""Direct-DB helpers for tests (admin/invite setup that has no public API by design)."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from typing import Any

from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models.user import Role
from tests.conftest import TEST_DATABASE_URL


@asynccontextmanager
async def open_db_session() -> AsyncIterator[AsyncSession]:
    """Throwaway session on the Postgres test DB (tables reset per client fixture)."""
    engine = create_async_engine(TEST_DATABASE_URL, future=True)
    try:
        factory = async_sessionmaker(engine, expire_on_commit=False)
        async with factory() as session:
            yield session
    finally:
        await engine.dispose()


async def create_user_in_db(
    email: str,
    password: str,
    role: Role = Role.student,
    verified: bool = True,
) -> str:
    """Insert a user straight into the test DB. Returns the user id."""
    from app.core.security import get_password_hash
    from app.models.user import User

    async with open_db_session() as session:
        user = User(
            email=email.lower(),
            hashed_password=get_password_hash(password),
            role=role,
            is_verified=verified,
        )
        session.add(user)
        await session.commit()
        return str(user.id)


async def expire_invite_in_db(email: str) -> None:
    """Force the active invite for an email to be expired."""
    from app.models.teacher_invite import TeacherInvite

    async with open_db_session() as session:
        await session.execute(
            update(TeacherInvite)
            .where(TeacherInvite.email == email.lower())
            .values(expires_at=datetime.now(UTC).replace(year=2000))
        )
        await session.commit()


async def active_invite_token_hash(email: str) -> str | None:
    from app.models.teacher_invite import TeacherInvite

    async with open_db_session() as session:
        result = await session.execute(
            select(TeacherInvite.token_hash).where(
                TeacherInvite.email == email.lower(),
                TeacherInvite.used_at.is_(None),
            )
        )
        return result.scalars().first()


async def login(client: AsyncClient, email: str, password: str) -> dict[str, Any]:
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def get_outbox(client: AsyncClient) -> list[dict[str, str]]:
    """Fake-SMTP outbox captured at the seam boundary (see conftest)."""
    transport: Any = client._transport  # httpx ASGI transport holds the app
    return transport.app.state.test_outbox
