from app.api.chat import store_message
from app.core.ids import new_id
from app.core.redaction import redact_text
from app.db.models import Conversation, Message
from app.db.session import SessionLocal


def test_conversation_title_and_messages_store_redacted_previews_only():
    db = SessionLocal()
    raw = "hello from person@example.com with Bearer sk-title12345678901234567890"
    redacted_title = redact_text(raw).preview[:80]
    conversation = Conversation(id=new_id("conv"), title=redacted_title, provider="mock", model="mock-fast")
    db.add(conversation)
    db.commit()

    store_message(db, conversation.id, "user", raw)

    saved_conversation = db.query(Conversation).filter(Conversation.id == conversation.id).one()
    saved_message = db.query(Message).filter(Message.conversation_id == conversation.id).one()
    assert "person@example.com" not in saved_conversation.title
    assert "sk-title" not in saved_conversation.title
    assert "[EMAIL_REDACTED]" in saved_conversation.title
    assert "person@example.com" not in saved_message.preview
    assert "sk-title" not in saved_message.preview
    assert "[API_KEY_REDACTED]" in saved_message.preview
    db.close()
