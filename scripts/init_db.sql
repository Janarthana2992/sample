-- =============================================================
-- E-Commerce Platform — PostgreSQL Schema
-- Version: 1.0  |  Engine: PostgreSQL 16+
-- =============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================
-- USERS & AUTH
-- =============================================================

CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    email VARCHAR(255) NOT NULL UNIQUE,
    phone VARCHAR(20),
    full_name VARCHAR(255) NOT NULL,
    hashed_password TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'customer' CHECK (
        role IN ('admin', 'staff', 'customer')
    ),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX idx_users_email ON users (email);

CREATE INDEX idx_users_role ON users (role);

CREATE TABLE IF NOT EXISTS staff_permissions (
    permission_id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id UUID NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    module VARCHAR(50) NOT NULL CHECK (
        module IN (
            'reply_reviews',
            'stock_management',
            'deal_management',
            'order_management',
            'product_listing_view'
        )
    ),
    granted_by UUID REFERENCES users (user_id),
    granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, module)
);

CREATE INDEX idx_staff_perms_user ON staff_permissions (user_id);

-- OTP / password reset tokens
CREATE TABLE IF NOT EXISTS auth_tokens (
    token_id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id UUID NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    purpose VARCHAR(30) NOT NULL CHECK (
        purpose IN (
            'password_reset',
            'email_verify'
        )
    ),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auth_tokens_user ON auth_tokens (user_id);

CREATE INDEX idx_auth_tokens_hash ON auth_tokens (token_hash);

-- =============================================================
-- CATEGORIES
-- =============================================================

CREATE TABLE IF NOT EXISTS categories (
    category_id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(120) NOT NULL UNIQUE,
    parent_id UUID REFERENCES categories (category_id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_categories_parent ON categories (parent_id);

-- =============================================================
-- PRODUCTS
-- =============================================================

CREATE TABLE IF NOT EXISTS products (
    product_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku             VARCHAR(100) NOT NULL UNIQUE,
    name            VARCHAR(200) NOT NULL,
    description     TEXT NOT NULL,
    mrp             DECIMAL(12,2) NOT NULL CHECK (mrp > 0),
    selling_price   DECIMAL(12,2) NOT NULL CHECK (selling_price > 0),
    stock_quantity  INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    stock_status    VARCHAR(20) NOT NULL DEFAULT 'in_stock'
                        CHECK (stock_status IN ('in_stock','low_stock','out_of_stock')),
    weight_kg       DECIMAL(8,3),
    length_cm       DECIMAL(8,2),
    width_cm        DECIMAL(8,2),
    height_cm       DECIMAL(8,2),
    tags            TEXT[],
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_featured     BOOLEAN NOT NULL DEFAULT FALSE,
    is_promoted     BOOLEAN NOT NULL DEFAULT FALSE,
    promotion_priority INTEGER NOT NULL DEFAULT 0,
    promotion_badge VARCHAR(60),
    sales_count     INTEGER NOT NULL DEFAULT 0,
    avg_rating      NUMERIC(3,2) NOT NULL DEFAULT 0,
    review_count    INTEGER NOT NULL DEFAULT 0,
    bayesian_rating NUMERIC(5,4) NOT NULL DEFAULT 0,
    es_synced_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ
);

CREATE INDEX idx_products_sku ON products (sku);

CREATE INDEX idx_products_active ON products (is_active);

CREATE INDEX idx_products_featured ON products (
    is_featured,
    promotion_priority DESC
);

CREATE INDEX idx_products_promoted ON products (
    is_promoted,
    promotion_priority DESC
);

CREATE INDEX idx_products_stock ON products (stock_status);

CREATE INDEX idx_products_created ON products (created_at DESC);

CREATE TABLE IF NOT EXISTS product_categories (
    product_id UUID NOT NULL REFERENCES products (product_id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories (category_id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, category_id)
);

CREATE TABLE IF NOT EXISTS product_images (
    image_id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    product_id UUID NOT NULL REFERENCES products (product_id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_images_product ON product_images (product_id);

-- =============================================================
-- PRODUCT VARIANTS (colour / size SKUs)
-- =============================================================

CREATE TABLE IF NOT EXISTS product_variants (
    variant_id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    product_id UUID NOT NULL REFERENCES products (product_id) ON DELETE CASCADE,
    sku VARCHAR(120) NOT NULL UNIQUE,
    color VARCHAR(80),
    size VARCHAR(80),
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    stock_status VARCHAR(20) NOT NULL DEFAULT 'in_stock' CHECK (
        stock_status IN (
            'in_stock',
            'low_stock',
            'out_of_stock'
        )
    ),
    price_adjustment DECIMAL(10, 2) NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX idx_variants_product ON product_variants (product_id);

CREATE INDEX idx_variants_sku ON product_variants (sku);

-- =============================================================
-- DEALS & OFFERS
-- =============================================================

CREATE TABLE IF NOT EXISTS deals (
    deal_id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    name VARCHAR(200) NOT NULL,
    deal_type VARCHAR(30) NOT NULL CHECK (
        deal_type IN (
            'percentage',
            'flat',
            'bogo',
            'free_shipping'
        )
    ),
    applies_to VARCHAR(20) NOT NULL CHECK (
        applies_to IN (
            'all_products',
            'specific_category',
            'specific_skus'
        )
    ),
    discount_value DECIMAL(10, 2),
    min_cart_value DECIMAL(10, 2),
    start_datetime TIMESTAMPTZ NOT NULL,
    end_datetime TIMESTAMPTZ NOT NULL,
    max_uses INTEGER,
    current_uses INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    staff_visible BOOLEAN NOT NULL DEFAULT FALSE,
    created_by UUID REFERENCES users (user_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ,
    CHECK (end_datetime > start_datetime)
);

CREATE INDEX idx_deals_active ON deals (
    is_active,
    start_datetime,
    end_datetime
);

CREATE TABLE IF NOT EXISTS deal_categories (
    deal_id UUID NOT NULL REFERENCES deals (deal_id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories (category_id) ON DELETE CASCADE,
    PRIMARY KEY (deal_id, category_id)
);

CREATE TABLE IF NOT EXISTS deal_skus (
    deal_id UUID NOT NULL REFERENCES deals (deal_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products (product_id) ON DELETE CASCADE,
    PRIMARY KEY (deal_id, product_id)
);

-- =============================================================
-- REVIEWS & RATINGS
-- =============================================================

CREATE TABLE IF NOT EXISTS reviews (
    review_id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    product_id UUID NOT NULL REFERENCES products (product_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users (user_id),
    order_id UUID NOT NULL,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review_text TEXT,
    is_flagged BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ,
    UNIQUE (product_id, user_id, order_id)
);

CREATE INDEX idx_reviews_product ON reviews (product_id);

CREATE INDEX idx_reviews_user ON reviews (user_id);

CREATE TABLE IF NOT EXISTS review_replies (
    reply_id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    review_id UUID NOT NULL UNIQUE REFERENCES reviews (review_id) ON DELETE CASCADE,
    replied_by UUID NOT NULL REFERENCES users (user_id),
    reply_text TEXT NOT NULL,
    is_retracted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ
);

-- Audit log for review reply actions
CREATE TABLE IF NOT EXISTS review_reply_audit (
    audit_id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    review_id UUID NOT NULL REFERENCES reviews (review_id),
    actor_id UUID NOT NULL REFERENCES users (user_id),
    action VARCHAR(20) NOT NULL CHECK (
        action IN (
            'created',
            'edited',
            'retracted'
        )
    ),
    old_text TEXT,
    new_text TEXT,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- ADDRESSES
-- =============================================================

CREATE TABLE IF NOT EXISTS addresses (
    address_id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id UUID NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    full_name VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    address_line1 TEXT NOT NULL,
    address_line2 TEXT,
    city VARCHAR(100) NOT NULL,
    state VARCHAR(100) NOT NULL,
    pincode VARCHAR(10) NOT NULL,
    country VARCHAR(60) NOT NULL DEFAULT 'India',
    latitude DECIMAL(10, 7),
    longitude DECIMAL(10, 7),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_addresses_user ON addresses (user_id);

CREATE INDEX idx_addresses_pincode ON addresses (pincode);

-- =============================================================
-- ORDERS
-- =============================================================

CREATE TABLE IF NOT EXISTS orders (
    order_id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id UUID NOT NULL REFERENCES users (user_id),
    total_price DECIMAL(12, 2) NOT NULL CHECK (total_price >= 0),
    deal_discount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
        status IN (
            'pending',
            'confirmed',
            'dispatched',
            'delivered',
            'cancelled',
            'return_requested',
            'returned'
        )
    ),
    shipping_address_id UUID REFERENCES addresses (address_id),
    tracking_number TEXT,
    payment_method VARCHAR(30) CHECK (
        payment_method IN (
            'upi',
            'card',
            'net_banking',
            'cod'
        )
    ),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (
        payment_status IN (
            'pending',
            'paid',
            'failed',
            'refunded'
        )
    ),
    razorpay_order_id VARCHAR(100),
    razorpay_payment_id VARCHAR(100),
    razorpay_signature VARCHAR(255),
    estimated_delivery DATE,
    cancel_reason TEXT,
    return_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ
);

CREATE INDEX idx_orders_user ON orders (user_id);

CREATE INDEX idx_orders_status ON orders (status);

CREATE INDEX idx_orders_created ON orders (created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
    order_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    order_id UUID NOT NULL REFERENCES orders (order_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products (product_id),
    product_name VARCHAR(200),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price DECIMAL(12, 2) NOT NULL CHECK (unit_price > 0)
);

CREATE INDEX idx_order_items_order ON order_items (order_id);

CREATE INDEX idx_order_items_product ON order_items (product_id);

-- Status transition audit
CREATE TABLE IF NOT EXISTS order_status_history (
    history_id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    order_id UUID NOT NULL REFERENCES orders (order_id) ON DELETE CASCADE,
    from_status VARCHAR(20),
    to_status VARCHAR(20) NOT NULL,
    changed_by UUID REFERENCES users (user_id),
    note TEXT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_history_order ON order_status_history (order_id);

-- =============================================================
-- AI SERVICE — view / purchase tracking
-- =============================================================

CREATE TABLE IF NOT EXISTS user_product_events (
    event_id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
    user_id UUID NOT NULL REFERENCES users (user_id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products (product_id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL CHECK (
        event_type IN (
            'view',
            'purchase',
            'cart_add'
        )
    ),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_user ON user_product_events (user_id, event_type);

CREATE INDEX idx_events_product ON user_product_events (product_id);

-- =============================================================
-- PINCODE MASTER (for delivery map)
-- =============================================================

CREATE TABLE IF NOT EXISTS pincodes (
    pincode VARCHAR(10) PRIMARY KEY,
    city VARCHAR(100),
    district VARCHAR(100),
    state VARCHAR(100),
    latitude DECIMAL(9, 6),
    longitude DECIMAL(9, 6),
    delivery_sla_days INTEGER DEFAULT 3,
    is_serviceable BOOLEAN NOT NULL DEFAULT TRUE
);

-- =============================================================
-- SEED: Default Admin Account
-- Password: Admin@123456  (bcrypt hash, cost=12)
-- CHANGE THIS IMMEDIATELY IN PRODUCTION
-- =============================================================
INSERT INTO
    users (
        email,
        full_name,
        hashed_password,
        role
    )
VALUES (
        'admin@ecommerce.com',
        'Platform Admin',
        '$2b$12$PWNp2WaN.iPPdOom169oqOm3wbatUaFxXeHMqq04M3nG4UW0TMYEW',
        'admin'
    )
ON CONFLICT (email) DO NOTHING;
-- END OF SEED
SELECT 1
    ) ON CONFLICT (email) DO NOTHING;