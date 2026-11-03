"""
Application configuration
"""
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, read from environment variables (or backend/.env)"""

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

    # "production" turns on the secure defaults below. Local development and
    # the dev docker-compose file leave it at "development".
    ENVIRONMENT: Literal["development", "production"] = "development"

    # Database
    DATABASE_URL: str = "sqlite:///data/inventory.db"

    # Comma-separated list of origins allowed to call the API from a browser
    CORS_ORIGINS: str = "http://localhost:3000"

    # Reserved for future signing needs; nothing reads it today
    SECRET_KEY: str = "hackathon-demo-secret-key-change-in-production"

    # Required (as the X-Admin-Token header) for destructive admin actions such
    # as wiping and regenerating demo data. In production, leaving it empty
    # disables those actions entirely.
    ADMIN_TOKEN: str = ""

    # Required (as the X-API-Key header) to POST sensor readings. In
    # production, leaving it empty disables telemetry ingestion.
    TELEMETRY_API_KEY: str = ""

    # Serve the interactive API docs at /docs, /redoc and /openapi.json
    DOCS_ENABLED: bool = True

    # Demo Data
    DEMO_NUM_STORES: int = 5
    DEMO_NUM_SKUS: int = 200
    DEMO_DAYS_HISTORY: int = 60

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


settings = Settings()
