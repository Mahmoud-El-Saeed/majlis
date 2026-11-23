from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.database import AsyncSessionLocal
from app.core.rate_limit import rate_limit_middleware
from app.core.security_headers import security_headers_middleware
from app.services.admin_seed import ensure_admin_seed

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Seed the first admin from env (ticket 02); tables come from migrations.

    Creates the shared aioboto3 Session for Seam 3 storage (ticket 05).
    The Session itself holds no connections; per-request clients are opened
    with `async with` in the storage dependency and closed on exit.
    """
    import aioboto3

    _app.state.storage_session = aioboto3.Session()
    async with AsyncSessionLocal() as session:
        try:
            await ensure_admin_seed(session)
            await session.commit()
        except Exception:
            await session.rollback()
            raise
    yield


def create_app() -> FastAPI:
    # Ticket 22 (ADR-0009): the interactive API contract (/docs, /redoc,
    # /openapi.json) is a development surface. In production it is disabled
    # so the route/permission map is not published to the internet.
    if settings.APP_ENV == "prod":
        app = FastAPI(
            title="Majlis API",
            version="0.1.0",
            lifespan=lifespan,
            docs_url=None,
            redoc_url=None,
            openapi_url=None,
        )
    else:
        app = FastAPI(title="Majlis API", version="0.1.0", lifespan=lifespan)
    app.middleware("http")(rate_limit_middleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Registered last = outermost user middleware: preflights answered by
    # CORSMiddleware and error responses are stamped too (ticket 25).
    app.middleware("http")(security_headers_middleware)
    app.include_router(api_router, prefix="/api/v1")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
