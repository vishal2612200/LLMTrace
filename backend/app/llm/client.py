from collections.abc import AsyncIterator
from time import perf_counter

from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.core.redaction import redact_text
from app.core.time import now_utc
from app.ingestion.client import SDKIngestionClient
from app.ingestion.schemas import IngestionEvent
from app.llm.providers.anthropic import AnthropicProvider
from app.llm.providers.base import ProviderAdapter, estimate_tokens
from app.llm.providers.mock import MockProvider
from app.llm.providers.openai import OpenAIProvider


class LLMClient:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.ingestion = SDKIngestionClient(db)
        self.providers: dict[str, ProviderAdapter] = {
            "mock": MockProvider(),
            "openai": OpenAIProvider(),
            "anthropic": AnthropicProvider(),
        }

    async def _emit(self, event: IngestionEvent) -> None:
        await self.ingestion.send(event)

    async def stream(
        self,
        *,
        conversation_id: str,
        request_id: str,
        provider: str,
        model: str,
        messages: list[dict[str, str]],
        cancel_check,
    ) -> AsyncIterator[str]:
        adapter = self.providers.get(provider)
        if not adapter:
            raise ValueError(f"Unsupported provider: {provider}")
        started = now_utc()
        prompt_text = "\n".join(m["content"] for m in messages)
        prompt_redaction = redact_text(prompt_text)
        await self._emit(
            IngestionEvent(
                event_id=new_id("evt"),
                request_id=request_id,
                conversation_id=conversation_id,
                event_type="request_started",
                provider=provider,
                model=model,
                timestamp=started,
                status="started",
                prompt_tokens=estimate_tokens(prompt_text),
                input_preview=prompt_redaction.preview,
                redaction_metadata=prompt_redaction.metadata,
            )
        )

        output = ""
        start_time = perf_counter()
        try:
            async for chunk in adapter.stream(model, messages):
                if cancel_check():
                    latency_ms = int((perf_counter() - start_time) * 1000)
                    output_redaction = redact_text(output)
                    await self._emit(
                        IngestionEvent(
                            event_id=new_id("evt"),
                            request_id=request_id,
                            conversation_id=conversation_id,
                            event_type="request_cancelled",
                            provider=provider,
                            model=model,
                            timestamp=now_utc(),
                            status="cancelled",
                            latency_ms=latency_ms,
                            prompt_tokens=estimate_tokens(prompt_text),
                            completion_tokens=estimate_tokens(output or " "),
                            total_tokens=estimate_tokens(prompt_text) + estimate_tokens(output or " "),
                            output_preview=output_redaction.preview,
                            redaction_metadata=output_redaction.metadata,
                        )
                    )
                    return
                output += chunk
                chunk_redaction = redact_text(chunk)
                await self._emit(
                    IngestionEvent(
                        event_id=new_id("evt"),
                        request_id=request_id,
                        conversation_id=conversation_id,
                        event_type="token_chunk",
                        provider=provider,
                        model=model,
                        timestamp=now_utc(),
                        status="streaming",
                        output_preview=chunk_redaction.preview,
                        redaction_metadata=chunk_redaction.metadata,
                    )
                )
                yield chunk
            latency_ms = int((perf_counter() - start_time) * 1000)
            output_redaction = redact_text(output)
            await self._emit(
                IngestionEvent(
                    event_id=new_id("evt"),
                    request_id=request_id,
                    conversation_id=conversation_id,
                    event_type="request_completed",
                    provider=provider,
                    model=model,
                    timestamp=now_utc(),
                    status="completed",
                    latency_ms=latency_ms,
                    prompt_tokens=estimate_tokens(prompt_text),
                    completion_tokens=estimate_tokens(output),
                    total_tokens=estimate_tokens(prompt_text) + estimate_tokens(output),
                    output_preview=output_redaction.preview,
                    redaction_metadata=output_redaction.metadata,
                )
            )
        except Exception as exc:
            latency_ms = int((perf_counter() - start_time) * 1000)
            await self._emit(
                IngestionEvent(
                    event_id=new_id("evt"),
                    request_id=request_id,
                    conversation_id=conversation_id,
                    event_type="request_failed",
                    provider=provider,
                    model=model,
                    timestamp=now_utc(),
                    status="failed",
                    latency_ms=latency_ms,
                    error_type=exc.__class__.__name__,
                    error_message=str(exc),
                    prompt_tokens=estimate_tokens(prompt_text),
                    redaction_metadata={},
                )
            )
            raise
