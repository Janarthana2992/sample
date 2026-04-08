# ATS-ECommerce

ATS-ECommerce is a microservice-based e-commerce platform built with FastAPI, React, PostgreSQL, Redis, Elasticsearch, and FAISS. It includes a customer storefront, an admin back office, a staff operations portal, full-text search, and AI-powered product recommendations.

## Project Overview

The platform is split into independent services so catalog, cart, orders, authentication, and recommendations can evolve separately while still sharing a simple local development workflow.

### Core capabilities

- Customer registration, login, password reset, cart, checkout, order history
- Product catalog with categories, deals, variants, image uploads, and reviews
- Full-text search with Elasticsearch and autocomplete/filter APIs
- Admin dashboards, staff management, stock updates, and order lifecycle management
- AI recommendations using sentence-transformers embeddings and FAISS similarity search

## Architecture

| Layer | Component | Port | Responsibility |
|------|-----------|------|----------------|
| Frontend | React + Vite SPA | `80` in Docker / `5173` in Vite dev | Customer, admin, and staff UI |
| Backend | Auth Service | `8001` | JWT auth, profile, staff accounts, password reset |
| Backend | Product Service | `8002` | Products, categories, search, deals, reviews, variants |
| Backend | Cart Service | `8003` | Redis-backed shopping cart |
| Backend | Order Service | `8004` | Checkout, addresses, orders, dashboard KPIs |
| Backend | AI Service | `8005` | Similar-product and user recommendation APIs |
| Infrastructure | PostgreSQL | `5432` | Shared relational storage |
| Infrastructure | Redis | `6379` | Cart storage |
| Infrastructure | Elasticsearch | `9200` | Search index |

## Tech Stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS, React Query, Zustand
- Backend: FastAPI, SQLAlchemy, asyncpg, Redis, Elasticsearch, FAISS
- Infra: Docker Compose, PostgreSQL 16, Redis 7, Elasticsearch 8
- Auth and security: JWT, bcrypt, role-based access control for customer, staff, and admin users

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
- `JWT_SECRET_KEY` - shared secret used by every backend service to sign and verify JWTs
- `INTERNAL_SERVICE_TOKEN` - shared secret used by backend services for protected internal-only endpoints
- `SMTP_USER` and `SMTP_PASSWORD` if you want real password-reset emails
- `VITE_MAPBOX_TOKEN` if you want the dashboard map to render correctly

Notes:

- `FRONTEND_URL` should be `http://localhost` if you use the Dockerized frontend, or `http://localhost:5173` if you run the frontend with Vite.
- `ELASTIC_PASSWORD` is present in the example file for future hardening, but the current local Docker setup runs Elasticsearch without auth.

### 3. Start the stack

```bash
docker compose up --build
```

On the first run, this may take a few minutes because Docker needs to build images, install dependencies, and the AI service may download the `all-MiniLM-L6-v2` model.

### 4. Open the application

| Target | URL |
|--------|-----|
| Frontend | `http://localhost` |
| Auth Service docs | `http://localhost:8001/docs` |
| Product Service docs | `http://localhost:8002/docs` |
| Cart Service docs | `http://localhost:8003/docs` |
| Order Service docs | `http://localhost:8004/docs` |
| AI Service docs | `http://localhost:8005/docs` |
| Elasticsearch health | `http://localhost:9200/_cluster/health` |

### 5. Stop or reset the stack

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

## Current Status

Implemented areas include:

- Customer storefront with search, filters, reviews, cart, checkout, and order history
- Admin tools for products, variants, deals, staff permissions, dashboards, and order operations
- Staff tools for dispatch, review replies, and stock updates
- Elasticsearch-backed search and FAISS-based recommendation endpoints
