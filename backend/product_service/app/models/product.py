import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Boolean, CheckConstraint, Column, DateTime, ForeignKey,
    Integer, Numeric, String, Text, ARRAY, SmallInteger,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.database import Base


class Category(Base):
    __tablename__ = "categories"

    category_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False, unique=True)
    slug = Column(String(120), nullable=False, unique=True)
    parent_id = Column(UUID(as_uuid=True), ForeignKey("categories.category_id"), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    children = relationship("Category", back_populates="parent")
    parent = relationship("Category", back_populates="children", remote_side="Category.category_id")


class Product(Base):
    __tablename__ = "products"

    product_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    sku = Column(String(100), nullable=False, unique=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    mrp = Column(Numeric(12, 2), nullable=False)
    selling_price = Column(Numeric(12, 2), nullable=False)
    stock_quantity = Column(Integer, nullable=False, default=0)
    stock_status = Column(String(20), nullable=False, default="in_stock")
    weight_kg = Column(Numeric(8, 3))
    length_cm = Column(Numeric(8, 2))
    width_cm = Column(Numeric(8, 2))
    height_cm = Column(Numeric(8, 2))
    tags = Column(ARRAY(String), default=list)
    is_active = Column(Boolean, nullable=False, default=True)
    is_featured = Column(Boolean, nullable=False, default=False)
    is_promoted = Column(Boolean, nullable=False, default=False)
    promotion_priority = Column(Integer, nullable=False, default=0)
    promotion_badge = Column(String(60))
    sales_count = Column(Integer, nullable=False, default=0)
    es_synced_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True))

    images = relationship("ProductImage", back_populates="product", cascade="all, delete-orphan", order_by="ProductImage.sort_order")
    product_categories = relationship("ProductCategory", back_populates="product", cascade="all, delete-orphan")
    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan", order_by="ProductVariant.created_at")

    __table_args__ = (
        CheckConstraint("stock_status IN ('in_stock','low_stock','out_of_stock')", name="ck_product_stock_status"),
        CheckConstraint("mrp > 0", name="ck_product_mrp"),
        CheckConstraint("selling_price > 0", name="ck_product_price"),
        CheckConstraint("stock_quantity >= 0", name="ck_product_qty"),
    )


class ProductImage(Base):
    __tablename__ = "product_images"

    image_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.product_id", ondelete="CASCADE"), nullable=False)
    url = Column(Text, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    product = relationship("Product", back_populates="images")


class ProductCategory(Base):
    __tablename__ = "product_categories"

    product_id = Column(UUID(as_uuid=True), ForeignKey("products.product_id", ondelete="CASCADE"), primary_key=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.category_id", ondelete="CASCADE"), primary_key=True)

    product = relationship("Product", back_populates="product_categories")
    category = relationship("Category")


class ProductVariant(Base):
    __tablename__ = "product_variants"

    variant_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.product_id", ondelete="CASCADE"), nullable=False, index=True)
    sku = Column(String(120), nullable=False, unique=True, index=True)
    color = Column(String(80))
    size = Column(String(80))
    stock_quantity = Column(Integer, nullable=False, default=0)
    stock_status = Column(String(20), nullable=False, default="in_stock")
    price_adjustment = Column(Numeric(10, 2), nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True))

    product = relationship("Product", back_populates="variants")

    __table_args__ = (
        CheckConstraint("stock_status IN ('in_stock','low_stock','out_of_stock')", name="ck_variant_stock_status"),
        CheckConstraint("stock_quantity >= 0", name="ck_variant_qty"),
    )


class Deal(Base):
    __tablename__ = "deals"

    deal_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(200), nullable=False)
    deal_type = Column(String(30), nullable=False)
    applies_to = Column(String(20), nullable=False)
    discount_value = Column(Numeric(10, 2))
    min_cart_value = Column(Numeric(10, 2))
    start_datetime = Column(DateTime(timezone=True), nullable=False)
    end_datetime = Column(DateTime(timezone=True), nullable=False)
    max_uses = Column(Integer)
    current_uses = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    staff_visible = Column(Boolean, nullable=False, default=False)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.user_id", use_alter=True, name="fk_deal_created_by"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True))

    deal_categories = relationship("DealCategory", back_populates="deal", cascade="all, delete-orphan")
    deal_skus = relationship("DealSku", back_populates="deal", cascade="all, delete-orphan")


class DealCategory(Base):
    __tablename__ = "deal_categories"

    deal_id = Column(UUID(as_uuid=True), ForeignKey("deals.deal_id", ondelete="CASCADE"), primary_key=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("categories.category_id", ondelete="CASCADE"), primary_key=True)

    deal = relationship("Deal", back_populates="deal_categories")


class DealSku(Base):
    __tablename__ = "deal_skus"

    deal_id = Column(UUID(as_uuid=True), ForeignKey("deals.deal_id", ondelete="CASCADE"), primary_key=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.product_id", ondelete="CASCADE"), primary_key=True)

    deal = relationship("Deal", back_populates="deal_skus")


class Review(Base):
    __tablename__ = "reviews"

    review_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.product_id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=False)
    order_id = Column(UUID(as_uuid=True), nullable=False)
    rating = Column(SmallInteger, nullable=False)
    review_text = Column(Text)
    is_flagged = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True))

    reply = relationship("ReviewReply", back_populates="review", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_review_rating"),
    )


class ReviewReply(Base):
    __tablename__ = "review_replies"

    reply_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    review_id = Column(UUID(as_uuid=True), ForeignKey("reviews.review_id", ondelete="CASCADE"), nullable=False, unique=True)
    replied_by = Column(UUID(as_uuid=True), nullable=False)
    reply_text = Column(Text, nullable=False)
    is_retracted = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True))

    review = relationship("Review", back_populates="reply")


class Event(Base):
    __tablename__ = "events"

    event_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    image_url = Column(String(500))
    register_url = Column(String(500), nullable=False)
    event_date = Column(DateTime(timezone=True))
    is_active = Column(Boolean, nullable=False, default=True)
    created_by = Column(UUID(as_uuid=True))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True))
