"""Application configuration. Every secret comes from environment variables."""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- General ---------------------------------------------------------
    environment: str = Field("development", alias="AIRENV_ENV")
    cors_origins: str = Field("http://localhost:5173,http://127.0.0.1:5173", alias="CORS_ORIGINS")
    public_base_url: str = Field("http://localhost:8000", alias="PUBLIC_BASE_URL")
    frontend_base_url: str = Field("http://localhost:5173", alias="FRONTEND_BASE_URL")

    # Default monitored location (New Delhi) used before any profile exists.
    default_location_name: str = Field("New Delhi", alias="DEFAULT_LOCATION_NAME")
    default_lat: float = Field(28.6139, alias="DEFAULT_LAT")
    default_lon: float = Field(77.2090, alias="DEFAULT_LON")
    default_timezone: str = Field("Asia/Kolkata", alias="DEFAULT_TIMEZONE")

    # --- Scheduling ------------------------------------------------------
    refresh_interval_minutes: int = Field(15, alias="REFRESH_INTERVAL_MINUTES")
    scheduler_enabled: bool = Field(True, alias="SCHEDULER_ENABLED")
    http_timeout_seconds: float = Field(12.0, alias="HTTP_TIMEOUT_SECONDS")

    # --- Storage ---------------------------------------------------------
    # "auto": Firestore when credentials exist, otherwise local SQLite.
    storage_backend: str = Field("auto", alias="STORAGE_BACKEND")
    sqlite_path: str = Field("./data/airenv.db", alias="SQLITE_PATH")
    firebase_project_id: str | None = Field(None, alias="FIREBASE_PROJECT_ID")
    # Either a path to a service-account JSON file or the JSON itself.
    firebase_credentials: str | None = Field(None, alias="FIREBASE_CREDENTIALS")

    # --- Auth ------------------------------------------------------------
    # "local": single local owner account (development / demos only).
    # "firebase": verify Firebase ID tokens on every authenticated request.
    auth_mode: str = Field("auto", alias="AUTH_MODE")
    admin_emails: str = Field("", alias="ADMIN_EMAILS")

    # --- Environmental data sources -------------------------------------
    openaq_api_key: str | None = Field(None, alias="OPENAQ_API_KEY")
    data_gov_in_api_key: str | None = Field(None, alias="DATA_GOV_IN_API_KEY")
    sensor_community_enabled: bool = Field(True, alias="SENSOR_COMMUNITY_ENABLED")

    # --- AI --------------------------------------------------------------
    gemini_api_key: str | None = Field(None, alias="GEMINI_API_KEY")
    gemini_model: str = Field("gemini-2.5-flash", alias="GEMINI_MODEL")

    # --- Telegram --------------------------------------------------------
    telegram_bot_token: str | None = Field(None, alias="TELEGRAM_BOT_TOKEN")
    telegram_webhook_secret: str | None = Field(None, alias="TELEGRAM_WEBHOOK_SECRET")
    # "webhook" (production), "polling" (local development) or "disabled".
    telegram_mode: str = Field("polling", alias="TELEGRAM_MODE")

    # --- Retention -------------------------------------------------------
    snapshot_retention_days: int = Field(90, alias="SNAPSHOT_RETENTION_DAYS")
    event_retention_days: int = Field(30, alias="EVENT_RETENTION_DAYS")

    # --- Rate limiting ---------------------------------------------------
    rate_limit_per_minute: int = Field(120, alias="RATE_LIMIT_PER_MINUTE")
    ai_rate_limit_per_minute: int = Field(12, alias="AI_RATE_LIMIT_PER_MINUTE")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def admin_email_list(self) -> list[str]:
        return [e.strip().lower() for e in self.admin_emails.split(",") if e.strip()]

    @property
    def firebase_configured(self) -> bool:
        return bool(self.firebase_credentials and self.firebase_project_id)

    @property
    def effective_auth_mode(self) -> str:
        if self.auth_mode in ("local", "firebase"):
            return self.auth_mode
        return "firebase" if self.firebase_configured else "local"

    @property
    def telegram_enabled(self) -> bool:
        return bool(self.telegram_bot_token) and self.telegram_mode != "disabled"


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
