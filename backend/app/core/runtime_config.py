from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import RuntimeSetting
from app.db.session import SessionLocal

RUNTIME_SETTINGS_KEY = "app"


class RuntimeConfig(BaseModel):
    default_provider: Literal["mock", "openai", "anthropic"] = "mock"
    default_model: str = Field(default="mock-fast", min_length=1, max_length=128)
    context_window_messages: int = Field(default=8, ge=1, le=50)
    context_window_tokens: int = Field(default=1200, ge=200, le=32000)
    preview_chars: int = Field(default=500, ge=80, le=4000)


def env_runtime_config() -> RuntimeConfig:
    settings = get_settings()
    provider = settings.default_provider if settings.default_provider in {"mock", "openai", "anthropic"} else "mock"
    return RuntimeConfig(
        default_provider=provider,  # type: ignore[arg-type]
        default_model=settings.default_model,
        context_window_messages=settings.context_window_messages,
        context_window_tokens=settings.context_window_tokens,
        preview_chars=settings.preview_chars,
    )


def get_runtime_config(db: Session) -> RuntimeConfig:
    row = db.get(RuntimeSetting, RUNTIME_SETTINGS_KEY)
    if not row:
        return env_runtime_config()
    return RuntimeConfig.model_validate({**env_runtime_config().model_dump(), **row.value_json})


def save_runtime_config(db: Session, config: RuntimeConfig) -> RuntimeConfig:
    row = db.get(RuntimeSetting, RUNTIME_SETTINGS_KEY)
    if row:
        row.value_json = config.model_dump()
    else:
        row = RuntimeSetting(key=RUNTIME_SETTINGS_KEY, value_json=config.model_dump())
        db.add(row)
    db.commit()
    return config


def reset_runtime_config(db: Session) -> RuntimeConfig:
    row = db.get(RuntimeSetting, RUNTIME_SETTINGS_KEY)
    if row:
        db.delete(row)
        db.commit()
    return env_runtime_config()


def current_runtime_config() -> RuntimeConfig:
    db = SessionLocal()
    try:
        return get_runtime_config(db)
    finally:
        db.close()
