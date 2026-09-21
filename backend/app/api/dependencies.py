from collections.abc import AsyncGenerator, Awaitable, Callable
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.core.storage_client import Aioboto3StorageClient, StorageClient, build_s3_client_kwargs
from app.models.user import Role, User
from app.repositories.user_repository import user_repository

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token")

DbDep = Annotated[AsyncSession, Depends(get_db)]
TokenDep = Annotated[str, Depends(oauth2_scheme)]


async def get_current_user(db: DbDep, token: TokenDep) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate session.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        sub = decode_token(token, "access")
    except Exception:
        raise credentials_exception from None
    user = await user_repository.get_by_id(db, sub)
    if user is None or not user.is_active:
        raise credentials_exception
    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: Role) -> Callable[[User], Awaitable[User]]:
    """Role gate. Admin passes every gate (capability hierarchy)."""

    async def check_roles(user: CurrentUserDep) -> User:
        if user.role != Role.admin and user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin access required." if roles == (Role.admin,) else "Not authorized.",
            )
        return user

    return check_roles


AdminDep = Annotated[User, Depends(require_roles(Role.admin))]


def _storage_session(app: object) -> Any:
    """Global aioboto3 Session from lifespan; lazily created so tests with a
    noop lifespan still resolve the dependency (overridden by a fake anyway)."""
    import aioboto3

    state = getattr(app, "state", None)
    session = getattr(state, "storage_session", None) if state is not None else None
    if session is None:
        session = aioboto3.Session()
        if state is not None:
            state.storage_session = session
    return session


async def get_storage_client(request: Request) -> AsyncGenerator[StorageClient]:
    """Per-request S3 client with `async with` cleanup (no leaks).

    The global Session is cheap and shared; the client holds connections and
    is closed when the request scope exits.
    """
    from app.core.config import get_settings

    session = _storage_session(request.app)
    kwargs = build_s3_client_kwargs()
    settings = get_settings()
    async with session.client("s3", **kwargs) as s3:  # type: ignore[misc]
        yield Aioboto3StorageClient(s3, settings.S3_BUCKET)


StorageDep = Annotated[StorageClient, Depends(get_storage_client)]
