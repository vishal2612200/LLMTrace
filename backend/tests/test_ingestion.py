from datetime import UTC, datetime

from app.core.ids import new_id
from app.db.models import InferenceEvent, InferenceRequest
from app.db.session import SessionLocal, init_db
from app.ingestion.publisher import EventPublisher
from app.ingestion.schemas import IngestionEvent
from app.ingestion.worker import normalize_event


def test_normalize_event_is_idempotent_for_request_record():
    init_db()
    db = SessionLocal()
    request_id = new_id("req")
    payload = IngestionEvent(
        event_id=new_id("evt"),
        request_id=request_id,
        conversation_id=new_id("conv"),
        event_type="request_completed",
        provider="mock",
        model="mock-fast",
        timestamp=datetime.now(UTC),
        status="completed",
        latency_ms=42,
        prompt_tokens=5,
        completion_tokens=7,
        total_tokens=12,
    ).model_dump(mode="json")

    normalize_event(db, payload)
    normalize_event(db, payload)

    rows = db.query(InferenceRequest).filter(InferenceRequest.id == request_id).all()
    assert len(rows) == 1
    assert rows[0].status == "completed"
    assert rows[0].total_tokens == 12
    db.close()


def test_publish_duplicate_event_id_persists_and_queues_once():
    db = SessionLocal()
    event_id = new_id("evt")
    event = IngestionEvent(
        event_id=event_id,
        request_id=new_id("req"),
        conversation_id=new_id("conv"),
        event_type="request_started",
        provider="mock",
        model="mock-fast",
        timestamp=datetime.now(UTC),
        status="started",
        input_preview="email [EMAIL_REDACTED]",
    )

    class FakeRedis:
        def __init__(self):
            self.calls = []

        def xadd(self, stream, payload):
            self.calls.append((stream, payload))

    publisher = EventPublisher()
    fake_redis = FakeRedis()
    publisher.redis = fake_redis

    publisher.publish(db, event)
    publisher.publish(db, event)

    assert db.query(InferenceEvent).filter(InferenceEvent.event_id == event_id).count() == 1
    assert len(fake_redis.calls) == 1
    db.close()
