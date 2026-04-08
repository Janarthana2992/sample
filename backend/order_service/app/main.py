import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.database import engine, Base
from app.models import order  # noqa: F401
from app.routes.orders import router as orders_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Order Service starting...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Order Service ready.")
    yield
    await engine.dispose()
    logger.info("Order Service stopped.")


app = FastAPI(
    title="E-Commerce Order Service",
    version="1.0.0",
    description="Order creation, lifecycle management, checkout, and admin analytics",
    lifespan=lifespan,
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url=None,
)

allowed_origins = ["*"] if settings.ENVIRONMENT == "development" else [settings.FRONTEND_URL]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(orders_router)


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "service": "order"}
