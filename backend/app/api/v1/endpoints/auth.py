from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.api.dependencies import CurrentUserDep, DbDep
from app.models.user import User
from app.schemas.auth import (
    LoginIn,
    MessageOut,
    RefreshIn,
    ResetConfirmIn,
    ResetRequestIn,
    SignupIn,
    SignupOut,
    TokenOut,
    UserOut,
    VerifyIn,
)
from app.services import auth_service
from app.services.auth_service import AuthError

router = APIRouter(prefix="/auth", tags=["auth"])


def to_user_out(user: User) -> UserOut:
    return UserOut(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_verified=user.is_verified,
    )


def issue_tokens(user: User) -> TokenOut:
    access, refresh = auth_service.tokens_for(user)
    return TokenOut(access_token=access, refresh_token=refresh)


@router.post("/signup", status_code=status.HTTP_201_CREATED, response_model=SignupOut)
async def signup(db: DbDep, data: SignupIn) -> SignupOut:
    try:
        user, _ = await auth_service.signup(db, data)
    except AuthError as e:
        raise HTTPException(status_code=400, detail=e.message) from None
    except Exception:
        raise HTTPException(status_code=502, detail="Failed to send activation email.") from None
    return SignupOut(
        id=str(user.id),
        email=user.email,
        message="Account created. Check your email to activate.",
    )


@router.post("/verify", response_model=MessageOut)
async def verify(db: DbDep, data: VerifyIn) -> MessageOut:
    try:
        await auth_service.verify(db, data.token)
    except AuthError as e:
        raise HTTPException(status_code=400, detail=e.message) from None
    return MessageOut(message="Account activated. You can now log in.")


@router.post("/login", response_model=TokenOut)
async def login(db: DbDep, data: LoginIn) -> TokenOut:
    try:
        user = await auth_service.authenticate(db, data.email, data.password)
    except AuthError as e:
        raise HTTPException(status_code=401, detail=e.message) from None
    return issue_tokens(user)


@router.post("/token", response_model=TokenOut)
async def login_for_token(
    db: DbDep,
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> TokenOut:
    # OAuth2 compatibility for Swagger "Authorize": username carries the email.
    # Kept alongside /login (the primary student seam) because
    # OAuth2PasswordBearer requires a form-data token endpoint for docs auth.
    try:
        user = await auth_service.authenticate(db, form.username, form.password)
    except AuthError as e:
        raise HTTPException(
            status_code=401, detail=e.message, headers={"WWW-Authenticate": "Bearer"}
        ) from None
    return issue_tokens(user)


@router.post("/refresh", response_model=TokenOut)
async def refresh(db: DbDep, data: RefreshIn) -> TokenOut:
    try:
        access, refresh_token = await auth_service.refresh(db, data.refresh_token)
    except AuthError as e:
        raise HTTPException(status_code=401, detail=e.message) from None
    return TokenOut(access_token=access, refresh_token=refresh_token)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUserDep) -> UserOut:
    return to_user_out(user)


@router.post("/password-reset/request", response_model=MessageOut)
async def reset_request(db: DbDep, data: ResetRequestIn) -> MessageOut:
    await auth_service.request_password_reset(db, data.email)
    return MessageOut(message="If the email is registered, you will receive a reset message.")


@router.post("/password-reset/confirm", response_model=MessageOut)
async def reset_confirm(db: DbDep, data: ResetConfirmIn) -> MessageOut:
    try:
        await auth_service.confirm_password_reset(db, data.token, data.new_password)
    except AuthError as e:
        raise HTTPException(status_code=400, detail=e.message) from None
    return MessageOut(message="Password changed. Please log in again.")
