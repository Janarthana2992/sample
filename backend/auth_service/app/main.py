import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db.database import engine
from app.models import user  # noqa: F401 – ensure models are registered
from app.db.database import Base
from app.routes.auth import router as auth_router
from app.routes.staff import router as staff_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Auth Service starting up...")
    async with engine.begin() as conn:
        # Only creates tables if they don't exist; migrations handled by Alembic in prod
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Auth Service ready.")
    yield
    logger.info("Auth Service shutting down...")
    await engine.dispose()


app = FastAPI(
    title="E-Commerce Auth Service",
    version="1.0.0",
    description="JWT authentication, RBAC, user & staff management",
    lifespan=lifespan,
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(staff_router)


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "service": "auth"}
