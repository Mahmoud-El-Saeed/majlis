from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.rate_limit import rate_limit_middleware
from app.services.admin_seed import ensure_admin_seed

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Seed the first admin from env (ticket 02); tables come from migrations."""
    async with AsyncSessionLocal() as session:
        try:
            await ensure_admin_seed(session)
            await session.commit()
        except Exception:
            await session.rollback()
            raise
    yield


def create_app() -> FastAPI:
    app = FastAPI(title="Majlis API", version="0.1.0", lifespan=lifespan)
    app.middleware("http")(rate_limit_middleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.FRONTEND_URL],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(api_router, prefix="/api/v1")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
