from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://ecom_user:ecom_pass@localhost:5432/ecom_db"

    # JWT
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # Email
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""

    # App
    FRONTEND_URL: str = "http://localhost:5173"
    ENVIRONMENT: str = "development"
    BCRYPT_ROUNDS: int = 12

    @field_validator("JWT_SECRET_KEY")
    @classmethod
    def validate_jwt_secret_key(cls, value: str) -> str:
        normalized = value.strip()
        lowered = normalized.lower()
        if len(normalized) < 32 or "change_me" in lowered or "generate_with" in lowered:
            raise ValueError("JWT_SECRET_KEY must be at least 32 characters and not use a placeholder value")
        return normalized


settings = Settings()
