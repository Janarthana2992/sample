you are a tech lead , mastering in fastapi , ai tech , react , postgres , redis , docker , you are given a project to do # E-Commerce Platform — Product Requirements Document
 use redis for cache, frontend -react , backend - fastapi, always maintain a current functionality of the product in seperate doc , alwaays maintain api endpoint doc at each level,

 maintain a clear standard industry architecture throughout the project , always keep security as a concern , look edge cases also 
**Version:** 1.0 — Draft  
**Date:** April 2026  
**Status:** For Review  
**Classification:** Confidential

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Goals & Success Metrics](#2-goals--success-metrics)
3. [User Personas & Role-Based Access Control](#3-user-personas--role-based-access-control)
4. [Admin Portal](#4-admin-portal)
5. [Staff Portal](#5-staff-portal)
6. [Customer Portal](#6-customer-portal)
7. [Microservices Specification](#7-microservices-specification)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Out of Scope for v1.0](#9-out-of-scope-for-v10)
10. [Open Questions](#10-open-questions)
11. [Revision History](#11-revision-history)

---

## 1. Executive Summary

This document defines the full product requirements for a modern e-commerce platform built on a microservices architecture. The platform targets three distinct user personas — **Admins**, **Staff**, and **Customers** — each with a dedicated interface and precisely scoped capabilities enforced through Role-Based Access Control (RBAC).

The system is composed of four core backend microservices:

- **Product Search Service** — Elasticsearch-powered search, filtering, and autocomplete
- **Shopping Cart Service** — Redis-backed ephemeral cart management
- **Order & Checkout Service** — PostgreSQL-driven order lifecycle management
- **AI Recommendation Service** — FAISS + Sentence Transformer-based product recommendations

All services are exposed via FastAPI and integrate into a unified frontend with role-aware routing and UI rendering.

---

## 2. Goals & Success Metrics

### 2.1 Business Goals

| Goal | Description | Priority |
|------|-------------|----------|
| Role Separation | Distinct, secure pages for Admin / Staff / Customer | P0 |
| Scalable Search | Sub-200ms product search with relevance ranking | P0 |
| AI Discovery | Increase basket size via personalised recommendations | P1 |
| Operational Visibility | Real-time order & delivery analytics for Admin | P1 |
| Review Engagement | Enable brand voice through Admin/Staff review replies | P2 |

### 2.2 Key Success Metrics

- Search result click-through rate ≥ 40%
- Cart-to-checkout conversion rate ≥ 25%
- AI recommendation acceptance rate ≥ 15%
- Admin dashboard load time < 2 seconds
- Zero privilege-escalation incidents (RBAC enforcement)

---

## 3. User Personas & Role-Based Access Control

The platform enforces three roles. Access tokens carry a role claim validated on every API request and every frontend route guard.

### 3.1 Role Hierarchy

| Role | Primary Responsibility | Created By | Scope |
|------|----------------------|------------|-------|
| **Admin** | Platform owner, full control | System / self-seeded | All |
| **Staff** | Operational tasks delegated by Admin | Admin | Permitted subset |
| **Customer** | Browse, buy, review | Self-registration | Own data only |

### 3.2 Staff Permission Model

Admins grant Staff access on a per-module basis. Staff cannot exceed the permissions they have been granted, regardless of UI availability. The following modules are grantable:

| Permission Module | What Staff Can Do When Granted |
|-------------------|-------------------------------|
| Reply to Reviews | Read customer reviews and post brand replies on product pages |
| Stock Management | Update stock status (In Stock / Low Stock / Out of Stock) |
| Deal Management | View active deals; cannot create or delete deals |
| Order Management | View and update order dispatch status |
| Product Listing View | Read-only access to product catalogue |

---

## 4. Admin Portal

The Admin Portal is the command centre of the platform. Only users with the **Admin** role can access it. It is a separate, protected route prefix (`/admin`) with server-side role enforcement.

### 4.1 Admin Dashboard

The landing page after Admin login. Designed for at-a-glance operational awareness.

#### 4.1.1 KPI Summary Cards

| Metric Card | Data Source | Refresh |
|-------------|-------------|---------|
| Total Orders (Today / This Month) | `orders` table — count by date range | Real-time |
| Orders Dispatched | `orders WHERE status = 'dispatched'` | Real-time |
| Pending Orders | `orders WHERE status = 'pending'` | Real-time |
| Total Revenue (Today / Month) | `SUM(total_price)` from orders | Real-time |
| Active Products | Product index — `status = active` | 5 min cache |
| Active Deals | `deals` table — within date range | 5 min cache |

#### 4.1.2 Top Selling / Most Ordered Products Widget

- Displays top 10 products ranked by `order_items` quantity in the selected time window (Today / 7D / 30D)
- Shows product thumbnail, name, units sold, and revenue generated
- Clicking a product navigates to its detail page within the admin

#### 4.1.3 Pincode Delivery Map

An embedded **Mapbox GL JS** interactive map pinned to the Indian geography.

- Each serviceable pincode is plotted as a pin on the Mapbox map
- Pin color encodes order volume: **Green** (1–10), **Amber** (11–50), **Red** (50+)
- Tooltip on hover shows: Pincode, City/District, Order Count, and Delivery SLA
- Data source: `orders JOIN addresses GROUP BY pincode`
- Filter controls: Date range, Order status
- Implementation: Mapbox GL JS with `mapbox-gl` npm package; GeoJSON `FeatureCollection` constructed server-side from pincode centroids and order counts
- Mapbox style: `mapbox://styles/mapbox/light-v11` (clean, neutral base for data overlays)
- Circle layer radius and color driven by `order_count` property via Mapbox expressions

### 4.2 Product Management

#### 4.2.1 Add Product

| Field | Type | Validation |
|-------|------|------------|
| Product Name | Text | Required, 3–200 chars |
| SKU | Text | Required, unique, alphanumeric |
| Category | Dropdown (multi-select) | Required, from category master |
| Description | Rich text (markdown) | Required, 20–5000 chars |
| Price (MRP) | Decimal | Required, > 0 |
| Selling Price | Decimal | Required, ≤ MRP |
| Stock Quantity | Integer | Required, ≥ 0 |
| Stock Status | Enum | Auto-computed from quantity; overrideable |
| Product Images | File upload (multi) | JPEG/PNG, max 5 MB each, up to 8 images |
| Weight & Dimensions | Decimal fields | Optional |
| Tags | Tag input | Optional, used for search |
| Is Active | Toggle | Default: true |

On save, the product is written to the PostgreSQL `products` table and an indexing job is triggered to sync the record to Elasticsearch within 30 seconds.

#### 4.2.2 Product Listing Page

- Paginated table of all products (50 per page)
- Columns: Image thumbnail, Name, SKU, Category, Price, Stock Status, Active toggle, Actions
- Inline quick-edit for stock status and active toggle without navigating away
- Bulk actions: Activate, Deactivate, Delete (soft delete)
- Filters: Category, Stock Status, Price range, Date added
- Export to CSV

### 4.3 Deal / Offer Management

#### 4.3.1 Create a Deal

| Field | Description |
|-------|-------------|
| Deal Name | Internal label (e.g. "Summer Sale 2026") |
| Deal Type | Percentage Discount / Fixed Amount Off / Buy X Get Y / Free Shipping |
| Applies To | All Products / Specific Category / Specific Product SKUs |
| Discount Value | Percentage (0–100) or fixed amount |
| Minimum Cart Value | Optional threshold |
| Start Date & Time | ISO 8601 datetime |
| End Date & Time | ISO 8601 datetime |
| Max Uses | Optional cap on redemptions |
| Is Active | Enable/Disable without deleting |
| Staff Visibility | Toggle to expose deal details to Staff |

### 4.4 Reviews & Ratings Management

#### 4.4.1 Review Listing

- Paginated view of all reviews across all products
- Columns: Product, Customer, Rating (stars), Review Text, Date, Reply Status
- Filter by: Star rating, Date range, Has Reply / No Reply, Product
- Clicking a review row expands an inline reply panel

#### 4.4.2 Replying to a Review

- Admin types reply in a rich-text box (max 500 chars)
- Reply is published under the brand name (configurable in Settings)
- Reply is visible on the customer-facing product page below the review
- Only one active reply per review; Admin can edit or retract
- Audit log records all reply actions

### 4.5 Order Management (Admin View)

- Full order list with columns: Order ID, Customer, Items count, Total, Status, Pincode, Created At
- Click-through to order detail: line items, shipping address, payment info, status timeline
- Admin can update status: Pending → Confirmed → Dispatched → Delivered → Cancelled
- Bulk dispatch: select multiple Confirmed orders and mark as Dispatched
- Export orders to CSV by date range

### 4.6 Staff Management

#### 4.6.1 Add Staff Member

- Form fields: Full Name, Email, Phone, Temporary Password
- Permission checkboxes for each grantable module (see Section 3.2)
- Staff account is created and a welcome email with login link is sent

#### 4.6.2 Staff List

- Table of all staff: Name, Email, Status (Active / Suspended), Permissions, Last Login
- Inline toggle to suspend / reactivate a staff account
- Edit permissions without recreating the account

---

## 5. Staff Portal

The Staff Portal is a narrower, task-focused interface. Staff see only the modules their Admin has granted. Attempting to access an unauthorised module returns a `403` error at both the API and UI route levels.

### 5.1 Staff Dashboard

- Quick-count cards for: Pending Orders, Orders Dispatched Today, Unresolved Reviews (no reply), Low-Stock Products
- Activity feed: recent actions taken by this staff member (last 20 actions with timestamp)

### 5.2 Review Reply *(if granted)*

- Mirrors the Admin review listing, scoped to the same data
- Staff can post, edit, and retract replies
- Staff cannot delete reviews — only Admin can
- Audit log records reply actions with staff identity

### 5.3 Stock Management *(if granted)*

- Product list filtered to Active products only
- Editable Stock Status column: In Stock / Low Stock / Out of Stock
- Editable Stock Quantity field
- Changes are written immediately and trigger Elasticsearch re-index
- Staff cannot change pricing, images, or description

### 5.4 Deal Details View *(if granted)*

- Read-only list of currently active deals with their terms
- Purpose: Staff can correctly inform customers about ongoing promotions
- Cannot create, edit, or delete deals

### 5.5 Order Dispatch *(if granted)*

- Filtered view: Orders in Confirmed status only
- Staff can mark Confirmed orders as Dispatched and enter a tracking number
- Cannot cancel orders or update to any other status

---

## 6. Customer Portal

The customer-facing storefront is the primary revenue driver. The UI must be fast, mobile-responsive, and conversion-optimised.

### 6.1 Authentication

- Registration: Email + Password or OTP-based mobile registration
- Login: Email/Password with optional Remember Me (30-day session)
- Password reset via email OTP
- Social login (Google OAuth) — Phase 2

### 6.2 Product Discovery

#### 6.2.1 Search — `search_product()` & `autocomplete_products()`

- Search bar with real-time autocomplete — debounced at 300ms
- Keyword search against Elasticsearch index with BM25 + sales velocity boost
- Search result page shows: product card grid (image, name, price, rating, deal badge)

#### 6.2.2 Filtering — `filter_products()`

| Filter | Type | Notes |
|--------|------|-------|
| Category | Multi-select checkbox | Hierarchical categories supported |
| Price Range | Dual-handle slider | Min / Max with text inputs |
| Rating | Star selector (≥ N stars) | 4 star and above most common |
| Brand | Multi-select checkbox | From product metadata |
| Availability | Toggle | Exclude out-of-stock |
| Deals Only | Toggle | Show only discounted products |

#### 6.2.3 AI Recommendations

- Homepage "Recommended for You" carousel — `user_recommendations()` based on purchase and browse history
- Product detail page "Similar Products" section — `similar_products()` using vector similarity (FAISS)
- Returns top 5 products per call; rendered as horizontally scrollable cards

### 6.3 Product Detail Page

- Image gallery (swipeable on mobile)
- Price display: MRP (struck through if on deal) + Selling Price + Discount badge
- Stock status indicator (In Stock / Low Stock — X left / Out of Stock)
- Add to Cart button (disabled if out of stock)
- Product description (rendered from markdown)
- Reviews & Ratings section
- AI-powered "Similar Products" carousel

### 6.4 Shopping Cart — Shopping Cart Service

| Action | Function | Behaviour |
|--------|----------|-----------|
| Add item | `add_to_cart()` | Creates or increments cart line; validates stock |
| Remove item | `remove_from_cart()` | Removes line from Redis hash |
| Update quantity | `update_cart_item()` | Validates new qty against available stock |
| View cart | `get_cart()` | Returns all lines with live prices and totals |
| Clear cart | `clear_cart()` | Empties entire cart (also called post-order) |

Cart data is stored in Redis with a 7-day TTL. Price is snapshotted at add-to-cart time; a staleness warning is shown if the price changes before checkout.

### 6.5 Reviews & Ratings

- Customer can submit a rating (1–5 stars) and text review after a completed, delivered order
- One review per product per order
- Review displays: Customer first name, star rating, date, review text, and brand reply (if any)
- Review cannot be edited after 24 hours of submission
- Reported reviews are flagged for Admin moderation

### 6.6 Checkout & Orders — Order & Checkout Service

#### 6.6.1 Checkout Flow

1. **Review Cart** — items, quantities, prices, deals applied, total
2. **Shipping Address** — Add new or select saved address; enter pincode for delivery check
3. **Payment** — UPI / Card / Net Banking / COD (mock payment in v1)
4. **Order Confirmation** — Order ID, summary, estimated delivery date

#### 6.6.2 Order Lifecycle

| Status | Triggered By | Customer Notification |
|--------|-------------|----------------------|
| Pending | `create_order()` called | Order confirmation email |
| Confirmed | Admin/Staff confirms | Email + SMS |
| Dispatched | Staff marks dispatched + tracking | Email + SMS with tracking link |
| Delivered | Delivery confirmation | Email; review prompt sent |
| Cancelled | Admin cancels or customer requests | Email with refund info |

#### 6.6.3 Order History

- Customer can view all past orders via My Orders page
- Each order shows: Order ID, Date, Items summary, Total, Status badge, Track button
- Delivered orders show a **Write Review** button for each eligible product

---

## 7. Microservices Specification

### 7.1 Product Search Service

**Stack:** Python 3.11+, FastAPI, Elasticsearch

| Function | Endpoint | Description |
|----------|----------|-------------|
| `index_product()` | `POST /internal/index` | Index or re-index a single product into Elasticsearch |
| `search_product()` | `GET /search?q=&page=&size=` | Full-text keyword search, returns ranked hits |
| `filter_products()` | `POST /filter` | Filter by category, price range, rating, availability |
| `autocomplete_products()` | `GET /autocomplete?q=` | Prefix-match suggestions, max 8 results, < 50ms |

**Elasticsearch index mapping fields:** `name`, `description`, `category`, `tags` (full-text), `price`, `rating`, `stock_status`, `is_active` (filters), `sales_count` (boosting)

### 7.2 Shopping Cart Service

**Stack:** Python 3.11+, FastAPI, Redis

| Function | Endpoint | Description |
|----------|----------|-------------|
| `add_to_cart()` | `POST /cart/add` | Add product to user's Redis cart hash |
| `remove_from_cart()` | `DELETE /cart/{product_id}` | Remove a line item |
| `update_cart_item()` | `PATCH /cart/{product_id}` | Update quantity of existing item |
| `get_cart()` | `GET /cart` | Return full cart with computed totals and deal prices |
| `clear_cart()` | `DELETE /cart` | Flush all items from the cart |

**Redis key structure:** `cart:{user_id}` — Hash where `field = product_id`, `value = JSON{quantity, price_snapshot, added_at}`

### 7.3 Order & Checkout Service

**Stack:** Python 3.11+, FastAPI, PostgreSQL

| Function | Endpoint | Description |
|----------|----------|-------------|
| `create_order()` | `POST /orders` | Validate cart, create orders + order_items, trigger `clear_cart` |
| `get_order()` | `GET /orders/{order_id}` | Fetch single order detail with line items |
| `list_orders()` | `GET /orders?user_id=&status=&page=` | Paginated order listing (Admin sees all; Customer sees own) |
| `update_order_status()` | `PATCH /orders/{order_id}/status` | Status transitions with role-based guard |

#### Database Schema

```sql
-- Orders table
CREATE TABLE orders (
    order_id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL,
    total_price       DECIMAL(10,2) NOT NULL,
    status            VARCHAR(20) NOT NULL CHECK (status IN ('pending','confirmed','dispatched','delivered','cancelled')),
    shipping_address_id UUID,
    tracking_number   TEXT,
    created_at        TIMESTAMPTZ DEFAULT now(),
    updated_at        TIMESTAMPTZ
);

-- Order items table
CREATE TABLE order_items (
    order_item_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id          UUID NOT NULL REFERENCES orders(order_id),
    product_id        UUID NOT NULL,
    quantity          INTEGER NOT NULL CHECK (quantity > 0),
    price             DECIMAL(10,2) NOT NULL   -- price at time of purchase
);

-- Cart table (reference schema; primary storage is Redis)
CREATE TABLE cart (
    cart_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID NOT NULL,
    product_id        UUID NOT NULL,
    quantity          INTEGER NOT NULL CHECK (quantity > 0),
    price             DECIMAL(10,2) NOT NULL
);
```

### 7.4 AI Recommendation Service

**Stack:** Python 3.11+, FastAPI, Sentence Transformers, FAISS, PyTorch

| Function | Endpoint | Description |
|----------|----------|-------------|
| `generate_embeddings()` | `POST /internal/embed` | Generate and store 384-dim vectors for product descriptions |
| `similar_products()` | `GET /recommend/similar/{product_id}` | Top 5 nearest neighbours in FAISS index |
| `recommend_products()` | `GET /recommend/products` | General recommendations based on trending + collaborative signals |
| `user_recommendations()` | `GET /recommend/user/{user_id}` | Personalised top 5 from user's purchase + view history |

**Implementation notes:**
- FAISS index rebuilt nightly via batch job; incremental updates applied in real-time for new products
- Model: `all-MiniLM-L6-v2` (Sentence Transformers)
- Index type: `IndexFlatIP` with L2-normalised vectors
- Vector storage: FAISS binary index file + product_id mapping JSON

---

## 8. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance | Product search API p95 latency < 200ms; autocomplete < 50ms |
| Performance | Admin dashboard initial load < 2 seconds on 4G connection |
| Scalability | Each microservice independently horizontally scalable |
| Security | JWT-based authentication; RBAC enforced at API gateway and service level |
| Security | All passwords hashed with bcrypt (cost factor ≥ 12) |
| Security | HTTPS enforced; HSTS enabled; input validated at service boundary |
| Availability | 99.5% uptime SLA for storefront; 99.0% for Admin/Staff portals |
| Data Integrity | Order creation is transactional — cart cleared only after order commit |
| Observability | Structured JSON logging; Prometheus metrics; distributed tracing (OpenTelemetry) |
| Accessibility | WCAG 2.1 AA compliance for Customer Portal |

---