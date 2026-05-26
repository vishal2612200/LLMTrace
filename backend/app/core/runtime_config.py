from typing import Literal

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.models import RuntimeSetting
from app.db.session import SessionLocal

RUNTIME_SETTINGS_KEY = "app"
RUNTIME_PROVIDER_SECRETS_KEY = "provider_secrets"
ProviderName = Literal["mock", "openai", "anthropic"]


class RuntimeConfig(BaseModel):
    default_provider: ProviderName = "mock"
    default_model: str = Field(default="mock-fast", min_length=1, max_length=128)
    context_window_messages: int = Field(default=8, ge=1, le=50)
    context_window_tokens: int = Field(default=1200, ge=200, le=32000)
    preview_chars: int = Field(default=500, ge=80, le=4000)


class ProviderSecrets(BaseModel):
    openai_api_key: str | None = None
    anthropic_api_key: str | None = None


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


def get_provider_secrets(db: Session) -> ProviderSecrets:
    row = db.get(RuntimeSetting, RUNTIME_PROVIDER_SECRETS_KEY)
    if not row:
        return ProviderSecrets()
    return ProviderSecrets.model_validate(row.value_json)


def save_provider_api_key(db: Session, provider: ProviderName, api_key: str) -> ProviderSecrets:
    if provider == "mock":
        return get_provider_secrets(db)
    secrets = get_provider_secrets(db)
    cleaned = api_key.strip() or None
    if provider == "openai":
        secrets.openai_api_key = cleaned
    elif provider == "anthropic":
        secrets.anthropic_api_key = cleaned
    row = db.get(RuntimeSetting, RUNTIME_PROVIDER_SECRETS_KEY)
    if row:
        row.value_json = secrets.model_dump(exclude_none=True)
    else:
        row = RuntimeSetting(key=RUNTIME_PROVIDER_SECRETS_KEY, value_json=secrets.model_dump(exclude_none=True))
        db.add(row)
    db.commit()
    return secrets


def runtime_provider_api_key(db: Session, provider: ProviderName) -> str | None:
    settings = get_settings()
    secrets = get_provider_secrets(db)
    if provider == "openai":
        return secrets.openai_api_key or settings.openai_api_key
    if provider == "anthropic":
        return secrets.anthropic_api_key or settings.anthropic_api_key
    return None


def runtime_provider_key_source(db: Session, provider: ProviderName) -> str | None:
    settings = get_settings()
    secrets = get_provider_secrets(db)
    if provider == "openai":
        if secrets.openai_api_key:
            return "runtime"
        if settings.openai_api_key:
            return "environment"
    if provider == "anthropic":
        if secrets.anthropic_api_key:
            return "runtime"
        if settings.anthropic_api_key:
            return "environment"
    if provider == "mock":
        return "none"
    return None


def current_provider_api_key(provider: ProviderName) -> str | None:
    db = SessionLocal()
    try:
        return runtime_provider_api_key(db, provider)
    finally:
        db.close()


def current_runtime_config() -> RuntimeConfig:
    db = SessionLocal()
    try:
        return get_runtime_config(db)
    finally:
        db.close()
