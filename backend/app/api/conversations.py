from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.models import Conversation, ConversationCheckpoint, InferenceRequest, Message
from app.db.session import get_db

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


@router.get("")
def list_conversations(db: Session = Depends(get_db)):
    rows = db.query(Conversation).order_by(Conversation.updated_at.desc()).all()
    return [
        {
            "id": row.id,
            "title": row.title,
            "status": row.status,
            "provider": row.provider,
            "model": row.model,
            "created_at": row.created_at.isoformat(),
            "updated_at": row.updated_at.isoformat(),
        }
        for row in rows
    ]


@router.get("/{conversation_id}")
def get_conversation(conversation_id: str, db: Session = Depends(get_db)):
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(status_code=404, detail="Conversation not found")
    messages = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    requests = (
        db.query(InferenceRequest)
        .filter(InferenceRequest.conversation_id == conversation_id)
        .order_by(InferenceRequest.created_at.desc())
        .all()
    )
    checkpoints = (
        db.query(ConversationCheckpoint)
        .filter(ConversationCheckpoint.conversation_id == conversation_id)
        .order_by(ConversationCheckpoint.sequence.desc())
        .limit(5)
        .all()
    )
    return {
        "id": conversation.id,
        "title": conversation.title,
        "status": conversation.status,
        "provider": conversation.provider,
        "model": conversation.model,
        "rolling_summary": conversation.rolling_summary,
        "structured_memory": conversation.structured_memory,
        "messages": [
            {
                "id": message.id,
                "role": message.role,
                "preview": message.preview,
                "token_count": message.token_count,
                "redaction_metadata": message.redaction_metadata,
                "created_at": message.created_at.isoformat(),
            }
            for message in messages
        ],
        "inference_logs": [
            {
                "id": req.id,
                "provider": req.provider,
                "model": req.model,
                "status": req.status,
                "latency_ms": req.latency_ms,
                "prompt_tokens": req.prompt_tokens,
                "completion_tokens": req.completion_tokens,
                "total_tokens": req.total_tokens,
                "error_type": req.error_type,
                "error_message": req.error_message,
                "started_at": req.started_at.isoformat() if req.started_at else None,
                "ended_at": req.ended_at.isoformat() if req.ended_at else None,
            }
            for req in requests
        ],
        "checkpoints": [
            {
                "id": checkpoint.id,
                "sequence": checkpoint.sequence,
                "reason": checkpoint.reason,
                "summary": checkpoint.summary,
                "message_count": checkpoint.message_count,
                "token_count": checkpoint.token_count,
                "context_messages": checkpoint.context_messages,
                "created_at": checkpoint.created_at.isoformat(),
            }
            for checkpoint in checkpoints
        ],
    }
