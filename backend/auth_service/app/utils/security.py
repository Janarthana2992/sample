from datetime import timedelta, datetime, timezone
from typing import Optional
import hashlib
import secrets

from fastapi import HTTPException, status
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User, AuthToken

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=settings.BCRYPT_ROUNDS)

ALLOWED_MODULES = {
    "reply_reviews",
    "stock_management",
    "deal_management",
    "order_management",
    "product_listing_view",
}

# ---------- Password helpers ----------

def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ---------- JWT ----------

def create_access_token(subject: str, role: str, extra: dict | None = None) -> str:
    payload = {
        "sub": subject,
        "role": role,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc)
        + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES),
        "type": "access",
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def create_refresh_token(subject: str) -> str:
    payload = {
        "sub": subject,
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc)
        + timedelta(days=settings.JWT_REFRESH_TOKEN_EXPIRE_DAYS),
        "type": "refresh",
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc


# ---------- OTP token helpers ----------

def generate_otp_token() -> tuple[str, str]:
    """Returns (plain_token, hashed_token). Store hash; send plain to user."""
    plain = secrets.token_urlsafe(32)
    hashed = hashlib.sha256(plain.encode()).hexdigest()
    return plain, hashed


async def create_auth_token(
    db: AsyncSession, user_id, purpose: str, ttl_minutes: int = 15
) -> str:
    plain, hashed = generate_otp_token()
    expires = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
    token = AuthToken(
        user_id=user_id,
        token_hash=hashed,
        purpose=purpose,
        expires_at=expires,
    )
    db.add(token)
    await db.commit()
    return plain


async def consume_auth_token(
    db: AsyncSession, plain_token: str, purpose: str
) -> Optional[AuthToken]:
    hashed = hashlib.sha256(plain_token.encode()).hexdigest()
    result = await db.execute(
        select(AuthToken).where(
            AuthToken.token_hash == hashed,
            AuthToken.purpose == purpose,
            AuthToken.used_at.is_(None),
            AuthToken.expires_at > datetime.now(timezone.utc),
        )
    )
    token = result.scalar_one_or_none()
    if token:
        token.used_at = datetime.now(timezone.utc)
        await db.commit()
    return token
