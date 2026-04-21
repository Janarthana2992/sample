from datetime import datetime, timezone
import time

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.models.user import User
from app.schemas.auth import (
    CaptchaResponse,
    ChangePasswordRequest,
    LoginRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    RefreshRequest,
    RegisterRequest,
    RegisterVerifyRequest,
    ResendOtpRequest,
    TokenResponse,
    UserResponse,
    UserUpdateRequest,
)
from app.services.otp_service import (
    consume_pending_registration,
    create_captcha,
    delete_pending_registration,
    generate_otp,
    send_otp_email,
    upsert_pending_registration,
    verify_captcha,
)
from app.utils.rbac import get_current_user
from app.utils.security import (
    consume_auth_token,
    create_access_token,
    create_auth_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Captcha ────────────────────────────────────────────────

@router.get("/captcha", response_model=CaptchaResponse)
async def issue_captcha(db: AsyncSession = Depends(get_db)):
    return await create_captcha(db)


# ── In-memory failed-login tracker (per email+ip) ──────────
# After N failures we require a captcha on the next login attempt.

_FAILED_LOGIN_THRESHOLD = 3
_FAILED_LOGIN_TTL_SECONDS = 15 * 60
_failed_login_counter: dict[str, tuple[float, int]] = {}


def _failed_key(email: str, request: Request) -> str:
    ip = (request.client.host if request.client else "-") or "-"
    return f"{email.lower()}::{ip}"


def _needs_captcha(key: str) -> bool:
    entry = _failed_login_counter.get(key)
    if not entry:
        return False
    ts, count = entry
    if time.time() - ts > _FAILED_LOGIN_TTL_SECONDS:
        _failed_login_counter.pop(key, None)
        return False
    return count >= _FAILED_LOGIN_THRESHOLD


def _record_failed_login(key: str) -> int:
    ts, count = _failed_login_counter.get(key, (time.time(), 0))
    if time.time() - ts > _FAILED_LOGIN_TTL_SECONDS:
        count = 0
    count += 1
    _failed_login_counter[key] = (time.time(), count)
    return count


def _clear_failed_login(key: str) -> None:
    _failed_login_counter.pop(key, None)


# ── Registration (2 step: init → verify) ───────────────────

@router.post("/register", status_code=status.HTTP_202_ACCEPTED)
async def register_init(payload: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Step 1: validate data, verify captcha, send OTP to email."""
    if not await verify_captcha(db, payload.captcha_id, payload.captcha_answer):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Captcha verification failed — please try again",
        )

    email = payload.email.lower()
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    otp = generate_otp()
    await upsert_pending_registration(
        db,
        email=email,
        full_name=payload.full_name.strip(),
        phone=payload.phone,
        hashed_password=hash_password(payload.password),
        otp=otp,
    )
    await send_otp_email(email, otp)

    response: dict = {"message": "OTP sent to your email", "email": email, "expires_in_seconds": 600}
    # Dev-mode convenience so the UI can display the OTP when no SMTP is configured.
    from app.config import settings as _settings
    if _settings.ENVIRONMENT == "development" and not _settings.SMTP_USER:
        response["dev_otp"] = otp
    return response


@router.post("/register/verify", response_model=TokenResponse)
async def register_verify(payload: RegisterVerifyRequest, db: AsyncSession = Depends(get_db)):
    """Step 2: confirm OTP and create the account."""
    pending = await consume_pending_registration(db, payload.email, payload.otp)
    if not pending:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification code",
        )

    # Ensure nobody grabbed this email in the meantime.
    existing = await db.execute(select(User).where(User.email == pending.email))
    if existing.scalar_one_or_none():
        await delete_pending_registration(db, pending.email)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    user = User(
        email=pending.email,
        full_name=pending.full_name,
        phone=pending.phone,
        hashed_password=pending.hashed_password,
        role="customer",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    await delete_pending_registration(db, pending.email)

    access = create_access_token(str(user.user_id), user.role)
    refresh = create_refresh_token(str(user.user_id))
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/register/resend", status_code=status.HTTP_202_ACCEPTED)
async def register_resend(payload: ResendOtpRequest, db: AsyncSession = Depends(get_db)):
    """Re-issue a fresh OTP for an existing pending registration."""
    from app.models.user import PendingRegistration
    pending = await db.get(PendingRegistration, payload.email.lower().strip())
    if not pending:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No pending registration for this email")

    otp = generate_otp()
    await upsert_pending_registration(
        db,
        email=pending.email,
        full_name=pending.full_name,
        phone=pending.phone,
        hashed_password=pending.hashed_password,
        otp=otp,
    )
    await send_otp_email(pending.email, otp)

    response: dict = {"message": "OTP re-sent"}
    from app.config import settings as _settings
    if _settings.ENVIRONMENT == "development" and not _settings.SMTP_USER:
        response["dev_otp"] = otp
    return response


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, request: Request, db: AsyncSession = Depends(get_db)):
    key = _failed_key(payload.email, request)

    if _needs_captcha(key):
        if not payload.captcha_id or not payload.captcha_answer:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Captcha required after repeated failed attempts",
                headers={"X-Captcha-Required": "1"},
            )
        if not await verify_captcha(db, payload.captcha_id, payload.captcha_answer):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Captcha verification failed",
                headers={"X-Captcha-Required": "1"},
            )

    result = await db.execute(select(User).where(User.email == payload.email.lower()))
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        count = _record_failed_login(key)
        detail = "Invalid credentials"
        headers = {}
        if count >= _FAILED_LOGIN_THRESHOLD:
            headers["X-Captcha-Required"] = "1"
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=detail,
            headers=headers,
        )
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account suspended")

    _clear_failed_login(key)
    access = create_access_token(str(user.user_id), user.role)
    refresh = create_refresh_token(str(user.user_id))
    return TokenResponse(access_token=access, refresh_token=refresh)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    try:
        token_data = decode_token(payload.refresh_token)
    except HTTPException:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    if token_data.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    result = await db.execute(select(User).where(User.user_id == token_data["sub"]))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    access = create_access_token(str(user.user_id), user.role)
    new_refresh = create_refresh_token(str(user.user_id))
    return TokenResponse(access_token=access, refresh_token=new_refresh)


@router.post("/password-reset/request", status_code=status.HTTP_202_ACCEPTED)
async def request_password_reset(payload: PasswordResetRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email.lower()))
    user = result.scalar_one_or_none()
    # Always respond 202 to avoid email enumeration
    if user:
        plain_token = await create_auth_token(db, user.user_id, "password_reset", ttl_minutes=15)
        # In production, send email here via email_service
        # await email_service.send_password_reset(user.email, plain_token)
    return {"message": "If the email exists, a reset link has been sent"}


@router.post("/password-reset/confirm")
async def confirm_password_reset(payload: PasswordResetConfirm, db: AsyncSession = Depends(get_db)):
    token_record = await consume_auth_token(db, payload.token, "password_reset")
    if not token_record:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired token")

    result = await db.execute(select(User).where(User.user_id == token_record.user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.hashed_password = hash_password(payload.new_password)
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return {"message": "Password updated successfully"}


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)):
    return user


@router.patch("/me", response_model=UserResponse)
async def update_me(
    payload: UserUpdateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.full_name is not None:
        user.full_name = payload.full_name
    if payload.phone is not None:
        user.phone = payload.phone
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/me/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password incorrect")
    user.hashed_password = hash_password(payload.new_password)
    user.updated_at = datetime.now(timezone.utc)
    await db.commit()
