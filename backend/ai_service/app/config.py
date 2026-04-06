from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://ecom_user:ecom_pass@localhost:5432/ecom_db"
    JWT_SECRET_KEY: str = "change_me"
    JWT_ALGORITHM: str = "HS256"
    PRODUCT_SERVICE_URL: str = "http://localhost:8002"
    FAISS_INDEX_PATH: str = "/app/faiss_store"
    MODEL_NAME: str = "all-MiniLM-L6-v2"
    ENVIRONMENT: str = "development"
    TOP_N: int = 5


settings = Settings()
