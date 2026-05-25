import json
import time
from datetime import UTC, datetime
from typing import Any

from redis import Redis
from redis.exceptions import ResponseError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.ids import new_id
from app.db.models import InferenceRequest
from app.db.session import SessionLocal, init_db


TERMINAL_EVENTS = {"request_completed": "completed", "request_failed": "failed", "request_cancelled": "cancelled"}


def parse_ts(value: str | None) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(UTC).replace(tzinfo=None)
    return parsed


def normalize_event(db: Session, payload: dict[str, Any]) -> None:
    request_id = payload["request_id"]
    record = db.query(InferenceRequest).filter(InferenceRequest.id == request_id).first()
    if not record:
        record = InferenceRequest(
            id=request_id,
            conversation_id=payload["conversation_id"],
            provider=payload["provider"],
            model=payload["model"],
            status="started",
            started_at=parse_ts(payload.get("timestamp")),
        )
        db.add(record)

    event_type = payload["event_type"]
    if event_type == "request_started":
        record.status = "started"
        record.started_at = parse_ts(payload.get("timestamp")) or record.started_at
    elif event_type in TERMINAL_EVENTS:
        record.status = TERMINAL_EVENTS[event_type]
        record.ended_at = parse_ts(payload.get("timestamp")) or record.ended_at
        record.latency_ms = payload.get("latency_ms") or record.latency_ms
        record.prompt_tokens = payload.get("prompt_tokens") or record.prompt_tokens
        record.completion_tokens = payload.get("completion_tokens") or record.completion_tokens
        record.total_tokens = payload.get("total_tokens") or record.total_tokens
        record.error_type = payload.get("error_type")
        record.error_message = payload.get("error_message")
    db.commit()


def run_worker() -> None:
    settings = get_settings()
    init_db()
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        redis.xgroup_create(settings.ingestion_stream, settings.worker_group, id="0", mkstream=True)
    except ResponseError as exc:
        if "BUSYGROUP" not in str(exc):
            raise

    consumer = f"worker-{new_id('c')}"
    while True:
        messages = redis.xreadgroup(
            settings.worker_group,
            consumer,
            {settings.ingestion_stream: ">"},
            count=10,
            block=5000,
        )
        if not messages:
            continue
        with SessionLocal() as db:
            for _, entries in messages:
                for message_id, fields in entries:
                    try:
                        payload = json.loads(fields["payload"])
                        normalize_event(db, payload)
                        redis.xack(settings.ingestion_stream, settings.worker_group, message_id)
                    except Exception as exc:  # pragma: no cover - defensive worker path
                        redis.xadd(settings.dlq_stream, {"payload": fields.get("payload", "{}"), "error": str(exc)})
                        redis.xack(settings.ingestion_stream, settings.worker_group, message_id)
        time.sleep(0.05)


if __name__ == "__main__":
    run_worker()
