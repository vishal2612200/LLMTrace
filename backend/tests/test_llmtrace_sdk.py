from datetime import UTC, datetime

import httpx
import pytest

from llmtrace_sdk import IngestionEvent, LLMTraceClient, LLMTraceClientConfig, LLMTraceSDKError


def _event() -> IngestionEvent:
    return IngestionEvent(
        event_id="evt_12345678",
        request_id="req_12345678",
        conversation_id="conv_12345678",
        event_type="request_started",
        provider="mock",
        model="mock-fast",
        timestamp=datetime.now(UTC),
        status="started",
    )


@pytest.mark.asyncio
async def test_sdk_emit_posts_validated_event_with_api_key():
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["headers"] = request.headers
        captured["payload"] = request.read()
        return httpx.Response(200, json={"accepted": True, "event_id": "evt_12345678"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        client = LLMTraceClient(
            ingestion_url="http://testserver/api/ingest/logs",
            api_key="secret",
            http_client=http_client,
        )
        accepted = await client.emit(_event())

    assert accepted.accepted is True
    assert accepted.event_id == "evt_12345678"
    assert captured["headers"]["x-ingestion-key"] == "secret"
    assert b'"event_type":"request_started"' in captured["payload"]


@pytest.mark.asyncio
async def test_sdk_lifecycle_helper_builds_completed_event():
    captured: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["payload"] = request.read().decode("utf-8")
        return httpx.Response(200, json={"accepted": True, "event_id": "evt_87654321"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        client = LLMTraceClient(ingestion_url="http://testserver/api/ingest/logs", http_client=http_client)
        await client.request_completed(
            event_id="evt_87654321",
            request_id="req_12345678",
            conversation_id="conv_12345678",
            provider="openai",
            model="gpt-4.1-mini",
            latency_ms=42,
            prompt_tokens=10,
            completion_tokens=5,
            total_tokens=15,
            output_preview="Done",
        )

    assert '"event_type":"request_completed"' in captured["payload"]
    assert '"status":"completed"' in captured["payload"]
    assert '"latency_ms":42' in captured["payload"]
    assert '"total_tokens":15' in captured["payload"]


def test_sdk_config_reads_env(monkeypatch):
    monkeypatch.setenv("LLMTRACE_INGESTION_URL", "http://collector.local/logs")
    monkeypatch.setenv("LLMTRACE_API_KEY", "sdk-key")
    monkeypatch.setenv("LLMTRACE_TIMEOUT_SECONDS", "4.5")

    config = LLMTraceClientConfig.from_env()

    assert config.ingestion_url == "http://collector.local/logs"
    assert config.api_key == "sdk-key"
    assert config.timeout_seconds == 4.5


@pytest.mark.asyncio
async def test_sdk_wraps_http_failures():
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(500, json={"detail": "broken"})

    transport = httpx.MockTransport(handler)
    async with httpx.AsyncClient(transport=transport) as http_client:
        client = LLMTraceClient(ingestion_url="http://testserver/api/ingest/logs", http_client=http_client)
        with pytest.raises(LLMTraceSDKError):
            await client.emit(_event())


def test_sdk_config_prefers_llmtrace_env_over_legacy(monkeypatch):
    monkeypatch.setenv("LLMTRACE_INGESTION_URL", "http://new.example/logs")
    monkeypatch.setenv("SDK_INGESTION_URL", "http://legacy.example/logs")
    monkeypatch.setenv("LLMTRACE_API_KEY", "new-key")
    monkeypatch.setenv("INGESTION_API_KEY", "legacy-key")

    config = LLMTraceClientConfig.from_env()

    assert config.ingestion_url == "http://new.example/logs"
    assert config.api_key == "new-key"
