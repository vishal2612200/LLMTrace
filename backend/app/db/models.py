from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.time import now_utc
from app.db.session import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    title: Mapped[str] = mapped_column(String(200), default="New conversation")
    status: Mapped[str] = mapped_column(String(32), default="active", index=True)
    provider: Mapped[str] = mapped_column(String(64))
    model: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, onupdate=now_utc, index=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    messages: Mapped[list["Message"]] = relationship(back_populates="conversation", cascade="all, delete-orphan")
    requests: Mapped[list["InferenceRequest"]] = relationship(back_populates="conversation", cascade="all, delete-orphan")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"), index=True)
    role: Mapped[str] = mapped_column(String(32))
    preview: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64))
    token_count: Mapped[int] = mapped_column(Integer, default=0)
    redaction_metadata: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")


class InferenceRequest(Base):
    __tablename__ = "inference_requests"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    conversation_id: Mapped[str] = mapped_column(ForeignKey("conversations.id"), index=True)
    provider: Mapped[str] = mapped_column(String(64), index=True)
    model: Mapped[str] = mapped_column(String(128), index=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    prompt_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    completion_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)

    conversation: Mapped[Conversation] = relationship(back_populates="requests")


class InferenceEvent(Base):
    __tablename__ = "inference_events"
    __table_args__ = (UniqueConstraint("event_id", name="uq_inference_events_event_id"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(96), nullable=False)
    request_id: Mapped[str] = mapped_column(String(64), index=True)
    conversation_id: Mapped[str] = mapped_column(String(64), index=True)
    event_type: Mapped[str] = mapped_column(String(64), index=True)
    payload_json: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)


class RedactionAudit(Base):
    __tablename__ = "redaction_audit"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    source_type: Mapped[str] = mapped_column(String(64), index=True)
    source_id: Mapped[str] = mapped_column(String(96), index=True)
    redaction_counts: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)


Index("ix_inference_provider_model", InferenceRequest.provider, InferenceRequest.model)


class AgentRun(Base):
    __tablename__ = "agent_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    task: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="started", index=True)
    failure_category: Mapped[str] = mapped_column(String(64), default="none", index=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc, index=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    context_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    selected_context: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    final_action: Mapped[str | None] = mapped_column(Text, nullable=True)
    human_override: Mapped[bool] = mapped_column(Boolean, default=False)

    tool_calls: Mapped[list["ToolCall"]] = relationship(back_populates="agent_run", cascade="all, delete-orphan")
    verification_results: Mapped[list["VerificationResult"]] = relationship(back_populates="agent_run", cascade="all, delete-orphan")
    approvals: Mapped[list["HumanApproval"]] = relationship(back_populates="agent_run", cascade="all, delete-orphan")
    eval_runs: Mapped[list["EvalRun"]] = relationship(back_populates="agent_run", cascade="all, delete-orphan")


class ToolCall(Base):
    __tablename__ = "tool_calls"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    agent_run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"), index=True)
    tool_name: Mapped[str] = mapped_column(String(120), index=True)
    tool_input_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    tool_output_preview: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, default=0)
    risk_level: Mapped[str] = mapped_column(String(32), default="low", index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)

    agent_run: Mapped[AgentRun] = relationship(back_populates="tool_calls")
    approvals: Mapped[list["HumanApproval"]] = relationship(back_populates="tool_call")


class VerificationResult(Base):
    __tablename__ = "verification_results"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    agent_run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"), index=True)
    check_type: Mapped[str] = mapped_column(String(64), index=True)
    command: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    expected_files: Mapped[list[str]] = mapped_column(JSON, default=list)
    forbidden_files: Mapped[list[str]] = mapped_column(JSON, default=list)
    result_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)

    agent_run: Mapped[AgentRun] = relationship(back_populates="verification_results")


class HumanApproval(Base):
    __tablename__ = "human_approvals"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    agent_run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"), index=True)
    tool_call_id: Mapped[str | None] = mapped_column(ForeignKey("tool_calls.id"), nullable=True, index=True)
    risk_level: Mapped[str] = mapped_column(String(32), index=True)
    action: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)
    approver: Mapped[str | None] = mapped_column(String(120), nullable=True)
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    agent_run: Mapped[AgentRun] = relationship(back_populates="approvals")
    tool_call: Mapped[ToolCall | None] = relationship(back_populates="approvals")


class EvalCase(Base):
    __tablename__ = "eval_cases"
    __table_args__ = (UniqueConstraint("name", "category", name="uq_eval_cases_name_category"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(120), index=True)
    task: Mapped[str] = mapped_column(Text)
    expected_behavior: Mapped[str] = mapped_column(Text)
    expected_files: Mapped[list[str]] = mapped_column(JSON, default=list)
    forbidden_files: Mapped[list[str]] = mapped_column(JSON, default=list)
    success_checks: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)

    eval_runs: Mapped[list["EvalRun"]] = relationship(back_populates="eval_case", cascade="all, delete-orphan")


class EvalRun(Base):
    __tablename__ = "eval_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    eval_case_id: Mapped[str] = mapped_column(ForeignKey("eval_cases.id"), index=True)
    agent_run_id: Mapped[str | None] = mapped_column(ForeignKey("agent_runs.id"), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), index=True)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    failure_category: Mapped[str] = mapped_column(String(64), default="none", index=True)
    result_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now_utc)

    eval_case: Mapped[EvalCase] = relationship(back_populates="eval_runs")
    agent_run: Mapped[AgentRun | None] = relationship(back_populates="eval_runs")
