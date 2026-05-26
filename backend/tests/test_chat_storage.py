from app.api.chat import context_messages, create_checkpoint, store_message, update_conversation_memory
from app.core.ids import new_id
from app.core.redaction import redact_text
from app.db.models import Conversation, ConversationCheckpoint, Message, RuntimeSetting
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
    assert "person@example.com" not in saved_message.redacted_content
    assert "sk-title" not in saved_message.redacted_content
    assert "[EMAIL_REDACTED]" in saved_message.redacted_content
    db.close()


def test_conversation_checkpoint_stores_redacted_context_and_is_used_for_resume():
    db = SessionLocal()
    conversation = Conversation(id=new_id("conv"), title="Checkpoint test", provider="mock", model="mock-fast")
    db.add(conversation)
    db.commit()

    store_message(db, conversation.id, "user", "Remember alice@example.com and token sk-checkpoint123456789012345")
    store_message(db, conversation.id, "assistant", "Stored safely for the next turn.")
    update_conversation_memory(db, conversation)
    checkpoint = create_checkpoint(db, conversation.id, "turn_complete")

    saved_checkpoint = db.query(ConversationCheckpoint).filter(ConversationCheckpoint.id == checkpoint.id).one()
    resumed_context = context_messages(db, conversation.id)

    assert saved_checkpoint.sequence == 1
    assert saved_checkpoint.reason == "turn_complete"
    assert saved_checkpoint.message_count == 2
    assert "[EMAIL_REDACTED]" in saved_checkpoint.summary
    assert "alice@example.com" not in saved_checkpoint.summary
    assert "sk-checkpoint" not in saved_checkpoint.summary
    assert any(message["content"].startswith("Remember [EMAIL_REDACTED]") for message in resumed_context)
    db.close()


def test_context_uses_token_budget_rolling_summary_and_structured_memory():
    db = SessionLocal()
    db.add(
        RuntimeSetting(
            key="app",
            value_json={
                "default_provider": "mock",
                "default_model": "mock-fast",
                "context_window_messages": 50,
                "context_window_tokens": 200,
                "preview_chars": 500,
            },
        )
    )
    conversation = Conversation(id=new_id("conv"), title="Context test", provider="mock", model="mock-fast")
    db.add(conversation)
    db.commit()

    store_message(db, conversation.id, "user", "The deploy target is staging. Please remember this task state.")
    store_message(db, conversation.id, "assistant", "I will keep staging as the target. " + "filler " * 230)
    store_message(db, conversation.id, "user", "Use concise answers. Next, fix the login redirect.")
    update_conversation_memory(db, conversation)

    resumed_context = context_messages(db, conversation.id)
    reloaded = db.query(Conversation).filter(Conversation.id == conversation.id).one()

    assert reloaded.structured_memory["task_state"]
    assert reloaded.structured_memory["preferences"]
    assert reloaded.structured_memory["open_todos"]
    assert "deploy target is staging" in reloaded.rolling_summary
    assert any(message["role"] == "system" and "Structured conversation memory" in message["content"] for message in resumed_context)
    assert any("deploy target is staging" in message["content"] for message in resumed_context)
    assert not any(message["role"] == "assistant" and "I will keep staging" in message["content"] for message in resumed_context)
    assert all("qa@example.com" not in message["content"] for message in resumed_context)
    db.close()
