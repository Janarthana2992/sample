import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime, ForeignKey,
    String, Text, ARRAY,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.database import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), nullable=False, unique=True, index=True)
    phone = Column(String(20))
    full_name = Column(String(255), nullable=False)
    hashed_password = Column(Text, nullable=False)
    role = Column(
        String(20),
        nullable=False,
        default="customer",
        index=True,
    )
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    updated_at = Column(DateTime(timezone=True))

    permissions = relationship(
        "StaffPermission",
        foreign_keys="StaffPermission.user_id",
        back_populates="user",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        CheckConstraint("role IN ('admin','staff','customer')", name="ck_users_role"),
    )


class StaffPermission(Base):
    __tablename__ = "staff_permissions"

    permission_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    module = Column(String(50), nullable=False)
    granted_by = Column(UUID(as_uuid=True), ForeignKey("users.user_id"), nullable=True)
    granted_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )

    user = relationship("User", foreign_keys=[user_id], back_populates="permissions")

    __table_args__ = (
        CheckConstraint(
            "module IN ('reply_reviews','stock_management','deal_management','order_management','product_listing_view')",
            name="ck_staff_perm_module",
        ),
    )


class AuthToken(Base):
    __tablename__ = "auth_tokens"

    token_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(Text, nullable=False, index=True)
    purpose = Column(String(30), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True))
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


class PendingRegistration(Base):
    """Holds signup data until the user confirms their email with an OTP."""
    __tablename__ = "pending_registrations"

    email = Column(String(255), primary_key=True)
    full_name = Column(String(255), nullable=False)
    phone = Column(String(20))
    hashed_password = Column(Text, nullable=False)
    otp_hash = Column(Text, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    attempts = Column(
        # stored as simple int column
        String(5), nullable=False, default="0"
    )
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )


class CaptchaChallenge(Base):
    """Short-lived server-side math captcha. Consumed once."""
    __tablename__ = "captcha_challenges"

    captcha_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    answer_hash = Column(Text, nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True))
    created_at = Column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
