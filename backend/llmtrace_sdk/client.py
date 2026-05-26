import os
from collections.abc import Mapping
from datetime import UTC, datetime

import httpx
from pydantic import BaseModel, Field

from llmtrace_sdk.schemas import IngestionAccepted, IngestionEvent


class LLMTraceSDKError(RuntimeError):
    pass


class LLMTraceClientConfig(BaseModel):
    ingestion_url: str = Field(default="http://127.0.0.1:8000/api/ingest/logs")
    api_key: str | None = None
    timeout_seconds: float = Field(default=2.0, gt=0)

    @classmethod
    def from_env(cls) -> "LLMTraceClientConfig":
        return cls(
            ingestion_url=(
                os.getenv("LLMTRACE_INGESTION_URL")
                or os.getenv("SDK_INGESTION_URL")
                or "http://127.0.0.1:8000/api/ingest/logs"
            ),
            api_key=os.getenv("LLMTRACE_API_KEY") or os.getenv("INGESTION_API_KEY"),
            timeout_seconds=float(os.getenv("LLMTRACE_TIMEOUT_SECONDS", "2.0")),
        )


class LLMTraceClient:
    def __init__(
        self,
        *,
        ingestion_url: str | None = None,
        api_key: str | None = None,
        timeout_seconds: float | None = None,
        http_client: httpx.AsyncClient | None = None,
    ) -> None:
        env_config = LLMTraceClientConfig.from_env()
        self.config = LLMTraceClientConfig(
            ingestion_url=ingestion_url or env_config.ingestion_url,
            api_key=api_key if api_key is not None else env_config.api_key,
            timeout_seconds=timeout_seconds if timeout_seconds is not None else env_config.timeout_seconds,
        )
        self._owned_client = http_client is None
        self._client = http_client or httpx.AsyncClient(timeout=self.config.timeout_seconds)

    async def __aenter__(self) -> "LLMTraceClient":
        return self

    async def __aexit__(self, *_exc_info) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        if self._owned_client:
            await self._client.aclose()

    def headers(self) -> dict[str, str]:
        return {"x-ingestion-key": self.config.api_key} if self.config.api_key else {}

    async def emit(self, event: IngestionEvent) -> IngestionAccepted:
        try:
            response = await self._client.post(
                self.config.ingestion_url,
                headers=self.headers(),
                json=event.model_dump(mode="json"),
            )
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise LLMTraceSDKError(f"Failed to emit LLMTrace event: {exc}") from exc
        return IngestionAccepted.model_validate(response.json())

    async def request_started(
        self,
        *,
        event_id: str,
        request_id: str,
        conversation_id: str,
        provider: str,
        model: str,
        prompt_tokens: int | None = None,
        input_preview: str | None = None,
        redaction_metadata: Mapping[str, int] | None = None,
        payload: Mapping[str, object] | None = None,
        timestamp: datetime | None = None,
    ) -> IngestionAccepted:
        return await self.emit(
            IngestionEvent(
                event_id=event_id,
                request_id=request_id,
                conversation_id=conversation_id,
                event_type="request_started",
                provider=provider,
                model=model,
                timestamp=timestamp or datetime.now(UTC),
                status="started",
                prompt_tokens=prompt_tokens,
                input_preview=input_preview,
                redaction_metadata=dict(redaction_metadata or {}),
                payload=dict(payload or {}),
            )
        )

    async def token_chunk(
        self,
        *,
        event_id: str,
        request_id: str,
        conversation_id: str,
        provider: str,
        model: str,
        output_preview: str | None = None,
        redaction_metadata: Mapping[str, int] | None = None,
        payload: Mapping[str, object] | None = None,
        timestamp: datetime | None = None,
    ) -> IngestionAccepted:
        return await self.emit(
            IngestionEvent(
                event_id=event_id,
                request_id=request_id,
                conversation_id=conversation_id,
                event_type="token_chunk",
                provider=provider,
                model=model,
                timestamp=timestamp or datetime.now(UTC),
                status="streaming",
                output_preview=output_preview,
                redaction_metadata=dict(redaction_metadata or {}),
                payload=dict(payload or {}),
            )
        )

    async def request_completed(
        self,
        *,
        event_id: str,
        request_id: str,
        conversation_id: str,
        provider: str,
        model: str,
        latency_ms: int,
        prompt_tokens: int | None = None,
        completion_tokens: int | None = None,
        total_tokens: int | None = None,
        output_preview: str | None = None,
        redaction_metadata: Mapping[str, int] | None = None,
        payload: Mapping[str, object] | None = None,
        timestamp: datetime | None = None,
    ) -> IngestionAccepted:
        return await self.emit(
            IngestionEvent(
                event_id=event_id,
                request_id=request_id,
                conversation_id=conversation_id,
                event_type="request_completed",
                provider=provider,
                model=model,
                timestamp=timestamp or datetime.now(UTC),
                status="completed",
                latency_ms=latency_ms,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                output_preview=output_preview,
                redaction_metadata=dict(redaction_metadata or {}),
                payload=dict(payload or {}),
            )
        )

    async def request_failed(
        self,
        *,
        event_id: str,
        request_id: str,
        conversation_id: str,
        provider: str,
        model: str,
        latency_ms: int,
        error_type: str,
        error_message: str,
        prompt_tokens: int | None = None,
        redaction_metadata: Mapping[str, int] | None = None,
        payload: Mapping[str, object] | None = None,
        timestamp: datetime | None = None,
    ) -> IngestionAccepted:
        return await self.emit(
            IngestionEvent(
                event_id=event_id,
                request_id=request_id,
                conversation_id=conversation_id,
                event_type="request_failed",
                provider=provider,
                model=model,
                timestamp=timestamp or datetime.now(UTC),
                status="failed",
                latency_ms=latency_ms,
                error_type=error_type,
                error_message=error_message,
                prompt_tokens=prompt_tokens,
                redaction_metadata=dict(redaction_metadata or {}),
                payload=dict(payload or {}),
            )
        )

    async def request_cancelled(
        self,
        *,
        event_id: str,
        request_id: str,
        conversation_id: str,
        provider: str,
        model: str,
        latency_ms: int,
        prompt_tokens: int | None = None,
        completion_tokens: int | None = None,
        total_tokens: int | None = None,
        output_preview: str | None = None,
        redaction_metadata: Mapping[str, int] | None = None,
        payload: Mapping[str, object] | None = None,
        timestamp: datetime | None = None,
    ) -> IngestionAccepted:
        return await self.emit(
            IngestionEvent(
                event_id=event_id,
                request_id=request_id,
                conversation_id=conversation_id,
                event_type="request_cancelled",
                provider=provider,
                model=model,
                timestamp=timestamp or datetime.now(UTC),
                status="cancelled",
                latency_ms=latency_ms,
                prompt_tokens=prompt_tokens,
                completion_tokens=completion_tokens,
                total_tokens=total_tokens,
                output_preview=output_preview,
                redaction_metadata=dict(redaction_metadata or {}),
                payload=dict(payload or {}),
            )
        )
