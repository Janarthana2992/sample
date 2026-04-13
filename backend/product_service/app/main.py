import secrets
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db.database import engine, Base
from app.models import product  # noqa: F401
from app.routes.products import router as products_router
from app.routes.search import router as search_router
from app.routes.deals import router as deals_router
from app.routes.reviews import router as reviews_router
from app.routes.categories import router as categories_router
from app.routes.events import router as events_router
from app.routes.variants import router as variants_router
from app.services.search_service import es_service

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)


def _require_internal_service_token(
    x_internal_service_token: str | None = Header(default=None, alias="X-Internal-Service-Token"),
) -> None:
    if not x_internal_service_token or not secrets.compare_digest(
        x_internal_service_token,
        settings.INTERNAL_SERVICE_TOKEN,
    ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid internal service token")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Product Service starting...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    await es_service.setup_index()
    logger.info("Product Service ready.")
    yield
    await es_service.close()
    await engine.dispose()
    logger.info("Product Service stopped.")


app = FastAPI(
    title="E-Commerce Product Service",
    version="1.0.0",
    description="Product management, search, deals, and reviews",
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

# Serve uploaded images
import os
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/static/products", StaticFiles(directory=settings.UPLOAD_DIR), name="product-images")

app.include_router(products_router)
app.include_router(search_router)
app.include_router(deals_router)
app.include_router(reviews_router)
app.include_router(categories_router)
app.include_router(events_router)
app.include_router(variants_router)


# Internal endpoint for AI/Order services to re-index a product
@app.post("/internal/index", tags=["internal"])
async def index_product(
    doc: dict,
    _=Depends(_require_internal_service_token),
):
    from app.services.search_service import es_service as _es
    ok = await _es.index_product(doc)
    return {"indexed": ok}


# One-shot bulk reindex (adds category_names to existing ES docs)
@app.post("/internal/reindex-all", tags=["internal"])
async def reindex_all(_=Depends(_require_internal_service_token)):
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload
    from app.db.database import AsyncSessionLocal
    from app.models.product import Product, Category
    from app.services.product_service import _index_to_es, refresh_product_rating

    count = 0
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Product).options(
                selectinload(Product.images),
                selectinload(Product.product_categories),
            )
        )
        products = result.scalars().all()
        # Refresh all product ratings from reviews first
        for product in products:
            await refresh_product_rating(db, product.product_id)
        await db.commit()
        # Expire cached objects so re-fetch picks up new values
        db.expire_all()
        # Re-fetch to get updated rating columns
        result = await db.execute(
            select(Product).options(
                selectinload(Product.images),
                selectinload(Product.product_categories),
            )
        )
        products = result.scalars().all()
        for product in products:
            cat_ids = [pc.category_id for pc in product.product_categories]
            cat_result = await db.execute(
                select(Category.name).where(Category.category_id.in_(cat_ids))
            )
            cat_names = [r[0] for r in cat_result.all()]
            await _index_to_es(product, cat_ids, cat_names)
            count += 1
    return {"reindexed": count}


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "service": "product"}
