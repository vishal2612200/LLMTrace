from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


RunStatus = Literal["started", "completed", "failed", "cancelled", "blocked_pending_approval"]
FailureCategory = Literal[
    "context_failure",
    "tool_failure",
    "planning_failure",
    "reasoning_failure",
    "verification_failure",
    "permission_failure",
    "format_failure",
    "model_failure",
    "none",
]
RiskLevel = Literal["low", "medium", "high"]
ApprovalStatus = Literal["pending", "approved", "rejected"]
ToolStatus = Literal["started", "completed", "failed", "cancelled"]
VerificationStatus = Literal["passed", "failed", "skipped"]


class AgentRunCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    task: str = Field(min_length=1)
    context_summary: str | None = None
    selected_context: dict[str, Any] = Field(default_factory=dict)


class AgentRunPatch(BaseModel):
    status: RunStatus
    failure_category: FailureCategory = "none"
    final_action: str | None = None
    human_override: bool = False


class ToolCallCreate(BaseModel):
    tool_name: str = Field(min_length=1, max_length=120)
    tool_input_json: dict[str, Any] = Field(default_factory=dict)
    tool_output: str | None = None
    status: ToolStatus
    latency_ms: int | None = Field(default=None, ge=0)
    retry_count: int = Field(default=0, ge=0)
    risk_level: RiskLevel = "low"
    error_message: str | None = None


class VerificationResultCreate(BaseModel):
    check_type: str = Field(min_length=1, max_length=64)
    command: str | None = None
    status: VerificationStatus
    expected_files: list[str] = Field(default_factory=list)
    forbidden_files: list[str] = Field(default_factory=list)
    result_summary: str | None = None


class ApprovalDecision(BaseModel):
    status: Literal["approved", "rejected"]
    approver: str = Field(min_length=1, max_length=120)
    decision_reason: str | None = None


class HarnessAccepted(BaseModel):
    id: str


class ToolCallOut(BaseModel):
    id: str
    tool_name: str
    tool_input_json: dict[str, Any]
    tool_output_preview: str | None
    status: str
    latency_ms: int | None
    retry_count: int
    risk_level: str
    error_message: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class VerificationResultOut(BaseModel):
    id: str
    check_type: str
    command: str | None
    status: str
    expected_files: list[str]
    forbidden_files: list[str]
    result_summary: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class HumanApprovalOut(BaseModel):
    id: str
    tool_call_id: str | None
    risk_level: str
    action: str
    status: str
    approver: str | None
    decision_reason: str | None
    created_at: datetime
    decided_at: datetime | None

    model_config = {"from_attributes": True}


class EvalCaseOut(BaseModel):
    id: str
    name: str
    category: str
    task: str
    expected_behavior: str
    expected_files: list[str]
    forbidden_files: list[str]
    success_checks: list[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class EvalRunOut(BaseModel):
    id: str
    eval_case_id: str
    agent_run_id: str | None
    status: str
    score: int | None
    failure_category: str
    result_summary: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AgentRunSummary(BaseModel):
    id: str
    name: str
    task: str
    status: str
    failure_category: str
    started_at: datetime
    ended_at: datetime | None
    latency_ms: int | None
    tool_count: int
    verification_status: str
    approval_status: str


class AgentRunDetail(BaseModel):
    id: str
    name: str
    task: str
    status: str
    failure_category: str
    started_at: datetime
    ended_at: datetime | None
    latency_ms: int | None
    created_at: datetime
    context_summary: str | None
    selected_context: dict[str, Any]
    final_action: str | None
    human_override: bool
    tool_calls: list[ToolCallOut]
    verification_results: list[VerificationResultOut]
    approvals: list[HumanApprovalOut]
    eval_runs: list[EvalRunOut]


class HarnessMetricsSummary(BaseModel):
    run_count: int
    pass_rate: float
    failure_categories: dict[str, int]
    approval_counts: dict[str, int]
    average_tool_latency_ms: int
    pending_high_risk_approvals: int
    most_common_failure_category: str


class FixtureLoadResult(BaseModel):
    loaded: int
    skipped: int
