import json

from redis import Redis
from redis.exceptions import RedisError

from app.core.config import get_settings
from app.ingestion.worker import normalize_event


def read_dlq(limit: int = 50) -> list[dict]:
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        entries = redis.xrevrange(settings.dlq_stream, count=limit)
    except RedisError:
        return []
    return [{"id": item_id, **{k: _parse(v) for k, v in fields.items()}} for item_id, fields in entries]


def replay_dlq_event(db, message_id: str) -> dict:
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        entries = redis.xrange(settings.dlq_stream, min=message_id, max=message_id, count=1)
    except RedisError:
        return {"replayed": False, "reason": "dlq unavailable"}
    if not entries:
        return {"replayed": False, "reason": "message not found"}

    _, fields = entries[0]
    payload = _parse(fields.get("payload", "{}"))
    if not isinstance(payload, dict):
        return {"replayed": False, "reason": "payload is not JSON object"}
    normalize_event(db, payload)
    redis.xdel(settings.dlq_stream, message_id)
    return {"replayed": True, "message_id": message_id}


def _parse(value: str):
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value
