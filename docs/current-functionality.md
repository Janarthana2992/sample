# Current Functionality

This document tracks what is fully implemented and deployable as of the initial scaffold.

---

## Infrastructure

| Component | Status | Notes |
|-----------|--------|-------|
| Docker Compose | ✅ | All 8 containers orchestrated with health checks |
| PostgreSQL 16 | ✅ | Single instance, schema auto-init via `scripts/init_db.sql` |
| Redis 7 | ✅ | Password-auth, used exclusively by Cart Service |
| Elasticsearch 8.13 | ✅ | Single-node, `products` index with BM25 + sales boost |
| FAISS index | ✅ | Persisted to `/app/faiss_store` Docker volume |

---

## Auth Service (port 8001)

### Implemented
- **POST /auth/register** — Customer self-registration, bcrypt(cost=12), returns JWT pair
- **POST /auth/login** — Email + password login, returns access + refresh tokens
- **POST /auth/refresh** — Refresh access token using valid refresh token
- **POST /auth/forgot-password** — Generates one-time auth token, logs to console (email stub)
- **POST /auth/reset-password** — Consumes OTP token, resets password
- **GET /auth/me** — Returns current user profile
- **POST /users/staff** — Admin-only: create staff account with permission set
- **GET /users/staff** — Admin-only: list all staff members
- **GET /users/staff/{user_id}** — Admin-only: get staff detail with permissions
- **PATCH /users/staff/{user_id}/permissions** — Admin-only: update staff permissions
- **PATCH /users/staff/{user_id}/suspend** — Admin-only: toggle staff suspension

### Not Implemented
- Email delivery (SMTP/SendGrid) — reset token is logged to stdout
- OAuth2 / social login
- MFA / TOTP

---

## Product Service (port 8002)

### Products
- **POST /products** — Admin-only: create product with multipart image upload (JPEG/PNG/WEBP, ≤5MB each)
- **GET /products** — Public: paginated list with filters (category, stock_status, is_active, price range)
- **GET /products/{id}** — Public: full product detail with images
- **PUT /products/{id}** — Admin-only: full product update
- **PATCH /products/{id}/stock** — Staff (stock_management permission): update stock_quantity + stock_status
- **DELETE /products/{id}** — Admin-only: soft delete (sets is_active=false)

### Categories
- **POST /categories** — Admin-only: create category (supports parent_id for nesting)
- **GET /categories** — Public: full category tree

### Search
- **GET /search** — Full-text BM25 search with optional category + price filters, paginated
- **POST /search/filter** — Advanced filter: nested facets, sort, price range, tags
- **GET /search/autocomplete** — Returns up to 5 prefix-matched suggestions

### Deals
- **POST /deals** — Admin-only: create deal (percentage_discount | fixed_amount_off | buy_x_get_y | free_shipping)
- **GET /deals** — Public: list deals (query params: active_only, staff_visible_only)
- **GET /deals/{id}** — Public: get deal detail
- **PATCH /deals/{id}** — Admin-only: partial update (is_active toggle, dates, discount)
- **DELETE /deals/{id}** — Admin-only: hard delete

### Reviews
- **POST /reviews** — Authenticated customer: submit review (rating 1-5 + text)
- **GET /reviews** — Public: list reviews (filter by product_id, min_rating, has_reply)
- **POST /reviews/{id}/reply** — Staff (reply_reviews permission): post reply
- **PATCH /reviews/{id}/reply** — Staff: edit reply (creates audit log entry)
- **DELETE /reviews/{id}/reply** — Staff: retract reply (sets is_retracted=true)
- **DELETE /reviews/{id}** — Admin-only: permanently delete review

### Implemented (newly added)
- **PATCH /reviews/{id}** — Authenticated customer: edit own review (rating + text)
- **DELETE /reviews/{id}** — Customer can delete own review; admin can delete any
- **GET /products/export/csv** — Admin-only: export all products as CSV download
- **POST /products/import/csv** — Admin-only: upsert products from CSV (SKU as key)
- **GET /products/{id}/variants** — Public: list variants for a product
- **POST /products/{id}/variants** — Admin-only: create colour/size variant
- **PATCH /products/{id}/variants/{vid}** — Admin-only: update variant stock/price/attributes
- **DELETE /products/{id}/variants/{vid}** — Admin-only: delete variant

### Not Implemented
- Image CDN integration (images stored in local Docker volume)

---

## Cart Service (port 8003)

### Implemented
- **POST /cart/items** — Add item to cart: validates stock, captures price snapshot
- **GET /cart** — Get cart with live price comparison (sets `price_stale` if price changed)
- **PATCH /cart/items/{product_id}** — Update quantity
- **DELETE /cart/items/{product_id}** — Remove single item
- **DELETE /cart** — Clear entire cart
- **GET /cart/internal/snapshot** *(internal)* — Used by Order Service to read cart before checkout
- **DELETE /cart/internal/clear** *(internal)* — Used by Order Service to clear cart post-checkout

### Not Implemented
- Guest cart (cart requires JWT)
- Cart merge on login
- Saved-for-later / wishlist

---

## Order Service (port 8004)

### Implemented
- **POST /orders** — Checkout: pulls cart snapshot, validates address, creates order + items transactionally, clears cart best-effort
- **GET /orders** — Customer: paginated own orders; Admin/Staff: all orders with optional status filter
- **GET /orders/{id}** — Get order detail with items and status history
- **PATCH /orders/{id}/status** — Update order status with role-gated valid-transition enforcement:
  - Admin: `pending → confirmed`, `confirmed → cancelled`, any status
  - Staff: `confirmed → dispatched` only
  - Customer: `pending → cancelled` only
- **POST /addresses** — Create shipping address
- **GET /addresses** — List own addresses
- **GET /admin/dashboard/kpis** — Admin: total_orders, total_revenue, pending_orders, dispatched_today, avg_order_value, unresolved_reviews
- **GET /admin/dashboard/top-products** — Admin: top 10 products by revenue for period (today/week/month/all)
- **GET /admin/dashboard/pincode-map** — Admin: order counts grouped by pincode for map visualization

### Not Implemented
- Payment gateway integration (payment_method stored but not processed)
- Order return / refund flow
- Invoice PDF generation
- Email notifications on status change

---

## AI Service (port 8005)

### Recommendations
- **POST /internal/embed** — Index a product's embedding into FAISS (called by Product Service on create/update)
- **GET /recommend/similar/{product_id}** — Top-N similar products by cosine similarity
- **POST /recommend/products** — Batch similar-product lookup for a list of product IDs
- **GET /recommend/user/{user_id}** — Personalized recommendations: averages purchase history embeddings, searches FAISS

### AI Chatbot
- **POST /chat** — Main chat endpoint with local LLM (Qwen2.5-3B-Instruct), 10 tool functions, RAG retrieval, intent routing
- **DELETE /chat/{session_id}** — Clear chat session
- **POST /search/parse-intent** — AI-powered search query parsing with structured filter extraction

### Chat Tools (function calling)
- `search_products` — Search products with query, category, price filters (cached 5 min)
- `get_product_details` — Get product details by ID (cached 5 min)
- `get_order_status` — Get order details by order ID
- `list_user_orders` — List user's recent orders
- `get_cart` — Get current cart contents
- `add_to_cart` — Add product to cart
- `suggest_top_rated` — Get top-rated products (Bayesian ranking)
- `get_product_reviews` — Get reviews for a product
- `list_addresses` — List user's saved delivery addresses
- `get_cancellable_orders` — Get orders eligible for cancellation (pending/confirmed)

### RAG Knowledge Base
- **POST /admin/documents** — Upload document (PDF, DOCX, TXT, MD, CSV) → chunked → embedded → FAISS
- **GET /admin/documents** — List uploaded RAG documents
- **DELETE /admin/documents/{doc_id}** — Remove document from RAG index
- **POST /internal/rag-rebuild** — Rebuild RAG index from product/review data

### Human Handoff
- **POST /handoff/request** — Customer requests human agent (creates queue ticket)
- **GET /handoff/queue** — Agent/Admin: view waiting tickets
- **POST /handoff/assign** — Agent accepts a ticket
- **POST /handoff/resolve** — Agent resolves/closes a ticket
- **POST /handoff/ticket/{id}/message** — Customer sends message
- **POST /handoff/ticket/{id}/agent-message** — Agent sends message
- **GET /handoff/ticket/{id}** — Get ticket status + messages
- **GET /handoff/my-tickets** — Agent's active tickets
- **WS /ws/handoff/{ticket_id}** — WebSocket for real-time chat (Redis pub/sub)

### Features
- Intent routing: keyword-based classifier skips LLM for greetings/farewells
- Rate limiting: 20 req/min per IP on chat endpoint (slowapi)
- Tool result caching: Redis (5 min TTL) for search and product lookups
- Local LLM: Qwen2.5-3B-Instruct GGUF (Q4_K_M), CPU-only, 8K context

---

## Frontend

### Customer Portal
- Home page: hero banner, featured deals, AI-powered recommendations carousel
- Product listing: search, filter sidebar (category, price, stock), pagination
- Product detail: image gallery, add to cart, reviews section
- Cart: quantity adjustment, price-stale warning banner
- 4-step checkout wizard: address → review → payment method → confirmation
- Order history

### Admin Portal
- Dashboard: 6 KPI cards, Mapbox choropleth pincode map, top-products table
- Product management: table with inline active/inactive toggle, soft delete
- Add product: full form with multi-image upload
- Order management: full order list, status advance actions
- Review management: reply, edit, retract, delete
- Deals management: create/toggle/delete
- Staff management: create staff, assign permission modules, suspend

### Staff Portal
- Dashboard: 4 quick-count cards + recent orders feed + low-stock list
- Confirmed orders: dispatch with tracking number entry
- Reviews: reply, edit, retract (no delete)
- Stock management: inline edit stock_quantity + stock_status per product

### Implemented (newly added)
- **Dark mode** — 🌙/☀️ toggle in Header; persists via localStorage; `dark:` Tailwind classes on cards, inputs, nav
- **Image upload preview** — Live thumbnail strip in Add Product (already existed, confirmed working)
- **Product edit page** — `/admin/products/:id/edit` with Details + Variants tabs; Edit button on products table
- **Deals edit form** — Edit modal per deal; "Specific Category" and "Specific SKUs" pickers (multi-select); backend persists junction rows
- **Review: Verified Purchase badge** — All reviews show ✓ Verified Purchase badge (purchase enforced at create time)
- **Review: customer edit/delete** — Inline edit (rating + text) and delete controls for own reviews on product detail page
- **Bulk import/export** — ⬇ Export CSV and ⬆ Import CSV on admin Products page; import upserts by SKU
- **Product variants (colour/size)** — Variants tab on Edit Product: create/edit/delete variants with SKU, colour, size, stock, price adjustment
- **Categories: slug hidden** — Slug auto-generated from name; not shown or editable in UI

### Not Implemented
- Push notifications
- Image CDN integration (images stored in local Docker volume)
