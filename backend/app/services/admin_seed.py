from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import get_password_hash
from app.models.user import Role, User
from app.repositories.user_repository import user_repository

_email_adapter = TypeAdapter(EmailStr)


async def ensure_admin_seed(db: AsyncSession) -> User | None:
    """Create the first admin from env when configured (ticket 02).

    Runs on API startup; no-op when ADMIN_EMAIL/ADMIN_PASSWORD are unset
    or the admin already exists. Public signup can never create admins or
    teachers — this seed is the only bootstrap path.
    """
    settings = get_settings()
    if not settings.ADMIN_EMAIL or not settings.ADMIN_PASSWORD:
        return None
    try:
        email = str(_email_adapter.validate_python(settings.ADMIN_EMAIL)).lower()
    except ValidationError:
        raise RuntimeError(f"Invalid ADMIN_EMAIL: {settings.ADMIN_EMAIL!r}") from None
    existing = await user_repository.get_by_email(db, email)
    if existing is not None:
        return existing
    admin = User(
        email=email,
        hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
        role=Role.admin,
        is_verified=True,
    )
    db.add(admin)
    await db.flush()
    return admin
