import json
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.ids import new_id
from app.core.redaction import redact_text
from app.core.time import now_utc
from app.db.models import Conversation, Message
from app.db.session import get_db
from app.llm.client import LLMClient
from app.llm.providers.base import estimate_tokens

router = APIRouter(prefix="/api/chat", tags=["chat"])
cancelled_conversations: dict[str, bool] = {}


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    conversation_id: str | None = None
    provider: str | None = None
    model: str | None = None


def sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


def store_message(db: Session, conversation_id: str, role: str, content: str) -> Message:
    redacted = redact_text(content)
    message = Message(
        id=new_id("msg"),
        conversation_id=conversation_id,
        role=role,
        preview=redacted.preview,
        content_hash=redacted.content_hash,
        token_count=estimate_tokens(redacted.redacted),
        redaction_metadata=redacted.metadata,
    )
    db.add(message)
    db.commit()
    return message


def context_messages(db: Session, conversation_id: str) -> list[dict[str, str]]:
    settings = get_settings()
    rows = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.desc())
        .limit(settings.context_window_messages)
        .all()
    )
    ordered = list(reversed(rows))
    return [{"role": row.role, "content": row.preview} for row in ordered if row.role in {"user", "assistant", "system"}]


@router.post("/stream")
async def chat_stream(payload: ChatRequest, db: Session = Depends(get_db)):
    settings = get_settings()
    provider = payload.provider or settings.default_provider
    model = payload.model or settings.default_model
    conversation = None
    if payload.conversation_id:
        conversation = db.query(Conversation).filter(Conversation.id == payload.conversation_id).first()
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
    if not conversation:
        title = redact_text(payload.message).preview[:80] or "New conversation"
        conversation = Conversation(id=new_id("conv"), title=title, provider=provider, model=model)
        db.add(conversation)
        db.commit()
    conversation.status = "active"
    conversation.provider = provider
    conversation.model = model
    conversation.updated_at = now_utc()
    db.commit()
    cancelled_conversations[conversation.id] = False
    store_message(db, conversation.id, "user", payload.message)
    request_id = new_id("req")
    messages = [{"role": "system", "content": "You are a concise, helpful assistant."}] + context_messages(db, conversation.id)
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
                yield sse("done", {"status": "cancelled"})
                return
            if assistant_text:
                store_message(db, conversation.id, "assistant", assistant_text)
            conversation.status = "completed"
            conversation.updated_at = now_utc()
            db.commit()
            yield sse("done", {"status": "completed"})
        except Exception as exc:
            conversation.status = "failed"
            conversation.updated_at = now_utc()
            db.commit()
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
    return {"cancelled": True, "conversation_id": conversation_id}
