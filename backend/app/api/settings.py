from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.runtime_config import RuntimeConfig, get_runtime_config, reset_runtime_config, save_runtime_config
from app.db.session import get_db

router = APIRouter(prefix="/api/settings", tags=["settings"])


class ProviderStatus(BaseModel):
    provider: str
    configured: bool
    selected: bool
    key_env_var: str | None
    detail: str


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
    runtime = get_runtime_config(db)
    settings = get_settings()
    providers = [
        ("mock", True, None, "Ready. Mock provider needs no API key."),
        (
            "openai",
            bool(settings.openai_api_key),
            "OPENAI_API_KEY",
            "Ready." if settings.openai_api_key else "Missing OPENAI_API_KEY in backend environment.",
        ),
        (
            "anthropic",
            bool(settings.anthropic_api_key),
            "ANTHROPIC_API_KEY",
            "Ready." if settings.anthropic_api_key else "Missing ANTHROPIC_API_KEY in backend environment.",
        ),
    ]
    return [
        ProviderStatus(
            provider=provider,
            configured=configured,
            selected=runtime.default_provider == provider,
            key_env_var=key_env_var,
            detail=detail,
        )
        for provider, configured, key_env_var, detail in providers
    ]
