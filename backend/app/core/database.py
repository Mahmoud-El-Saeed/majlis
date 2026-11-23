from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()


def build_engine(url: str | None = None) -> AsyncEngine:
    """One engine per process with a pool sized for Heroku Essential-0.

    4 + 2 overflow = 6 connections maximum per process; the plan's 20-slot
    ceiling leaves room for the release dyno and `heroku run`. Pre-ping
    survives Heroku's connection reaping; recycle keeps sessions under the
    provider's lifetime cap.
    """
    return create_async_engine(
        url or settings.database_url(),
        future=True,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_pre_ping=True,
        pool_recycle=settings.DB_POOL_RECYCLE_SEC,
    )


engine = build_engine()
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession]:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
