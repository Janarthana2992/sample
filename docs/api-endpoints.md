# API Endpoints Reference

All services use JSON request/response bodies unless noted. Auth header: `Authorization: Bearer <access_token>`.

---

## Auth Service — `http://localhost:8001`

### Authentication

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | None | Register new customer account |
| POST | `/auth/login` | None | Login, returns token pair |
| POST | `/auth/refresh` | Refresh token in body | Exchange refresh token for new access token |
| POST | `/auth/forgot-password` | None | Request password reset (token logged to stdout) |
| POST | `/auth/reset-password` | None | Consume OTP token, set new password |
| GET | `/auth/me` | Bearer | Get current user profile |

#### POST /auth/register
```json
Request: { "email": "user@example.com", "password": "Min8chars", "full_name": "Jane Doe", "phone": "+919876543210" }
Response 201: { "access_token": "...", "refresh_token": "...", "token_type": "bearer" }
```

#### POST /auth/login
```json
Request: { "email": "user@example.com", "password": "Min8chars" }
Response 200: { "access_token": "...", "refresh_token": "...", "token_type": "bearer" }
```

#### POST /auth/refresh
```json
Request: { "refresh_token": "..." }
Response 200: { "access_token": "...", "refresh_token": "...", "token_type": "bearer" }
```

### Staff Management (Admin only)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/users/staff` | Create staff account |
| GET | `/users/staff` | List all staff |
| GET | `/users/staff/{user_id}` | Get staff detail + permissions |
| PATCH | `/users/staff/{user_id}/permissions` | Update staff permission set |
| PATCH | `/users/staff/{user_id}/suspend` | Toggle suspension |

#### POST /users/staff
```json
Request: { "email": "staff@example.com", "full_name": "John Staff", "phone": "+91...", "password": "...", "permissions": ["reply_reviews", "stock_management"] }
Response 201: { "user_id": "...", "email": "...", "role": "staff", "is_suspended": false, "permissions": [...] }
```

---

## Product Service — `http://localhost:8002`

### Products

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/products` | Admin | Create product (multipart/form-data) |
| GET | `/products` | None | List products (paginated + filtered) |
| GET | `/products/{id}` | None | Get product detail |
| PUT | `/products/{id}` | Admin | Full product update |
| PATCH | `/products/{id}/stock` | Staff (stock_management) | Update stock |
| DELETE | `/products/{id}` | Admin | Soft delete (sets is_active=false) |

#### GET /products query params
| Param | Type | Default |
|-------|------|---------|
| page | int | 1 |
| size | int | 50 |
| category_id | UUID | — |
| stock_status | in_stock\|low_stock\|out_of_stock | — |
| is_active | bool | — |
| min_price | float | — |
| max_price | float | — |

#### POST /products (multipart)
| Field | Type | Required |
|-------|------|----------|
| name | string | ✅ |
| sku | string | ✅ |
| description | string | ✅ |
| mrp | float | ✅ |
| selling_price | float | ✅ |
| stock_quantity | int | ✅ |
| stock_status | string | ✅ |
| tags | comma-separated string | ❌ |
| category_ids | comma-separated UUIDs | ❌ |
| images | File[] (JPEG/PNG/WEBP ≤5MB) | ❌ |

### Categories

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/categories` | Admin | Create category |
| GET | `/categories` | None | List all categories |

### Search

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/search` | None | Full-text search |
| POST | `/search/filter` | None | Advanced filter query |
| GET | `/search/autocomplete` | None | Prefix autocomplete |

#### GET /search query params: `q` (string), `page`, `size`, `category_id`, `min_price`, `max_price`

#### POST /search/filter body
```json
{ "query": "shoes", "category_ids": ["..."], "min_price": 100, "max_price": 5000, "tags": ["sport"], "sort_by": "price_asc", "page": 1, "size": 20 }
```

### Deals

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/deals` | Admin | Create deal |
| GET | `/deals` | None | List deals |
| GET | `/deals/{id}` | None | Get deal |
| PATCH | `/deals/{id}` | Admin | Update deal |
| DELETE | `/deals/{id}` | Admin | Delete deal |

#### POST /deals
```json
{
  "name": "Summer Sale",
  "deal_type": "percentage_discount",
  "applies_to": "all_products",
  "discount_value": 20,
  "min_cart_value": 500,
  "start_datetime": "2024-06-01T00:00:00Z",
  "end_datetime": "2024-06-30T23:59:59Z",
  "max_uses": 1000,
  "is_active": true,
  "staff_visible": true
}
```

### Reviews

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/reviews` | Customer | Create review |
| GET | `/reviews` | None | List reviews |
| POST | `/reviews/{id}/reply` | Staff (reply_reviews) | Post reply |
| PATCH | `/reviews/{id}/reply` | Staff (reply_reviews) | Edit reply |
| DELETE | `/reviews/{id}/reply` | Staff (reply_reviews) | Retract reply |
| DELETE | `/reviews/{id}` | Admin | Delete review |

#### GET /reviews query params: `product_id` (UUID), `min_rating` (1-5), `has_reply` (bool), `page`, `size`

---

## Cart Service — `http://localhost:8003`

All endpoints require Bearer auth.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/cart/items` | Add item to cart |
| GET | `/cart` | Get full cart with price staleness |
| PATCH | `/cart/items/{product_id}` | Update quantity |
| DELETE | `/cart/items/{product_id}` | Remove item |
| DELETE | `/cart` | Clear cart |

#### POST /cart/items
```json
Request: { "product_id": "...", "quantity": 2 }
Response 200: CartResponse
```

#### GET /cart response
```json
{
  "user_id": "...",
  "lines": [
    {
      "product_id": "...",
      "name": "...",
      "quantity": 2,
      "price_snapshot": 999.00,
      "current_price": 1099.00,
      "price_stale": true,
      "subtotal": 1998.00
    }
  ],
  "total": 1998.00
}
```

---

## Order Service — `http://localhost:8004`

### Addresses

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/addresses` | Customer | Create shipping address |
| GET | `/addresses` | Customer | List own addresses |

#### POST /addresses
```json
{ "full_name": "...", "phone": "...", "line1": "...", "line2": "...", "city": "...", "state": "...", "pincode": "400001", "country": "India" }
```

### Orders

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/orders` | Customer | Checkout (uses active cart) |
| GET | `/orders` | Customer/Admin/Staff | List orders |
| GET | `/orders/{id}` | Customer/Admin/Staff | Get order detail |
| PATCH | `/orders/{id}/status` | Role-gated | Update order status |

#### POST /orders
```json
Request: { "address_id": "...", "payment_method": "cod" }
Response 201: Order object
```

#### PATCH /orders/{id}/status
```json
Request: { "status": "confirmed", "tracking_number": "TRK123" }
```

Valid transitions:
- `pending → confirmed` (Admin)
- `confirmed → dispatched` (Staff, Admin)
- `dispatched → delivered` (Admin)
- `pending → cancelled` (Customer, Admin)
- `confirmed → cancelled` (Admin)

### Admin Analytics

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/dashboard/kpis` | Admin/Staff | Key metrics |
| GET | `/admin/dashboard/top-products` | Admin | Top 10 by revenue |
| GET | `/admin/dashboard/pincode-map` | Admin | Orders by pincode |

#### GET /admin/dashboard/kpis response
```json
{
  "total_orders": 1234,
  "total_revenue": "987654.50",
  "pending_orders": 45,
  "dispatched_today": 12,
  "avg_order_value": "800.25",
  "unresolved_reviews": 7
}
```

#### GET /admin/dashboard/top-products query params: `period` = today | week | month | all

---

## AI Service — `http://localhost:8005`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/internal/embed` | Internal | Index a product into FAISS |
| GET | `/recommend/similar/{product_id}` | None | Similar products |
| POST | `/recommend/products` | None | Batch similarity lookup |
| GET | `/recommend/user/{user_id}` | None | Personalized recommendations |

#### POST /internal/embed
```json
Request: { "product_id": "...", "text": "Product name and description concatenated" }
Response 200: { "status": "indexed" }
```

#### GET /recommend/similar/{product_id} query params: `top_n` (default 10)

#### POST /recommend/products
```json
Request: { "product_ids": ["...", "..."], "top_n": 5 }
Response: { "recommendations": { "<product_id>": ["<similar_id>", ...] } }
```

#### GET /recommend/user/{user_id} query params: `top_n` (default 10), `purchase_history` (comma-separated product IDs — passed from Order Service context)

---

### Chat

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/chat` | Optional Bearer | Send chat message, get AI response with tool results |
| DELETE | `/chat/{session_id}` | None | Clear chat session |

#### POST /chat
```json
Request: { "message": "Show me laptops under 80000", "session_id": "optional-uuid" }
Response 200: {
  "response": "Here are some laptops under ₹80,000...",
  "session_id": "uuid",
  "products": [{ "product_id": "...", "name": "...", "selling_price": 79999 }],
  "actions": [{ "type": "view_product", "data": { "product_id": "..." } }]
}
```

Rate limit: 20 requests/minute per IP.

### Smart Search

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/search/parse-intent` | None | Parse search query into structured filters |

#### POST /search/parse-intent
```json
Request: { "query": "red shoes under 2000" }
Response 200: {
  "search_terms": "shoes",
  "filters": { "category": "Fashion", "max_price": 2000, "color": "red" },
  "intent": "product_search",
  "rewritten_query": "red shoes",
  "original_query": "red shoes under 2000"
}
```

### RAG Documents (Admin)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/admin/documents` | Admin | List uploaded RAG documents |
| POST | `/admin/documents` | Admin | Upload document (PDF/DOCX/TXT/MD/CSV, max 5MB) |
| DELETE | `/admin/documents/{doc_id}` | Admin | Remove document from RAG index |
| POST | `/internal/rag-rebuild` | Internal | Rebuild RAG from product/review data |

### Human Handoff

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/handoff/request` | Bearer | Customer requests human agent |
| GET | `/handoff/queue` | Staff/Admin | View waiting tickets |
| POST | `/handoff/assign` | Staff/Admin | Accept a ticket from queue |
| POST | `/handoff/resolve` | Staff/Admin | Close a resolved ticket |
| POST | `/handoff/ticket/{id}/message` | Bearer | Customer sends chat message |
| POST | `/handoff/ticket/{id}/agent-message` | Staff/Admin | Agent sends chat message |
| GET | `/handoff/ticket/{id}` | Bearer | Get ticket status + chat messages |
| GET | `/handoff/my-tickets` | Staff/Admin | Agent's active tickets |
| WS | `/ws/handoff/{ticket_id}?token=<jwt>` | via query param | Real-time chat WebSocket |

#### POST /handoff/request
```json
Request: { "session_id": "chat-session-uuid", "reason": "Need help with order" }
Response 200: { "ticket_id": "uuid", "status": "waiting", "message": "An agent will be with you shortly." }
```

#### WebSocket /ws/handoff/{ticket_id}
```
Connect: ws://host/ws/handoff/{ticket_id}?token=<jwt>
Receive on connect: { "type": "history", "messages": [...] }
Send: { "type": "message", "content": "Hello" }
Receive: { "type": "message", "sender": "agent", "sender_name": "Admin", "content": "Hi!", "timestamp": 1234567890 }
Events: { "type": "agent_joined" }, { "type": "resolved" }
```
