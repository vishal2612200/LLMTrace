import json
import re
from collections import Counter
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.ids import new_id
from app.core.redaction import redact_text
from app.core.runtime_config import get_runtime_config
from app.core.time import now_utc
from app.db.models import Conversation, ConversationCheckpoint, Message
from app.db.session import get_db
from app.llm.client import LLMClient
from app.llm.providers.base import estimate_tokens

router = APIRouter(prefix="/api/chat", tags=["chat"])
cancelled_conversations: dict[str, bool] = {}
MEMORY_BUCKETS = {
    "preferences": re.compile(r"\b(prefer|preference|use|always|never|like)\b", re.IGNORECASE),
    "task_state": re.compile(r"\b(goal|working on|status|target|environment|deploy|staging|production)\b", re.IGNORECASE),
    "decisions": re.compile(r"\b(decided|decision|approved|rejected|choose|chosen|selected)\b", re.IGNORECASE),
    "open_todos": re.compile(r"\b(todo|follow up|need to|next|fix|open)\b", re.IGNORECASE),
}


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    conversation_id: str | None = None
    provider: str | None = None
    model: str | None = None


def sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def store_message(db: Session, conversation_id: str, role: str, content: str, preview_chars: int | None = None) -> Message:
    redacted = redact_text(content, preview_chars=preview_chars)
    message = Message(
        id=new_id("msg"),
        conversation_id=conversation_id,
        role=role,
        preview=redacted.preview,
        redacted_content=redacted.redacted,
        content_hash=redacted.content_hash,
        token_count=estimate_tokens(redacted.redacted),
        redaction_metadata=redacted.metadata,
    )
    db.add(message)
    db.commit()
    return message


def _conversation_rows(db: Session, conversation_id: str) -> list[Message]:
    return db.query(Message).filter(Message.conversation_id == conversation_id).order_by(Message.created_at.asc()).all()


def _token_budget_rows(rows: list[Message], max_messages: int, token_budget: int) -> list[Message]:
    selected: list[Message] = []
    used_tokens = 0
    for row in reversed(rows[-max_messages:]):
        row_tokens = max(1, row.token_count)
        if selected and used_tokens + row_tokens > token_budget:
            break
        selected.append(row)
        used_tokens += row_tokens
    return list(reversed(selected))


def _checkpoint_context(rows: list[Message]) -> list[dict[str, Any]]:
    return [
        {
            "message_id": row.id,
            "role": row.role,
            "content": row.redacted_content or row.preview,
            "token_count": row.token_count,
        }
        for row in rows
        if row.role in {"user", "assistant", "system"}
    ]


def _clip(value: str, limit: int = 180) -> str:
    cleaned = " ".join(value.split())
    return cleaned if len(cleaned) <= limit else f"{cleaned[: limit - 1]}…"


def _split_notes(value: str) -> list[str]:
    return [part.strip() for part in re.split(r"[\n.!?]+", value) if part.strip()]


def _dedupe_append(items: list[str], value: str, limit: int = 6) -> None:
    clipped = _clip(value, 140)
    if clipped and clipped not in items:
        items.append(clipped)
    del items[:-limit]


def _extract_structured_memory(rows: list[Message]) -> dict[str, list[str]]:
    memory = {"preferences": [], "task_state": [], "decisions": [], "open_todos": []}
    for row in rows:
        if row.role != "user":
            continue
        for note in _split_notes(row.redacted_content or row.preview):
            for bucket, pattern in MEMORY_BUCKETS.items():
                if pattern.search(note):
                    _dedupe_append(memory[bucket], note)
    return memory


def _summarize_rows(rows: list[Message]) -> str:
    if not rows:
        return ""
    snippets = [f"{row.role}: {_clip(row.redacted_content or row.preview, 150)}" for row in rows[-10:]]
    return " | ".join(snippets)


def update_conversation_memory(db: Session, conversation: Conversation) -> None:
    runtime = get_runtime_config(db)
    rows = _conversation_rows(db, conversation.id)
    recent_rows = _token_budget_rows(rows, runtime.context_window_messages, runtime.context_window_tokens)
    recent_ids = {row.id for row in recent_rows}
    older_rows = [row for row in rows if row.id not in recent_ids]
    conversation.rolling_summary = _summarize_rows(older_rows)
    conversation.structured_memory = _extract_structured_memory(rows)
    conversation.updated_at = now_utc()
    db.commit()


def _memory_prompt(conversation: Conversation) -> str | None:
    memory = conversation.structured_memory or {}
    lines: list[str] = []
    for label, values in [
        ("Preferences", memory.get("preferences") or []),
        ("Task state", memory.get("task_state") or []),
        ("Decisions", memory.get("decisions") or []),
        ("Open TODOs", memory.get("open_todos") or []),
    ]:
        if values:
            lines.append(f"{label}: " + " | ".join(values))
    return "\n".join(lines) if lines else None


def _checkpoint_summary(reason: str, rows: list[Message]) -> str:
    redactions: Counter[str] = Counter()
    for row in rows:
        redactions.update(row.redaction_metadata or {})
    latest_user = next((row for row in reversed(rows) if row.role == "user"), None)
    latest_assistant = next((row for row in reversed(rows) if row.role == "assistant"), None)
    parts = [
        f"reason={reason}",
        f"messages={len(rows)}",
        f"tokens={sum(row.token_count for row in rows)}",
    ]
    if latest_user:
        parts.append(f"latest_user={_clip(latest_user.redacted_content or latest_user.preview)}")
    if latest_assistant:
        parts.append(f"latest_assistant={_clip(latest_assistant.redacted_content or latest_assistant.preview)}")
    if redactions:
        parts.append("redactions=" + ", ".join(f"{key}:{value}" for key, value in sorted(redactions.items())))
    return "; ".join(parts)


def create_checkpoint(db: Session, conversation_id: str, reason: str, context: list[dict[str, Any]] | None = None) -> ConversationCheckpoint:
    rows = _conversation_rows(db, conversation_id)
    sequence = (
        db.query(func.coalesce(func.max(ConversationCheckpoint.sequence), 0))
        .filter(ConversationCheckpoint.conversation_id == conversation_id)
        .scalar()
        + 1
    )
    context_messages = context if context is not None else _checkpoint_context(_token_budget_rows(rows, get_runtime_config(db).context_window_messages, get_runtime_config(db).context_window_tokens))
    checkpoint = ConversationCheckpoint(
        id=new_id("ckpt"),
        conversation_id=conversation_id,
        sequence=sequence,
        reason=reason,
        summary=_checkpoint_summary(reason, rows),
        context_messages=context_messages,
        message_count=len(rows),
        token_count=sum(row.token_count for row in rows),
    )
    db.add(checkpoint)
    db.commit()
    return checkpoint


def context_messages(db: Session, conversation_id: str) -> list[dict[str, str]]:
    runtime = get_runtime_config(db)
    conversation = db.get(Conversation, conversation_id)
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    rows = _conversation_rows(db, conversation_id)
    recent_rows = _token_budget_rows(rows, runtime.context_window_messages, runtime.context_window_tokens)
    messages: list[dict[str, str]] = []
    if conversation.rolling_summary:
        messages.append({"role": "system", "content": f"Rolling conversation summary: {conversation.rolling_summary}"})
    memory_prompt = _memory_prompt(conversation)
    if memory_prompt:
        messages.append({"role": "system", "content": f"Structured conversation memory:\n{memory_prompt}"})
    messages.extend(
        {"role": item["role"], "content": item["content"]}
        for item in _checkpoint_context(recent_rows)
    )
    return messages


@router.post("/stream")
async def chat_stream(payload: ChatRequest, db: Session = Depends(get_db)):
    runtime = get_runtime_config(db)
    provider = payload.provider or runtime.default_provider
    model = payload.model or runtime.default_model
    conversation = None
    if payload.conversation_id:
        conversation = db.query(Conversation).filter(Conversation.id == payload.conversation_id).first()
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
    if not conversation:
        title = redact_text(payload.message, preview_chars=runtime.preview_chars).preview[:80] or "New conversation"
        conversation = Conversation(id=new_id("conv"), title=title, provider=provider, model=model)
        db.add(conversation)
        db.commit()
    conversation.status = "active"
    conversation.provider = provider
    conversation.model = model
    conversation.updated_at = now_utc()
    db.commit()
    cancelled_conversations[conversation.id] = False
    store_message(db, conversation.id, "user", payload.message, preview_chars=runtime.preview_chars)
    update_conversation_memory(db, conversation)
    request_id = new_id("req")
    messages = [{"role": "system", "content": "You are a concise, helpful assistant."}] + context_messages(db, conversation.id)
    create_checkpoint(db, conversation.id, "pre_model", context=messages)
    client = LLMClient(db)

    async def generate():
        assistant_text = ""
        yield sse("metadata", {"conversation_id": conversation.id, "request_id": request_id})
        try:
            async for chunk in client.stream(
                conversation_id=conversation.id,
                request_id=request_id,
                provider=provider,
                model=model,
                messages=messages,
                cancel_check=lambda: cancelled_conversations.get(conversation.id, False),
            ):
                assistant_text += chunk
                yield sse("token", {"chunk": chunk})
            if cancelled_conversations.get(conversation.id, False):
                conversation.status = "cancelled"
                conversation.cancelled_at = now_utc()
                db.commit()
                create_checkpoint(db, conversation.id, "cancelled", context=messages)
                yield sse("done", {"status": "cancelled"})
                return
            if assistant_text:
                store_message(db, conversation.id, "assistant", assistant_text, preview_chars=runtime.preview_chars)
                update_conversation_memory(db, conversation)
            conversation.status = "completed"
            conversation.updated_at = now_utc()
            db.commit()
            create_checkpoint(db, conversation.id, "turn_complete")
            yield sse("done", {"status": "completed"})
        except Exception as exc:
            conversation.status = "failed"
            conversation.updated_at = now_utc()
            db.commit()
            create_checkpoint(db, conversation.id, "failed", context=messages)
            yield sse("error", {"message": str(exc)})

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/{conversation_id}/cancel")
def cancel_chat(conversation_id: str, db: Session = Depends(get_db)):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    cancelled_conversations[conversation_id] = True
    conversation.status = "cancelled"
    conversation.cancelled_at = now_utc()
    conversation.updated_at = now_utc()
    db.commit()
    create_checkpoint(db, conversation_id, "cancelled")
    return {"cancelled": True, "conversation_id": conversation_id}
