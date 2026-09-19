"""JWT + password hashing per https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/.

Modern stack: PyJWT for tokens, pwdlib[argon2] for passwords (not passlib/jose).
"""

from datetime import UTC, datetime, timedelta

import jwt
from jwt.exceptions import InvalidTokenError
from pwdlib import PasswordHash

from app.core.config import get_settings

settings = get_settings()

password_hash = PasswordHash.recommended()
DUMMY_HASH = password_hash.hash("dummypassword")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return password_hash.verify(plain_password, hashed_password)
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    return password_hash.hash(password)


def _expire(delta: timedelta) -> datetime:
    return datetime.now(UTC) + delta


def create_token(sub: str, purpose: str, expires_delta: timedelta) -> str:
    to_encode = {"sub": sub, "purpose": purpose, "exp": _expire(expires_delta)}
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_access_token(sub: str) -> str:
    return create_token(sub, "access", timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))


def create_refresh_token(sub: str) -> str:
    return create_token(sub, "refresh", timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS))


def create_verification_token(sub: str) -> str:
    return create_token(sub, "verify", timedelta(hours=settings.VERIFICATION_TOKEN_EXPIRE_HOURS))


def create_reset_token(sub: str) -> str:
    return create_token(sub, "reset", timedelta(hours=settings.RESET_TOKEN_EXPIRE_HOURS))


def decode_token(token: str, expected_purpose: str) -> str:
    """Return sub if valid, else raise InvalidTokenError (incl. expired)."""
    payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    if payload.get("purpose") != expected_purpose:
        raise InvalidTokenError("wrong purpose")
    sub = payload.get("sub")
    if not sub:
        raise InvalidTokenError("missing sub")
    return str(sub)
