# Architecture

## System Overview

```
Browser
  │
  ├── React SPA (nginx:80)
  │     │
  │     ├── Auth Service       :8001 (FastAPI)
  │     ├── Product Service    :8002 (FastAPI)
  │     ├── Cart Service       :8003 (FastAPI)
  │     ├── Order Service      :8004 (FastAPI)
  │     └── AI Service         :8005 (FastAPI)
  │
Infrastructure
  ├── PostgreSQL 16            (shared DB, all services except Cart + AI)
  ├── Redis 7                  (Cart Service only)
  └── Elasticsearch 8.13       (Product Service only)
```

All services run in Docker. There is no API gateway — the React frontend talks directly to each service using the public ports. This keeps things simple while remaining extensible.

---

## Service Responsibilities

### Auth Service (8001)
Owns user identity. All other services trust the JWT payload and never call Auth Service at runtime — they decode the token locally using the shared `JWT_SECRET`. This avoids inter-service HTTP calls in the hot path.

```
JWT payload shape:
{
  "sub": "<user_id>",
  "role": "customer|staff|admin",
  "permissions": ["reply_reviews", "stock_management", ...],  // staff only
  "exp": <unix timestamp>
}
```

### Product Service (8002)
Owns the product catalogue, search index, deals, and reviews. When a product is created or stock changes, it writes to both PostgreSQL and Elasticsearch synchronously in the same request. The Elasticsearch index is the source of truth for search; PostgreSQL is the source of truth for everything else.

Image uploads are stored to a local Docker volume (`product_uploads`). In production this should be replaced with S3/GCS.

### Cart Service (8003)
Stateless except for Redis. The cart is a Redis Hash:
- Key: `cart:{user_id}` with 7-day TTL
- Fields: `{product_id}` → JSON `CartItemSnapshot` (name, price_snapshot, quantity, image_url)

On every `GET /cart`, the service fetches live prices from Product Service to compute `price_stale`. This is the only runtime inter-service HTTP call in the read path.

### Order Service (8004)
Creates orders by:
1. Fetching cart snapshot from Cart Service (`GET /cart/internal/snapshot`)
2. Writing Order + OrderItems in a single DB transaction
3. Clearing the cart post-commit (best-effort, logged on failure)

The service also owns the analytics endpoints. KPI queries hit PostgreSQL directly using aggregate SQL.

### AI Service (8005)
Owns the FAISS index. Uses `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions) to embed product text. Vectors are L2-normalized then stored in `IndexFlatIP` (inner product = cosine after normalization).

The FAISS index is persisted to a Docker volume and loaded on startup. All index writes are protected with an asyncio lock.

---

## Database Design

Single PostgreSQL instance, no schema separation between services. Tables:

```
users                   — all user accounts (role: customer|staff|admin)
staff_permissions       — per-module permission grants for staff users
auth_tokens             — OTP tokens for password reset

categories              — hierarchical product categories
products                — main product catalogue
product_images          — images attached to products
product_categories      — many-to-many product ↔ category

deals                   — promotional deals with type + schedule
deal_categories         — categories scoped to a deal
deal_skus               — specific products scoped to a deal

reviews                 — customer reviews (rating + text)
review_replies          — single staff reply per review
review_reply_audit      — audit trail: original text, editor, timestamp

addresses               — shipping addresses (customer-owned)
orders                  — order header (status, total, address snapshot)
order_items             — line items (product snapshot: name, price, qty)
order_status_history    — full status transition log with actor + timestamp

user_product_events     — implicit signals: view, add_to_cart, purchase
pincodes                — pincode → city/state lookup for delivery check
```

---

## RBAC Model

Three roles: `customer`, `staff`, `admin`.

Staff members additionally carry a set of permission modules stored in `staff_permissions` and embedded in their JWT at login time:

| Permission | Grants |
|------------|--------|
| `reply_reviews` | POST/PATCH/DELETE `/reviews/{id}/reply` |
| `stock_management` | PATCH `/products/{id}/stock` |
| `deal_management` | (Read-only) GET `/deals` with staff context |
| `order_management` | PATCH `/orders/{id}/status` → dispatched |
| `product_listing_view` | Unrestricted product reads (same as public but semantically scoped) |

Admins have all permissions implicitly — they are never checked against the permissions list.

---

## Security Decisions

| Decision | Rationale |
|----------|-----------|
| JWT-only auth in downstream services | Eliminates Auth Service as a single point of failure for read traffic; services can verify tokens offline |
| Refresh token stored in DB (`auth_tokens`) | Allows token revocation (logout, suspend) without waiting for expiry |
| bcrypt cost=12 | OWASP-recommended minimum work factor as of 2024 |
| OTP tokens hashed with SHA-256 before DB storage | Prevents rainbow-table attacks on leaked DB |
| Image MIME + size validation | Guards against polyglot files and DoS through large uploads |
| asyncio.Lock on FAISS writes | Prevents data races in the async event loop |
| `best_effort` cart clear on checkout | Orders always commit even if Redis is temporarily unavailable; cart TTL provides eventual cleanup |

---

## Elasticsearch Index Design

Index: `products`

```json
{
  "mappings": {
    "properties": {
      "product_id": { "type": "keyword" },
      "name": { "type": "text", "analyzer": "standard", "boost": 3 },
      "description": { "type": "text", "analyzer": "standard" },
      "sku": { "type": "keyword" },
      "tags": { "type": "keyword" },
      "category_ids": { "type": "keyword" },
      "selling_price": { "type": "float" },
      "stock_status": { "type": "keyword" },
      "is_active": { "type": "boolean" },
      "sales_count": { "type": "integer" }
    }
  }
}
```

Search scoring: BM25 on `name` (3× boost) + `description`, combined with `function_score` on `sales_count` for popularity boost. Results filtered to `is_active=true` and `stock_status != out_of_stock` by default.

---

## Order Status State Machine

```
pending ──┬── confirmed ── dispatched ── delivered
          │        │
          └────────┴──── cancelled
```

| Transition | Allowed Roles |
|------------|--------------|
| pending → confirmed | admin |
| confirmed → dispatched | admin, staff |
| dispatched → delivered | admin |
| pending → cancelled | admin, customer |
| confirmed → cancelled | admin |

---

## Frontend Architecture

React 18 SPA with React Router v6 (browser history). State management:

- **Server state:** `@tanstack/react-query` v5 — all API data fetching, caching, background refetch
- **Client state:** Zustand (persisted to localStorage) — auth token + user profile, cart summary count
- **Forms:** React Hook Form
- **HTTP:** Axios with auto token-refresh interceptor (queues concurrent requests during refresh)

Three portal layouts share a common component library (`src/components/`). Route protection is done at the React Router level via `<ProtectedRoute>` which checks the Zustand auth store.

---

## Deployment Notes

- Set all `VITE_*` env vars as Docker build args to bake API URLs into the static frontend build.
- The frontend nginx config handles SPA routing (`try_files $uri /index.html`).
- Elasticsearch requires `vm.max_map_count=262144` on the Docker host (`sysctl -w vm.max_map_count=262144`).
- The `init_db.sql` script is run once at first PostgreSQL container start. To re-run on an existing database, drop and recreate the volume: `docker compose down -v`.
