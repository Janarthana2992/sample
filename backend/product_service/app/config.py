from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://ecom_user:ecom_pass@localhost:5432/ecom_db"
    # Elastic Cloud
    ES_ENDPOINT: str = "http://localhost:9200"
    ES_API_KEY: str = ""
    ES_INDEX: str = "products"
    ES_INDEX_NAME: str = "products"  # kept for backward compat, overridden below
    JWT_SECRET_KEY: str = "change_me"
    JWT_ALGORITHM: str = "HS256"
    UPLOAD_DIR: str = "/app/uploads"
    MAX_IMAGE_SIZE_MB: int = 5
    ENVIRONMENT: str = "development"
    AI_SERVICE_URL: str = "http://ai_service:8005"

    @property
    def es_index(self) -> str:
        return self.ES_INDEX or self.ES_INDEX_NAME


settings = Settings()
