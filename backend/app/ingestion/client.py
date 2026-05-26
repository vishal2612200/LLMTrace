from redis.exceptions import RedisError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.ingestion.publisher import EventPublisher
from app.ingestion.schemas import IngestionEvent
from llmtrace_sdk import LLMTraceClient, LLMTraceSDKError


class SDKIngestionClient:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.settings = get_settings()
        self.publisher = EventPublisher()

    async def send(self, event: IngestionEvent) -> None:
        if self.settings.sdk_ingestion_url:
            try:
                async with LLMTraceClient(
                    ingestion_url=self.settings.sdk_ingestion_url,
                    api_key=self.settings.ingestion_api_key,
                ) as client:
                    await client.emit(event)
                    return
            except (LLMTraceSDKError, RuntimeError):
                if not self.settings.inline_ingestion_fallback:
                    raise

        try:
            self.publisher.publish(self.db, event)
        except RedisError:
            if not self.settings.inline_ingestion_fallback:
                raise
            from app.ingestion.worker import normalize_event

            payload, _ = self.publisher.sanitize(event)
            self.publisher.persist_event(self.db, payload, payload.get("redaction_metadata") or {})
            normalize_event(self.db, payload)
