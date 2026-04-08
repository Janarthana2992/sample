from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://ecom_user:ecom_pass@localhost:5432/ecom_db"
    # Elastic Cloud
    ES_ENDPOINT: str = "http://localhost:9200"
    ES_API_KEY: str = ""
    ES_INDEX: str = "products"
    ES_INDEX_NAME: str = "products"  # kept for backward compat, overridden below
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    INTERNAL_SERVICE_TOKEN: str
    UPLOAD_DIR: str = "/app/uploads"
    MAX_IMAGE_SIZE_MB: int = 5
    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = "http://localhost:5173"
    AI_SERVICE_URL: str = "http://ai_service:8005"

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

    @property
    def es_index(self) -> str:
        return self.ES_INDEX or self.ES_INDEX_NAME


settings = Settings()
