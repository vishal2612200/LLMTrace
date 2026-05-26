from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.runtime_config import (
    ProviderName,
    RuntimeConfig,
    get_runtime_config,
    reset_runtime_config,
    runtime_provider_api_key,
    runtime_provider_key_source,
    save_provider_api_key,
    save_runtime_config,
)
from app.db.session import get_db

router = APIRouter(prefix="/api/settings", tags=["settings"])


class ProviderStatus(BaseModel):
    provider: str
    configured: bool
    selected: bool
    key_env_var: str | None
    detail: str
    key_source: str | None = None


class ProviderKeyUpdate(BaseModel):
    api_key: str = Field(default="", max_length=4096)


@router.get("/runtime", response_model=RuntimeConfig)
def read_runtime_settings(db: Session = Depends(get_db)):
    return get_runtime_config(db)


@router.put("/runtime", response_model=RuntimeConfig)
def update_runtime_settings(payload: RuntimeConfig, db: Session = Depends(get_db)):
    return save_runtime_config(db, payload)


@router.post("/runtime/reset", response_model=RuntimeConfig)
def reset_runtime_settings(db: Session = Depends(get_db)):
    return reset_runtime_config(db)


@router.get("/providers/status", response_model=list[ProviderStatus])
def provider_status(db: Session = Depends(get_db)):
    return build_provider_statuses(db)


@router.put("/providers/{provider}/key", response_model=ProviderStatus)
def update_provider_key(provider: ProviderName, payload: ProviderKeyUpdate, db: Session = Depends(get_db)):
    if provider == "mock":
        raise HTTPException(status_code=400, detail="Mock provider does not use an API key.")
    save_provider_api_key(db, provider, payload.api_key)
    return next(item for item in build_provider_statuses(db) if item.provider == provider)


def build_provider_statuses(db: Session) -> list[ProviderStatus]:
    runtime = get_runtime_config(db)
    providers = [
        ("mock", True, None, "Ready. Mock provider needs no API key."),
        ("openai", bool(runtime_provider_api_key(db, "openai")), "OPENAI_API_KEY", provider_detail(db, "openai")),
        ("anthropic", bool(runtime_provider_api_key(db, "anthropic")), "ANTHROPIC_API_KEY", provider_detail(db, "anthropic")),
    ]
    return [
        ProviderStatus(
            provider=provider,
            configured=configured,
            selected=runtime.default_provider == provider,
            key_env_var=key_env_var,
            detail=detail,
            key_source=runtime_provider_key_source(db, provider),  # type: ignore[arg-type]
        )
        for provider, configured, key_env_var, detail in providers
    ]


def provider_detail(db: Session, provider: ProviderName) -> str:
    source = runtime_provider_key_source(db, provider)
    if source == "runtime":
        return "Ready. API key configured from Settings."
    key = "OPENAI_API_KEY" if provider == "openai" else "ANTHROPIC_API_KEY"
    if source == "environment":
        return f"Ready. {key} configured in backend environment."
    return f"Missing {key} in backend environment or Settings."
