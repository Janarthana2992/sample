import logging
from typing import List

from sentence_transformers import SentenceTransformer

from app.config import settings
from app.services.faiss_service import faiss_service

logger = logging.getLogger(__name__)

_model: SentenceTransformer | None = None


def get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        logger.info("Loading embedding model: %s", settings.MODEL_NAME)
        _model = SentenceTransformer(settings.MODEL_NAME)
        logger.info("Model loaded.")
    return _model


def embed_text(text: str) -> List[float]:
    model = get_model()
    vec = model.encode(text, normalize_embeddings=True)
    return vec.tolist()


async def embed_and_store(product_id: str, name: str, description: str):
    text = f"{name}. {description}"
    vector = embed_text(text)
    await faiss_service.add_vector(product_id, vector)
    logger.info("Embedded product %s", product_id)


async def get_similar(product_id: str, top_n: int = 5) -> List[dict]:
    vec = faiss_service.get_vector_by_product_id(product_id)
    if vec is None:
        return []
    results = await faiss_service.search_similar(vec.tolist(), top_n + 1)
    # Exclude self
    return [{"product_id": pid, "score": score} for pid, score in results if pid != product_id][:top_n]
