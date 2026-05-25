from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.security import rate_limit_ingestion, require_ingestion_key
from app.db.session import get_db
from app.ingestion.dlq import read_dlq, replay_dlq_event
from app.ingestion.publisher import EventPublisher
from app.ingestion.schemas import IngestionAccepted, IngestionEvent

router = APIRouter(prefix="/api/ingest", tags=["ingestion"])


@router.post("/logs", response_model=IngestionAccepted)
def ingest_log(
    event: IngestionEvent,
    request: Request,
    db: Session = Depends(get_db),
    _: None = Depends(require_ingestion_key),
):
    rate_limit_ingestion(request)
    payload = EventPublisher().publish(db, event)
    return IngestionAccepted(accepted=True, event_id=payload["event_id"])


@router.get("/dlq")
def dlq(limit: int = 50, _: None = Depends(require_ingestion_key)):
    return read_dlq(limit=limit)


@router.post("/dlq/{message_id}/replay")
def replay_dlq(message_id: str, db: Session = Depends(get_db), _: None = Depends(require_ingestion_key)):
    return replay_dlq_event(db, message_id)
