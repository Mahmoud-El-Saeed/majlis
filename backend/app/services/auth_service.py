import asyncio

from sqlalchemy.ext.asyncio import AsyncSession

from app.core import mail
from app.core.config import get_settings
from app.core.security import (
    DUMMY_HASH,
    create_access_token,
    create_refresh_token,
    create_reset_token,
    create_verification_token,
    decode_token,
    get_password_hash,
    verify_password,
)
from app.models.user import Role, User
from app.repositories.user_repository import user_repository
from app.schemas.auth import SignupIn

settings = get_settings()


class AuthError(Exception):
    def __init__(self, message: str):
        self.message = message


async def signup(db: AsyncSession, data: SignupIn) -> tuple[User, str]:
    email = data.email.lower()
    existing = await user_repository.get_by_email(db, email)
    if existing:
        raise AuthError("Email already registered.")
    # User.id is a Python-side UUID assigned on flush, so flush first to mint
    # the id, send the email, and only then let the request commit. A mail
    # failure raises before anything is committed: the transaction rolls back,
    # no row survives, and the student can simply retry signup.
    user = User(
        email=email,
        hashed_password=get_password_hash(data.password),
        full_name=data.full_name,
        role=Role.student,
        is_verified=False,
    )
    db.add(user)
    await db.flush()
    token = create_verification_token(str(user.id))
    link = f"{settings.FRONTEND_URL}/verify?token={token}"
    await asyncio.to_thread(
        mail.send_email,
        email,
        "تفعيل حساب مجلس",
        f"السلام عليكم ورحمة الله وبركاته،\nفعّل حسابك عبر هذا الرابط:\n\n\n{link}\n",
    )
    await db.refresh(user)
    return user, token


async def verify(db: AsyncSession, token: str) -> User:
    try:
        sub = decode_token(token, "verify")
    except Exception:
        raise AuthError("Invalid or expired activation link.") from None
    user = await user_repository.get_by_id(db, sub)
    if user is None:
        raise AuthError("Invalid or expired activation link.")
    user.is_verified = True
    await db.flush()
    return user


async def authenticate(db: AsyncSession, email: str, password: str) -> User:
    user = await user_repository.get_by_email(db, email.lower())
    if user is None:
        verify_password(password, DUMMY_HASH)
        raise AuthError("Incorrect email or password.")
    if not verify_password(password, user.hashed_password):
        raise AuthError("Incorrect email or password.")
    if not user.is_active:
        raise AuthError("Account disabled.")
    if not user.is_verified:
        raise AuthError("Please verify your email before logging in.")
    return user


def tokens_for(user: User) -> tuple[str, str]:
    return create_access_token(str(user.id)), create_refresh_token(str(user.id))


async def refresh(db: AsyncSession, token: str) -> tuple[str, str]:
    try:
        sub = decode_token(token, "refresh")
    except Exception:
        raise AuthError("Session expired. Please log in again.") from None
    user = await user_repository.get_by_id(db, sub)
    if user is None or not user.is_active:
        raise AuthError("Session expired. Please log in again.")
    return tokens_for(user)


async def request_password_reset(db: AsyncSession, email: str) -> str | None:
    user = await user_repository.get_by_email(db, email.lower())
    if user is None:
        return None
    token = create_reset_token(str(user.id))
    link = f"{settings.FRONTEND_URL}/reset?token={token}"
    await asyncio.to_thread(
        mail.send_email,
        user.email,
        "استعادة كلمة مرور مجلس",
        f"السلام عليكم ورحمة الله وبركاته،\nاستعد كلمة المرور عبر هذا الرابط:\n\n\n{link}\n",
    )
    return token


async def confirm_password_reset(db: AsyncSession, token: str, new_password: str) -> None:
    try:
        sub = decode_token(token, "reset")
    except Exception:
        raise AuthError("Invalid or expired reset link.") from None
    user = await user_repository.get_by_id(db, sub)
    if user is None:
        raise AuthError("Invalid or expired reset link.")
    user.hashed_password = get_password_hash(new_password)
    await db.flush()
