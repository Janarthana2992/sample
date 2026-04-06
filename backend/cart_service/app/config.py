from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    REDIS_URL: str = "redis://:redis_pass@localhost:6379/0"
    CART_TTL_SECONDS: int = 604800  # 7 days
    JWT_SECRET_KEY: str = "change_me"
    JWT_ALGORITHM: str = "HS256"
    PRODUCT_SERVICE_URL: str = "http://localhost:8002"
    ENVIRONMENT: str = "development"


settings = Settings()
