import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import pool
from sqlalchemy.engine import create_engine

from alembic import context
from app.core.config import get_settings
from app.core.database import Base
from app.models import user as _user  # noqa: F401

settings = get_settings()
SYNC_URL = settings.DATABASE_URL.replace("+asyncpg", "").replace("+aiosqlite", "")

config = context.config
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(url=SYNC_URL, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    engine = create_engine(SYNC_URL, poolclass=pool.NullPool)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
