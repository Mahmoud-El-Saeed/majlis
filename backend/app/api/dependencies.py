from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
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
