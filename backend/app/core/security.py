from time import time

from fastapi import Header, HTTPException, Request

from app.core.config import get_settings

_rate_buckets: dict[str, list[float]] = {}


def require_ingestion_key(x_ingestion_key: str | None = Header(default=None)) -> None:
    expected = get_settings().ingestion_api_key
    if expected and x_ingestion_key != expected:
        raise HTTPException(status_code=401, detail="Invalid ingestion API key")


def rate_limit_ingestion(request: Request) -> None:
    settings = get_settings()
    limit = settings.ingestion_rate_limit_per_minute
    if limit <= 0:
        return
    key = request.headers.get("x-ingestion-key") or (request.client.host if request.client else "anonymous")
    now = time()
    window_start = now - 60
    bucket = [stamp for stamp in _rate_buckets.get(key, []) if stamp >= window_start]
    if len(bucket) >= limit:
        raise HTTPException(status_code=429, detail="Ingestion rate limit exceeded")
    bucket.append(now)
    _rate_buckets[key] = bucket
