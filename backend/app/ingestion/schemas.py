from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


EventType = Literal[
    "request_started",
    "token_chunk",
    "request_completed",
    "request_failed",
    "request_cancelled",
]


class IngestionEvent(BaseModel):
    event_id: str = Field(min_length=8)
    request_id: str = Field(min_length=8)
    conversation_id: str = Field(min_length=8)
    event_type: EventType
    provider: str
    model: str
    timestamp: datetime
    status: str | None = None
    latency_ms: int | None = Field(default=None, ge=0)
    prompt_tokens: int | None = Field(default=None, ge=0)
    completion_tokens: int | None = Field(default=None, ge=0)
    total_tokens: int | None = Field(default=None, ge=0)
    input_preview: str | None = None
    output_preview: str | None = None
    error_type: str | None = None
    error_message: str | None = None
    redaction_metadata: dict[str, int] = Field(default_factory=dict)
    payload: dict[str, Any] = Field(default_factory=dict)


class IngestionAccepted(BaseModel):
    accepted: bool
    event_id: str
