from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "LLMTrace"
    database_url: str = "sqlite:///./llmtrace.db"
    redis_url: str = "redis://localhost:6379/0"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:5174,http://127.0.0.1:5174"
    default_provider: str = "mock"
    default_model: str = "mock-fast"
    context_window_messages: int = 8
    context_window_tokens: int = 1200
    preview_chars: int = 500
    sdk_ingestion_url: str | None = "http://127.0.0.1:8000/api/ingest/logs"
    ingestion_api_key: str | None = None
    ingestion_rate_limit_per_minute: int = 120
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    ingestion_stream: str = "llmtrace:events"
    dlq_stream: str = "llmtrace:dlq"
    worker_group: str = "llmtrace-workers"
    inline_ingestion_fallback: bool = True

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
