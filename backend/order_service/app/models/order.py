import uuid
from datetime import datetime, timezone, date
from decimal import Decimal
from sqlalchemy import (
    Boolean, CheckConstraint, Column, Date, DateTime, ForeignKey,
    Integer, Numeric, String, Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.database import Base


class Address(Base):
    __tablename__ = "addresses"

    address_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    full_name = Column(String(255), nullable=False)
    phone = Column(String(20), nullable=False)
    address_line1 = Column(Text, nullable=False)
    address_line2 = Column(Text)
    city = Column(String(100), nullable=False)
    state = Column(String(100), nullable=False)
    pincode = Column(String(10), nullable=False, index=True)
    country = Column(String(60), nullable=False, default="India")
    latitude = Column(Numeric(10, 7), nullable=True)
    longitude = Column(Numeric(10, 7), nullable=True)
    is_default = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    orders = relationship("Order", back_populates="shipping_address")


class Order(Base):
    __tablename__ = "orders"

    order_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    total_price = Column(Numeric(12, 2), nullable=False)
    deal_discount = Column(Numeric(12, 2), nullable=False, default=Decimal("0"))
    status = Column(String(20), nullable=False, default="pending", index=True)
    shipping_address_id = Column(UUID(as_uuid=True), ForeignKey("addresses.address_id"), nullable=True)
    tracking_number = Column(Text)
    payment_method = Column(String(30))
    payment_status = Column(String(20), nullable=False, default="pending")
    estimated_delivery = Column(Date)
    razorpay_order_id = Column(String(100), index=True)
    razorpay_payment_id = Column(String(100))
    razorpay_signature = Column(Text)
    cancel_reason = Column(Text, nullable=True)
    return_reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True))

    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    shipping_address = relationship("Address", back_populates="orders")
    status_history = relationship("OrderStatusHistory", back_populates="order", cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','confirmed','dispatched','delivered','cancelled','return_requested','returned')",
            name="ck_order_status",
        ),
        CheckConstraint(
            "payment_status IN ('pending','paid','failed','refunded')",
            name="ck_payment_status",
        ),
    )


class OrderItem(Base):
    __tablename__ = "order_items"

    order_item_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.order_id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(UUID(as_uuid=True), nullable=False)
    product_name = Column(String(255))
    quantity = Column(Integer, nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)

    order = relationship("Order", back_populates="items")


class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"

    history_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.order_id", ondelete="CASCADE"), nullable=False, index=True)
    from_status = Column(String(20))
    to_status = Column(String(20), nullable=False)
    changed_by = Column(UUID(as_uuid=True))
    note = Column(Text)
    changed_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    order = relationship("Order", back_populates="status_history")
