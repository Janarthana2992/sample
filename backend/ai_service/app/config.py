from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://ecom_user:ecom_pass@localhost:5432/ecom_db"
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    INTERNAL_SERVICE_TOKEN: str
    PRODUCT_SERVICE_URL: str = "http://localhost:8002"
    ORDER_SERVICE_URL: str = "http://order_service:8004"
    CART_SERVICE_URL: str = "http://cart_service:8003"
    FAISS_INDEX_PATH: str = "/app/faiss_store"
    MODEL_NAME: str = "all-MiniLM-L6-v2"
    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = "http://localhost:5173"
    TOP_N: int = 5
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    LLAMACPP_BASE_URL: str = "http://llamacpp:8080"
    LLAMACPP_MODEL: str = "local"
    LOCAL_MODEL_REPO: str = "Qwen/Qwen2.5-3B-Instruct-GGUF"
    LOCAL_MODEL_FILE: str = "qwen2.5-3b-instruct-q4_k_m.gguf"
    REDIS_URL: str = "redis://localhost:6379/1"
    CHAT_SESSION_TTL: int = 1800

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def validate_jwt_secret_key(cls, value: str) -> str:
        normalized = value.strip()
        lowered = normalized.lower()
        if len(normalized) < 32 or "change_me" in lowered or "generate_with" in lowered:
            raise ValueError("JWT_SECRET_KEY must be at least 32 characters and not use a placeholder value")
        return normalized

    @field_validator("INTERNAL_SERVICE_TOKEN")
    @classmethod
    def validate_internal_service_token(cls, value: str) -> str:
        normalized = value.strip()
        lowered = normalized.lower()
        if len(normalized) < 32 or "change_me" in lowered or "generate_with" in lowered:
            raise ValueError("INTERNAL_SERVICE_TOKEN must be at least 32 characters and not use a placeholder value")
        return normalized


settings = Settings()
