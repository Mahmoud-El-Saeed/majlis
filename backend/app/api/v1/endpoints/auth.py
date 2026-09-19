from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm

from app.api.dependencies import CurrentUserDep, DbDep
from app.schemas.auth import (
    LoginIn,
    RefreshIn,
    ResetConfirmIn,
    ResetRequestIn,
    SignupIn,
    TokenOut,
    UserOut,
    VerifyIn,
)
from app.services import auth_service
from app.services.auth_service import AuthError

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(user) -> UserOut:  # type: ignore[no-untyped-def]
    return UserOut(
        id=str(user.id),
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        is_verified=user.is_verified,
    )


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(db: DbDep, data: SignupIn) -> dict:
    try:
        user, _ = await auth_service.signup(db, data)
    except AuthError as e:
        raise HTTPException(status_code=400, detail=e.message) from None
    except Exception:
        raise HTTPException(status_code=502, detail="تعذر إرسال بريد التفعيل.") from None
    return {
        "id": str(user.id),
        "email": user.email,
        "message": "تم إنشاء الحساب. تحقق من بريدك للتفعيل.",
    }


@router.post("/verify")
async def verify(db: DbDep, data: VerifyIn) -> dict:
    try:
        await auth_service.verify(db, data.token)
    except AuthError as e:
        raise HTTPException(status_code=400, detail=e.message) from None
    return {"message": "تم تفعيل الحساب. يمكنك تسجيل الدخول."}


@router.post("/login", response_model=TokenOut)
async def login(db: DbDep, data: LoginIn) -> TokenOut:
    try:
        user = await auth_service.authenticate(db, data.email, data.password)
    except AuthError as e:
        raise HTTPException(status_code=401, detail=e.message) from None
    access, refresh = auth_service.tokens_for(user)
    return TokenOut(access_token=access, refresh_token=refresh)


@router.post("/token", response_model=TokenOut)
async def login_for_token(
    db: DbDep,
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
) -> TokenOut:
    # Swagger OAuth2 compatibility: username field carries the email.
    try:
        user = await auth_service.authenticate(db, form.username, form.password)
    except AuthError as e:
        raise HTTPException(
            status_code=401, detail=e.message, headers={"WWW-Authenticate": "Bearer"}
        ) from None
    access, refresh = auth_service.tokens_for(user)
    return TokenOut(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenOut)
async def refresh(db: DbDep, data: RefreshIn) -> TokenOut:
    try:
        access, refresh_token = await auth_service.refresh(db, data.refresh_token)
    except AuthError as e:
        raise HTTPException(status_code=401, detail=e.message) from None
    return TokenOut(access_token=access, refresh_token=refresh_token)


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUserDep) -> UserOut:
    return _user_out(user)


@router.post("/password-reset/request")
async def reset_request(db: DbDep, data: ResetRequestIn) -> dict:
    await auth_service.request_password_reset(db, data.email)
    return {"message": "إذا كان البريد مسجلًا ستصلك رسالة استعادة."}


@router.post("/password-reset/confirm")
async def reset_confirm(db: DbDep, data: ResetConfirmIn) -> dict:
    try:
        await auth_service.confirm_password_reset(db, data.token, data.new_password)
    except AuthError as e:
        raise HTTPException(status_code=400, detail=e.message) from None
    return {"message": "تم تغيير كلمة المرور. سجل الدخول مجددًا."}
