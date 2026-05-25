from fastapi import HTTPException
from starlette.requests import Request

from app.core import security


def test_rate_limit_ingestion_blocks_after_limit(monkeypatch):
    monkeypatch.setattr(security.get_settings(), "ingestion_rate_limit_per_minute", 1)
    security._rate_buckets.clear()

    scope = {"type": "http", "headers": [], "client": ("127.0.0.1", 12345)}
    request = Request(scope)
    security.rate_limit_ingestion(request)

    try:
        security.rate_limit_ingestion(request)
    except HTTPException as exc:
        assert exc.status_code == 429
    else:
        raise AssertionError("rate limiter did not block second request")


def test_require_ingestion_key(monkeypatch):
    monkeypatch.setattr(security.get_settings(), "ingestion_api_key", "secret")

    try:
        security.require_ingestion_key(None)
    except HTTPException as exc:
        assert exc.status_code == 401
    else:
        raise AssertionError("missing key was accepted")

    assert security.require_ingestion_key("secret") is None
