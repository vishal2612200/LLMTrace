from collections import defaultdict
from datetime import datetime

from sqlalchemy.orm import Session

from app.db.models import InferenceRequest


def _percentile(values: list[int], pct: float) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    idx = min(len(ordered) - 1, int(round((len(ordered) - 1) * pct)))
    return ordered[idx]


def summary(db: Session) -> dict:
    rows = db.query(InferenceRequest).all()
    latencies = [row.latency_ms for row in rows if row.latency_ms is not None]
    errors = [row for row in rows if row.status == "failed"]
    total_tokens = sum(row.total_tokens or 0 for row in rows)
    total = len(rows)
    return {
        "total_requests": total,
        "p50_latency_ms": _percentile(latencies, 0.50),
        "p95_latency_ms": _percentile(latencies, 0.95),
        "error_rate": round((len(errors) / total) if total else 0, 4),
        "total_tokens": total_tokens,
        "recent_failures": [
            {
                "id": row.id,
                "provider": row.provider,
                "model": row.model,
                "error_type": row.error_type,
                "error_message": row.error_message,
                "created_at": row.created_at.isoformat(),
            }
            for row in sorted(errors, key=lambda item: item.created_at, reverse=True)[:5]
        ],
    }


def timeseries(db: Session) -> list[dict]:
    buckets: dict[str, dict] = defaultdict(lambda: {"requests": 0, "errors": 0, "latencies": []})
    for row in db.query(InferenceRequest).all():
        ts = row.started_at or row.created_at or datetime.utcnow()
        key = ts.replace(minute=0, second=0, microsecond=0).isoformat()
        buckets[key]["requests"] += 1
        if row.status == "failed":
            buckets[key]["errors"] += 1
        if row.latency_ms is not None:
            buckets[key]["latencies"].append(row.latency_ms)
    return [
        {
            "bucket": key,
            "requests": value["requests"],
            "errors": value["errors"],
            "p95_latency_ms": _percentile(value["latencies"], 0.95),
        }
        for key, value in sorted(buckets.items())
    ]


def provider_breakdown(db: Session) -> list[dict]:
    buckets: dict[tuple[str, str], dict] = defaultdict(lambda: {"requests": 0, "errors": 0, "tokens": 0})
    for row in db.query(InferenceRequest).all():
        key = (row.provider, row.model)
        buckets[key]["requests"] += 1
        buckets[key]["tokens"] += row.total_tokens or 0
        if row.status == "failed":
            buckets[key]["errors"] += 1
    return [
        {"provider": provider, "model": model, **value}
        for (provider, model), value in sorted(buckets.items())
    ]
