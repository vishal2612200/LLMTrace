from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.metrics.queries import provider_breakdown, summary, timeseries

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.get("/summary")
def metrics_summary(db: Session = Depends(get_db)):
    return summary(db)


@router.get("/timeseries")
def metrics_timeseries(db: Session = Depends(get_db)):
    return timeseries(db)


@router.get("/providers")
def metrics_providers(db: Session = Depends(get_db)):
    return provider_breakdown(db)
