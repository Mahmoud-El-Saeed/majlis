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
from app.models.user import User
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
        raise AuthError("هذا البريد مسجل بالفعل.")
    user = User(
        email=email,
        hashed_password=get_password_hash(data.password),
        full_name=data.full_name,
        role="student",
        is_verified=False,
    )
    user = await user_repository.create(db, user)
    token = create_verification_token(str(user.id))
    link = f"{settings.FRONTEND_URL}/verify?token={token}"
    mail.send_email(
        to=email,
        subject="تفعيل حساب مجلس",
        body=f"السلام عليكم،\nفعّل حسابك عبر الرابط:\n{link}\n",
    )
    return user, token


async def verify(db: AsyncSession, token: str) -> User:
    try:
        sub = decode_token(token, "verify")
    except Exception:
        raise AuthError("رابط التفعيل غير صالح أو منتهي.") from None
    user = await user_repository.get_by_id(db, sub)
    if user is None:
        raise AuthError("رابط التفعيل غير صالح أو منتهي.")
    user.is_verified = True
    await db.flush()
    return user


async def authenticate(db: AsyncSession, email: str, password: str) -> User:
    user = await user_repository.get_by_email(db, email.lower())
    if user is None:
        verify_password(password, DUMMY_HASH)
        raise AuthError("بيانات الدخول غير صحيحة.")
    if not verify_password(password, user.hashed_password):
        raise AuthError("بيانات الدخول غير صحيحة.")
    if not user.is_active:
        raise AuthError("الحساب موقوف.")
    if not user.is_verified:
        raise AuthError("فعّل حسابك عبر البريد قبل تسجيل الدخول.")
    return user


def tokens_for(user: User) -> tuple[str, str]:
    return create_access_token(str(user.id)), create_refresh_token(str(user.id))


async def refresh(db: AsyncSession, token: str) -> tuple[str, str]:
    try:
        sub = decode_token(token, "refresh")
    except Exception:
        raise AuthError("جلسة منتهية. سجل الدخول مجددًا.") from None
    user = await user_repository.get_by_id(db, sub)
    if user is None or not user.is_active:
        raise AuthError("جلسة منتهية. سجل الدخول مجددًا.")
    return tokens_for(user)


async def request_password_reset(db: AsyncSession, email: str) -> str | None:
    user = await user_repository.get_by_email(db, email.lower())
    if user is None:
        return None
    token = create_reset_token(str(user.id))
    link = f"{settings.FRONTEND_URL}/reset?token={token}"
    mail.send_email(
        to=user.email,
        subject="استعادة كلمة مرور مجلس",
        body=f"السلام عليكم،\nاستعد كلمة المرور عبر الرابط:\n{link}\n",
    )
    return token


async def confirm_password_reset(db: AsyncSession, token: str, new_password: str) -> None:
    try:
        sub = decode_token(token, "reset")
    except Exception:
        raise AuthError("رابط الاستعادة غير صالح أو منتهي.") from None
    user = await user_repository.get_by_id(db, sub)
    if user is None:
        raise AuthError("رابط الاستعادة غير صالح أو منتهي.")
    user.hashed_password = get_password_hash(new_password)
    await db.flush()
