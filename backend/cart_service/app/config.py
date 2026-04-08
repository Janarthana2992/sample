from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    REDIS_URL: str = "redis://:redis_pass@localhost:6379/0"
    CART_TTL_SECONDS: int = 604800  # 7 days
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    INTERNAL_SERVICE_TOKEN: str
    PRODUCT_SERVICE_URL: str = "http://localhost:8002"
    ENVIRONMENT: str = "development"
    FRONTEND_URL: str = "http://localhost:5173"

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
