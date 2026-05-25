import httpx
from redis.exceptions import RedisError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.ingestion.publisher import EventPublisher
from app.ingestion.schemas import IngestionEvent


class SDKIngestionClient:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.settings = get_settings()
        self.publisher = EventPublisher()

    async def send(self, event: IngestionEvent) -> None:
        if self.settings.sdk_ingestion_url:
            headers = {}
            if self.settings.ingestion_api_key:
                headers["x-ingestion-key"] = self.settings.ingestion_api_key
            try:
                async with httpx.AsyncClient(timeout=2.0) as client:
                    response = await client.post(
                        self.settings.sdk_ingestion_url,
                        headers=headers,
                        json=event.model_dump(mode="json"),
                    )
                    response.raise_for_status()
                    return
            except (httpx.HTTPError, RuntimeError):
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
