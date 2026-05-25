import json
from collections import Counter
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.ids import new_id
from app.core.redaction import redact_payload, redact_text
from app.core.time import now_utc
from app.db.models import AgentRun, EvalCase, HumanApproval, ToolCall, VerificationResult
from app.db.session import get_db
from app.harness.schemas import (
    AgentRunCreate,
    AgentRunDetail,
    AgentRunPatch,
    AgentRunSummary,
    ApprovalDecision,
    EvalCaseOut,
    EvalRunOut,
    FixtureLoadResult,
    HarnessAccepted,
    HarnessMetricsSummary,
    HumanApprovalOut,
    ToolCallCreate,
    ToolCallOut,
    VerificationResultCreate,
    VerificationResultOut,
)

router = APIRouter(prefix="/api/harness", tags=["harness"])


def _run_or_404(db: Session, run_id: str) -> AgentRun:
    run = (
        db.query(AgentRun)
        .options(
            selectinload(AgentRun.tool_calls),
            selectinload(AgentRun.verification_results),
            selectinload(AgentRun.approvals),
            selectinload(AgentRun.eval_runs),
        )
        .filter(AgentRun.id == run_id)
        .first()
    )
    if not run:
        raise HTTPException(status_code=404, detail="Agent run not found")
    return run


def _redact_optional_text(value: str | None) -> str | None:
    return redact_text(value).preview if value else None


def _verification_status(run: AgentRun) -> str:
    if not run.verification_results:
        return "not_run"
    if any(result.status == "failed" for result in run.verification_results):
        return "failed"
    if any(result.status == "passed" for result in run.verification_results):
        return "passed"
    return "skipped"


def _approval_status(run: AgentRun) -> str:
    if not run.approvals:
        return "none"
    if any(approval.status == "pending" for approval in run.approvals):
        return "pending"
    if any(approval.status == "rejected" for approval in run.approvals):
        return "rejected"
    return "approved"


def _summary(run: AgentRun) -> AgentRunSummary:
    return AgentRunSummary(
        id=run.id,
        name=run.name,
        task=run.task,
        status=run.status,
        failure_category=run.failure_category,
        started_at=run.started_at,
        ended_at=run.ended_at,
        latency_ms=run.latency_ms,
        tool_count=len(run.tool_calls),
        verification_status=_verification_status(run),
        approval_status=_approval_status(run),
    )


def _detail(run: AgentRun) -> AgentRunDetail:
    return AgentRunDetail(
        id=run.id,
        name=run.name,
        task=run.task,
        status=run.status,
        failure_category=run.failure_category,
        started_at=run.started_at,
        ended_at=run.ended_at,
        latency_ms=run.latency_ms,
        created_at=run.created_at,
        context_summary=run.context_summary,
        selected_context=run.selected_context,
        final_action=run.final_action,
        human_override=run.human_override,
        tool_calls=[ToolCallOut.model_validate(item) for item in run.tool_calls],
        verification_results=[VerificationResultOut.model_validate(item) for item in run.verification_results],
        approvals=[HumanApprovalOut.model_validate(item) for item in run.approvals],
        eval_runs=[EvalRunOut.model_validate(item) for item in run.eval_runs],
    )


@router.post("/runs", response_model=HarnessAccepted)
def create_run(payload: AgentRunCreate, db: Session = Depends(get_db)):
    selected_context, _ = redact_payload(payload.selected_context)
    run = AgentRun(
        id=new_id("run"),
        name=redact_text(payload.name).preview,
        task=redact_text(payload.task).preview,
        status="started",
        failure_category="none",
        context_summary=_redact_optional_text(payload.context_summary),
        selected_context=selected_context,
    )
    db.add(run)
    db.commit()
    return HarnessAccepted(id=run.id)


@router.patch("/runs/{run_id}", response_model=HarnessAccepted)
def update_run(run_id: str, payload: AgentRunPatch, db: Session = Depends(get_db)):
    run = _run_or_404(db, run_id)
    run.status = payload.status
    run.failure_category = payload.failure_category
    run.final_action = _redact_optional_text(payload.final_action)
    run.human_override = payload.human_override
    if payload.status in {"completed", "failed", "cancelled"}:
        run.ended_at = now_utc()
        run.latency_ms = max(0, int((run.ended_at - run.started_at).total_seconds() * 1000))
    db.commit()
    return HarnessAccepted(id=run.id)


@router.post("/runs/{run_id}/tool-calls", response_model=HarnessAccepted)
def create_tool_call(run_id: str, payload: ToolCallCreate, db: Session = Depends(get_db)):
    run = _run_or_404(db, run_id)
    tool_input, _ = redact_payload(payload.tool_input_json)
    call = ToolCall(
        id=new_id("tool"),
        agent_run_id=run.id,
        tool_name=payload.tool_name,
        tool_input_json=tool_input,
        tool_output_preview=_redact_optional_text(payload.tool_output),
        status=payload.status,
        latency_ms=payload.latency_ms,
        retry_count=payload.retry_count,
        risk_level=payload.risk_level,
        error_message=_redact_optional_text(payload.error_message),
    )
    db.add(call)
    if payload.risk_level == "high":
        run.status = "blocked_pending_approval"
        db.add(
            HumanApproval(
                id=new_id("approval"),
                agent_run_id=run.id,
                tool_call_id=call.id,
                risk_level="high",
                action=payload.tool_name,
                status="pending",
            )
        )
    db.commit()
    return HarnessAccepted(id=call.id)


@router.post("/runs/{run_id}/verification-results", response_model=HarnessAccepted)
def create_verification(run_id: str, payload: VerificationResultCreate, db: Session = Depends(get_db)):
    run = _run_or_404(db, run_id)
    result = VerificationResult(
        id=new_id("verify"),
        agent_run_id=run.id,
        check_type=payload.check_type,
        command=_redact_optional_text(payload.command),
        status=payload.status,
        expected_files=payload.expected_files,
        forbidden_files=payload.forbidden_files,
        result_summary=_redact_optional_text(payload.result_summary),
    )
    db.add(result)
    db.commit()
    return HarnessAccepted(id=result.id)


@router.post("/approvals/{approval_id}/decision", response_model=HarnessAccepted)
def decide_approval(approval_id: str, payload: ApprovalDecision, db: Session = Depends(get_db)):
    approval = db.query(HumanApproval).filter(HumanApproval.id == approval_id).first()
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")
    approval.status = payload.status
    approval.approver = payload.approver
    approval.decision_reason = _redact_optional_text(payload.decision_reason)
    approval.decided_at = now_utc()
    db.commit()
    return HarnessAccepted(id=approval.id)


@router.get("/runs", response_model=list[AgentRunSummary])
def list_runs(limit: int = 50, db: Session = Depends(get_db)):
    runs = (
        db.query(AgentRun)
        .options(selectinload(AgentRun.tool_calls), selectinload(AgentRun.verification_results), selectinload(AgentRun.approvals))
        .order_by(AgentRun.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_summary(run) for run in runs]


@router.get("/runs/{run_id}", response_model=AgentRunDetail)
def get_run(run_id: str, db: Session = Depends(get_db)):
    return _detail(_run_or_404(db, run_id))


@router.get("/metrics/summary", response_model=HarnessMetricsSummary)
def metrics_summary(db: Session = Depends(get_db)):
    runs = db.query(AgentRun).all()
    approvals = db.query(HumanApproval).all()
    tool_calls = db.query(ToolCall).filter(ToolCall.latency_ms.isnot(None)).all()
    completed = [run for run in runs if run.status in {"completed", "failed"}]
    passed = [run for run in completed if run.status == "completed" and run.failure_category == "none"]
    failures = Counter(run.failure_category for run in runs if run.failure_category != "none")
    approval_counts = Counter(approval.status for approval in approvals)
    avg_latency = int(sum(call.latency_ms or 0 for call in tool_calls) / len(tool_calls)) if tool_calls else 0
    return HarnessMetricsSummary(
        run_count=len(runs),
        pass_rate=(len(passed) / len(completed)) if completed else 0,
        failure_categories=dict(failures),
        approval_counts=dict(approval_counts),
        average_tool_latency_ms=avg_latency,
        pending_high_risk_approvals=sum(1 for item in approvals if item.status == "pending" and item.risk_level == "high"),
        most_common_failure_category=failures.most_common(1)[0][0] if failures else "none",
    )


@router.get("/evals", response_model=list[EvalCaseOut])
def list_evals(db: Session = Depends(get_db)):
    return db.query(EvalCase).order_by(EvalCase.category, EvalCase.name).all()


def _fixture_dir() -> Path:
    here = Path(__file__).resolve()
    candidates = [
        Path.cwd() / "evals",
        Path.cwd().parent / "evals",
        here.parents[3] / "evals",
        Path("/app/evals"),
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


@router.post("/evals/load-fixtures", response_model=FixtureLoadResult)
def load_eval_fixtures(db: Session = Depends(get_db)):
    root = _fixture_dir()
    if not root.exists():
        return FixtureLoadResult(loaded=0, skipped=0)
    loaded = 0
    skipped = 0
    for path in sorted(root.glob("*/*.json")):
        data = json.loads(path.read_text())
        exists = db.query(EvalCase).filter(EvalCase.name == data["name"], EvalCase.category == data["category"]).first()
        if exists:
            skipped += 1
            continue
        case = EvalCase(
            id=new_id("eval"),
            name=data["name"],
            category=data["category"],
            task=data["task"],
            expected_behavior=data["expected_behavior"],
            expected_files=data.get("expected_files", []),
            forbidden_files=data.get("forbidden_files", []),
            success_checks=data.get("success_checks", []),
        )
        db.add(case)
        loaded += 1
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Duplicate eval fixture")
    return FixtureLoadResult(loaded=loaded, skipped=skipped)
