import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes.recommendations import router as rec_router
from app.services.faiss_service import faiss_service
from app.services.embedding_service import get_model

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("AI Service starting...")
    faiss_service.load()
    # Warm up the model (loads weights into memory)
    get_model()
    logger.info("AI Service ready. FAISS vectors: %d", len(faiss_service.product_ids))
    yield
    logger.info("AI Service stopped.")


app = FastAPI(
    title="E-Commerce AI Recommendation Service",
    version="1.0.0",
    description="FAISS + Sentence Transformers product recommendations",
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

app.include_router(rec_router)


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "service": "ai", "indexed_products": len(faiss_service.product_ids)}
