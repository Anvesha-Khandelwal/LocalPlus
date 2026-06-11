"""
backend/app/core/config.py
All environment-driven configuration for the entire backend.
Uses Pydantic BaseSettings — automatically reads from .env file.
Import anywhere with: from app.core.config import settings
"""
from functools import lru_cache
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8",
        case_sensitive=False, extra="ignore",
    )

    # ── App ──────────────────────────────────────────────────────────────────
    APP_NAME: str = "AI Business Copilot"
    ENVIRONMENT: str = "development"   # development | staging | production
    DEBUG: bool = True
    FRONTEND_URL: str = "http://localhost:3000"

    # ── Database (asyncpg driver for async SQLAlchemy) ────────────────────────
    DATABASE_URL: str = "postgresql+asyncpg://copilot:copilot@localhost:5432/copilot_db"
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20

    # ── Redis ─────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"

    # ── JWT — short access tokens, long refresh tokens ────────────────────────
    JWT_SECRET_KEY: str = "change-me-use-openssl-rand-hex-64"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── CORS ──────────────────────────────────────────────────────────────────
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # ── AI / LLM ──────────────────────────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    LLM_MODEL: str = "gpt-4o"
    LLM_MAX_TOKENS: int = 1024

    # ── AWS / S3 ──────────────────────────────────────────────────────────────
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-south-1"
    S3_BUCKET_NAME: str = "copilot-invoices"

    # ── OCR ───────────────────────────────────────────────────────────────────
    TESSERACT_CMD: str = "/usr/bin/tesseract"
    GOOGLE_DOCUMENT_AI_KEY: str = ""

    # ── Redis cache TTLs (seconds) ────────────────────────────────────────────
    CACHE_TTL_DASHBOARD: int = 300        # 5 min
    CACHE_TTL_RECOMMENDATIONS: int = 1800 # 30 min
    CACHE_TTL_HEALTH_SCORE: int = 3600    # 1 hr
    CACHE_TTL_FORECAST: int = 7200        # 2 hr

    # ── Celery ────────────────────────────────────────────────────────────────
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — .env is read only once per process lifetime."""
    return Settings()


settings = get_settings()
