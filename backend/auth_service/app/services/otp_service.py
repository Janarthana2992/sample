"""Captcha + OTP helper service.

* Captcha: simple server-generated math challenge (x + y). Answers are hashed
  and stored; consumed exactly once on successful verification.
* OTP: 6-digit numeric code for email verification during registration.

The email delivery is a best-effort log in development. When SMTP credentials
are configured, we attempt delivery via ``aiosmtplib``. Failures fall back to
the log so local development keeps working.
"""
from __future__ import annotations

import hashlib
import logging
import random
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import CaptchaChallenge, PendingRegistration

logger = logging.getLogger(__name__)


# ── Captcha ────────────────────────────────────────────────

def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


async def create_captcha(db: AsyncSession) -> dict:
    """Create a new math challenge. Returns ``{captcha_id, question}``."""
    a = random.randint(1, 9)
    b = random.randint(1, 9)
    question = f"What is {a} + {b}?"
    answer = str(a + b)

    challenge = CaptchaChallenge(
        answer_hash=_hash(answer),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db.add(challenge)
    await db.commit()
    await db.refresh(challenge)
    return {"captcha_id": str(challenge.captcha_id), "question": question}


async def verify_captcha(db: AsyncSession, captcha_id: str, answer: str) -> bool:
    if not captcha_id or answer is None:
        return False
    try:
        cid = uuid.UUID(captcha_id)
    except (ValueError, TypeError):
        return False

    result = await db.execute(
        select(CaptchaChallenge).where(
            CaptchaChallenge.captcha_id == cid,
            CaptchaChallenge.used_at.is_(None),
            CaptchaChallenge.expires_at > datetime.now(timezone.utc),
        )
    )
    challenge = result.scalar_one_or_none()
    if not challenge:
        return False

    ok = _hash(str(answer).strip()) == challenge.answer_hash
    if ok:
        challenge.used_at = datetime.now(timezone.utc)
        await db.commit()
    return ok


# ── OTP / pending registrations ────────────────────────────

def generate_otp() -> str:
    """Return a 6-digit numeric code (zero-padded)."""
    return f"{secrets.randbelow(1_000_000):06d}"


async def upsert_pending_registration(
    db: AsyncSession,
    *,
    email: str,
    full_name: str,
    phone: Optional[str],
    hashed_password: str,
    otp: str,
    ttl_minutes: int = 10,
) -> PendingRegistration:
    email = email.lower().strip()
    existing = await db.get(PendingRegistration, email)
    expires = datetime.now(timezone.utc) + timedelta(minutes=ttl_minutes)
    otp_hash = _hash(otp)

    if existing:
        existing.full_name = full_name
        existing.phone = phone
        existing.hashed_password = hashed_password
        existing.otp_hash = otp_hash
        existing.expires_at = expires
        existing.attempts = "0"
        pending = existing
    else:
        pending = PendingRegistration(
            email=email,
            full_name=full_name,
            phone=phone,
            hashed_password=hashed_password,
            otp_hash=otp_hash,
            expires_at=expires,
            attempts="0",
        )
        db.add(pending)

    await db.commit()
    await db.refresh(pending)
    return pending


async def consume_pending_registration(
    db: AsyncSession, email: str, otp: str
) -> Optional[PendingRegistration]:
    email = email.lower().strip()
    pending = await db.get(PendingRegistration, email)
    if not pending:
        return None
    if pending.expires_at <= datetime.now(timezone.utc):
        return None

    try:
        attempts = int(pending.attempts or "0")
    except ValueError:
        attempts = 0

    if attempts >= 5:
        return None

    if _hash(otp.strip()) != pending.otp_hash:
        pending.attempts = str(attempts + 1)
        await db.commit()
        return None

    return pending


async def delete_pending_registration(db: AsyncSession, email: str) -> None:
    pending = await db.get(PendingRegistration, email.lower().strip())
    if pending:
        await db.delete(pending)
        await db.commit()


# ── Email delivery (best-effort) ───────────────────────────

async def send_otp_email(to_email: str, otp: str) -> None:
    """Send an OTP via SMTP if configured; always log for dev visibility."""
    subject = "Your ShopHere verification code"
    body = (
        f"Hi,\n\nYour ShopHere verification code is: {otp}\n"
        "It expires in 10 minutes.\n\n"
        "If you didn't request this, you can safely ignore this email.\n"
    )
    logger.info("[OTP] %s -> %s", to_email, otp)

    if not (settings.SMTP_HOST and settings.SMTP_USER and settings.SMTP_PASSWORD):
        return

    try:
        import aiosmtplib
        from email.message import EmailMessage

        msg = EmailMessage()
        msg["From"] = settings.SMTP_USER
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.set_content(body)

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            start_tls=True,
        )
    except Exception as exc:
        # Never break the flow because of email delivery issues.
        logger.warning("OTP email delivery failed for %s: %s", to_email, exc)
