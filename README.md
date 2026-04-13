# ATS-ECommerce

A production-grade microservice e-commerce platform with AI-powered chatbot, RAG knowledge base, human handoff, and real-time recommendations.

## Architecture

| Layer | Component | Port | Responsibility |
|-------|-----------|------|----------------|
| Gateway | Nginx Reverse Proxy | `80` | API routing, static assets, WebSocket proxy |
| Frontend | React + Vite SPA | — | Customer, admin, and staff UI |
| Backend | Auth Service | `8001` | JWT auth, RBAC, staff accounts, password reset |
| Backend | Product Service | `8002` | Products, categories, search, deals, reviews, variants |
| Backend | Cart Service | `8003` | Redis-backed shopping cart |
| Backend | Order Service | `8004` | Checkout, addresses, orders, dashboard KPIs |
| Backend | AI Service | `8005` | Chatbot, RAG, recommendations, human handoff |
| Infrastructure | PostgreSQL 16 | `5432` | Shared relational storage |
| Infrastructure | Redis 7 | `6379` | Cart, chat sessions, handoff queue, tool caching |
| Infrastructure | Elasticsearch 8 | `9200` | Full-text product search |

### AI Service Features

- **Local LLM**: Qwen2.5-3B-Instruct (GGUF Q4_K_M) via llama-cpp-python — no external API needed
- **RAG Knowledge Base**: FAISS + all-MiniLM-L6-v2 embeddings (384-dim, CPU)
- **10 Chat Tools**: product search, details, orders, cart, reviews, recommendations, addresses, cancellable orders
- **Intent Routing**: Keyword-based classifier skips LLM for greetings/farewells
- **Tool Result Caching**: Redis-backed (5 min TTL) for search/product results
- **Admin Document Upload**: PDF, DOCX, TXT, MD, CSV → chunked → embedded → RAG index
- **Human Handoff**: WebSocket + Redis pub/sub for real-time agent-customer chat
- **Rate Limiting**: 20 req/min per IP on chat endpoint
- **Smart Search**: AI-powered query intent parsing with structured filter extraction

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, React Query, Zustand, react-markdown
- **Backend**: FastAPI, SQLAlchemy (async), asyncpg, Redis, Elasticsearch
- **AI/ML**: llama-cpp-python, sentence-transformers, FAISS, huggingface-hub
- **Infrastructure**: Docker Compose, PostgreSQL 16, Redis 7, Elasticsearch 8.12, Nginx
- **Security**: JWT + bcrypt, RBAC (admin/staff/customer), rate limiting (slowapi)

## Repository Layout

```text
.
|-- backend/
|   |-- auth_service/
|   |-- product_service/
|   |-- cart_service/
|   |-- order_service/
|   `-- ai_service/
|-- frontend/
|-- docs/
|-- scripts/
|-- docker-compose.yml
`-- .env.example
```

## Run Locally

The recommended local workflow is Docker Compose. It starts the UI, all backend services, and the required infrastructure with the correct ports and container networking.

### Prerequisites

- Docker Desktop with Docker Compose v2
- At least 6 GB of free RAM for PostgreSQL, Redis, Elasticsearch, and the application containers
- Internet access on first start so the AI service can download the embedding model

### 1. Create the environment file

Copy `.env.example` to `.env`.

```bash
cp .env.example .env
```

PowerShell:

```powershell
Copy-Item .env.example .env
```

### 2. Update the important environment variables

At minimum, review these values in `.env` before starting the stack:

- `POSTGRES_PASSWORD`
- `REDIS_PASSWORD`
- `JWT_SECRET_KEY` — shared secret used by every backend service to sign and verify JWTs (min 32 chars)
- `INTERNAL_SERVICE_TOKEN` — shared secret for protected internal-only endpoints (min 32 chars)
- `SMTP_USER` and `SMTP_PASSWORD` if you want real password-reset emails
- `VITE_GOOGLE_MAPS_API_KEY` if you want the admin dashboard map

Notes:

- API URLs default to `/api/<service>` which routes through the Nginx reverse proxy. No CORS issues.
- `GEMINI_API_KEY` and `GROQ_API_KEY` are optional — the local Qwen LLM handles everything.

### 3. Start the stack

```bash
docker compose up --build
```

On the first run, this may take 10-15 minutes because:
1. Docker builds images and installs dependencies
2. The AI service compiles `llama-cpp-python` (C++ build)
3. On first startup, the AI service downloads the Qwen2.5-3B LLM (~2 GB) and the embedding model

### 4. Seed the database (first run)

```bash
# Seed product categories and 40+ products
bash scripts/seed_products.sh

# Seed reviews with varied ratings (for Bayesian ranking testing)
bash scripts/seed_reviews.sh
```

### 5. Open the application

| Target | URL |
|--------|-----|
| Frontend | `http://localhost` |
| Auth Service docs | `http://localhost:8001/docs` |
| Product Service docs | `http://localhost:8002/docs` |
| Cart Service docs | `http://localhost:8003/docs` |
| Order Service docs | `http://localhost:8004/docs` |
| AI Service docs | `http://localhost:8005/docs` |
| Elasticsearch health | `http://localhost:9200/_cluster/health` |

### 5. Open the application

| Target | URL |
|--------|-----|
| Frontend (via proxy) | `http://localhost` |
| Auth Service docs | `http://localhost:8001/docs` |
| Product Service docs | `http://localhost:8002/docs` |
| Cart Service docs | `http://localhost:8003/docs` |
| Order Service docs | `http://localhost:8004/docs` |
| AI Service docs | `http://localhost:8005/docs` |

### Default Admin Credentials

| Field | Value |
|-------|-------|
| Email | `admin@ecommerce.com` |
| Password | `Admin@123456` |

### 6. Stop or reset the stack

Stop containers but keep data volumes:

```bash
docker compose down
```

Stop containers and remove volumes for a clean reset:

```bash
docker compose down -v
```

The PostgreSQL bootstrap script in `scripts/init_db.sql` only runs on the first creation of the database volume. If you need to re-run it, use `docker compose down -v` and start again.

## Local Development Notes

- The frontend can also be run with Vite from `frontend/` using `npm install` and `npm run dev` if you want faster UI iteration.
- The backend services use the FastAPI app entrypoint `app.main:app` and are served with Uvicorn on ports `8001` through `8005`.
- Product images are stored in a Docker volume and served by the frontend container through `/static/products/...`.
- The cart is Redis-backed and intentionally isolated from the relational database.

## Troubleshooting

- If Elasticsearch fails to start on Linux, set `vm.max_map_count=262144` before running Docker Compose.
- If auth appears broken across services, make sure every service is using the same `JWT_SECRET_KEY` value from `.env`.
- If your database schema looks stale after changing bootstrap SQL, reset the PostgreSQL volume with `docker compose down -v`.
- If password reset emails are not configured, the reset token is logged by the auth service for development purposes.

## Testing the AI Chatbot

Once the system is running and products are seeded:

1. **Open the chat widget** — Click the chat bubble (bottom-right) on any page
2. **Test greeting** — Type "hi" (instant response, no LLM call)
3. **Test product search** — "Show me laptops under 80000"
4. **Test recommendations** — "What are the best rated products?"
5. **Test order queries** — "Show me my orders" (must be logged in)
6. **Test reviews** — "What do people say about [product name]?"
7. **Test address listing** — "Show me my saved addresses"
8. **Test cancellation** — "Can I cancel my order?"
9. **Test human handoff** — "I want to talk to a human agent"
10. **Test RAG** — "What is your return policy?" (answered from RAG knowledge base)

### Testing Human Handoff

1. As a **customer**, type "I want to speak to a human" in the chat widget
2. The bot will create a handoff ticket and add you to the queue
3. Log in as **admin** or **staff** → navigate to **💬 Live Chat**
4. You'll see the waiting ticket in the queue → click **Accept**
5. Real-time chat starts between agent and customer via WebSocket

### Testing Admin RAG Documents

1. Login as admin → navigate to **🧠 RAG Docs**
2. Upload a `.txt`, `.md`, `.pdf`, `.docx`, or `.csv` file with store policies or FAQ
3. The document is chunked, embedded, and added to the RAG vector store
4. Ask a question in the chatbot related to the uploaded content

## Current Status

Implemented areas include:

- Customer storefront with search, filters, reviews, cart, checkout, order history
- Admin tools for products, variants, deals, staff permissions, dashboards, order operations
- Staff tools for dispatch, review replies, stock updates
- AI chatbot with local LLM (Qwen2.5-3B), 10 tool functions, RAG, intent routing
- Human handoff with WebSocket real-time chat + Redis queue
- Admin document upload (PDF, DOCX, TXT, MD, CSV) for RAG enrichment
- Nginx reverse proxy with API gateway routing
- Elasticsearch-backed full-text search
- FAISS-based product recommendations (similar products + user history)
- Redis-backed tool result caching (5 min TTL)
- Rate limiting on chat endpoint (20/min per IP)
- Health checks on all services in docker-compose
