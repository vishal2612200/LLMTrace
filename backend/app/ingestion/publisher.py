import json
from typing import Any

from redis import Redis
from redis.exceptions import RedisError

from app.core.config import get_settings
from app.core.ids import new_id
from app.core.redaction import redact_payload
from app.db.models import InferenceEvent, RedactionAudit
from app.ingestion.schemas import IngestionEvent


class EventPublisher:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.redis = Redis.from_url(self.settings.redis_url, decode_responses=True)

    def sanitize(self, event: IngestionEvent) -> tuple[dict[str, Any], dict[str, int]]:
        raw = event.model_dump(mode="json")
        payload, counts = redact_payload(raw)
        merged = dict(payload.get("redaction_metadata") or {})
        for key, value in counts.items():
            merged[key] = merged.get(key, 0) + value
        payload["redaction_metadata"] = merged
        return payload, merged

    def persist_event(self, db, payload: dict[str, Any], redaction_counts: dict[str, int]) -> bool:
        exists = db.query(InferenceEvent).filter(InferenceEvent.event_id == payload["event_id"]).first()
        if exists:
            return False
        db.add(
            InferenceEvent(
                id=new_id("evtrow"),
                event_id=payload["event_id"],
                request_id=payload["request_id"],
                conversation_id=payload["conversation_id"],
                event_type=payload["event_type"],
                payload_json=payload,
            )
        )
        if redaction_counts:
            db.add(
                RedactionAudit(
                    id=new_id("redact"),
                    source_type="inference_event",
                    source_id=payload["event_id"],
                    redaction_counts=redaction_counts,
                )
            )
        db.commit()
        return True

    def publish(self, db, event: IngestionEvent) -> dict[str, Any]:
        payload, counts = self.sanitize(event)
        inserted = self.persist_event(db, payload, counts)
        if not inserted:
            return payload
        try:
            self.redis.xadd(self.settings.ingestion_stream, {"payload": json.dumps(payload)})
        except RedisError:
            if not self.settings.inline_ingestion_fallback:
                raise
            from app.ingestion.worker import normalize_event

            normalize_event(db, payload)
        return payload
