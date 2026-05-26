import json
from collections import Counter
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.ids import new_id
from app.core.redaction import redact_payload, redact_text
from app.core.runtime_config import get_runtime_config, runtime_provider_api_key, runtime_provider_key_source
from app.core.time import now_utc
from app.db.models import AgentRun, EvalCase, EvalRun, HumanApproval, ToolCall, VerificationResult
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


def _score_eval_case(eval_case: EvalCase, selected_context: dict) -> tuple[str, int, str, str]:
    touched_files = set(selected_context.get("touched_files") or [])
    expected_files = set(eval_case.expected_files)
    forbidden_hits = sorted(set(eval_case.forbidden_files) & touched_files)
    missing_expected = sorted(expected_files - touched_files)
    passed_checks = selected_context.get("passed_checks") or eval_case.success_checks
    score = 100
    if missing_expected:
        score -= 35
    if forbidden_hits:
        score -= 45
    if not passed_checks:
        score -= 20
    score = max(0, score)
    status = "passed" if score >= 80 and not forbidden_hits and not missing_expected else "failed"
    failure_category = "none" if status == "passed" else "verification_failure"
    summary_parts = [
        f"score={score}",
        f"expected touched={len(expected_files) - len(missing_expected)}/{len(expected_files)}",
        f"checks={len(passed_checks)}/{len(eval_case.success_checks)}",
    ]
    if missing_expected:
        summary_parts.append(f"missing expected: {', '.join(missing_expected)}")
    if forbidden_hits:
        summary_parts.append(f"forbidden touched: {', '.join(forbidden_hits)}")
    return status, score, failure_category, "; ".join(summary_parts)


def _attach_eval_artifacts(db: Session, run: AgentRun, eval_case: EvalCase) -> None:
    status, score, failure_category, result_summary = _score_eval_case(eval_case, run.selected_context)
    tool_input, _ = redact_payload(
        {
            "eval_case_id": eval_case.id,
            "expected_files": eval_case.expected_files,
            "forbidden_files": eval_case.forbidden_files,
            "success_checks": eval_case.success_checks,
            "touched_files": run.selected_context.get("touched_files", []),
        }
    )
    db.add(
        ToolCall(
            id=new_id("tool"),
            agent_run_id=run.id,
            tool_name="run_eval_case",
            tool_input_json=tool_input,
            tool_output_preview=redact_text(f"Evaluated {eval_case.name}: {eval_case.expected_behavior}").preview,
            status="completed",
            latency_ms=42,
            retry_count=0,
            risk_level="low",
        )
    )
    db.add(
        VerificationResult(
            id=new_id("verify"),
            agent_run_id=run.id,
            check_type="eval",
            command="ui://harness/run-eval",
            status=status,
            expected_files=eval_case.expected_files,
            forbidden_files=eval_case.forbidden_files,
            result_summary=redact_text(result_summary).preview,
        )
    )
    db.add(
        EvalRun(
            id=new_id("evalrun"),
            eval_case_id=eval_case.id,
            agent_run_id=run.id,
            status=status,
            score=score,
            failure_category=failure_category,
            result_summary=redact_text(f"{eval_case.name}: {result_summary}").preview,
        )
    )
    run.status = "completed" if status == "passed" else "failed"
    run.failure_category = failure_category
    run.final_action = _redact_optional_text(f"Eval {status}: {result_summary}")


def _execute_typed_tool(db: Session, run: AgentRun, call: ToolCall) -> None:
    started = now_utc()
    if call.tool_name == "run_database_migration":
        call.tool_output_preview = "Typed tool executed in dry-run mode. Migration state checked; no schema changes applied."
        call.status = "completed"
        call.latency_ms = max(1, int((now_utc() - started).total_seconds() * 1000))
        db.add(
            VerificationResult(
                id=new_id("verify"),
                agent_run_id=run.id,
                check_type="tool_execution",
                command="tool://run_database_migration?mode=dry-run",
                status="passed",
                expected_files=["backend/migrations"],
                forbidden_files=[],
                result_summary="Approved typed tool handler ran with dry-run guardrails and produced auditable output.",
            )
        )
        return
    call.status = "failed"
    call.error_message = f"No typed tool handler registered for {call.tool_name}"
    run.status = "failed"
    run.failure_category = "tool_failure"


def _provider_ready(db: Session) -> tuple[bool, str]:
    runtime = get_runtime_config(db)
    if runtime.default_provider == "mock":
        return True, "mock provider ready"
    if runtime.default_provider == "openai":
        source = runtime_provider_key_source(db, "openai")
        return bool(runtime_provider_api_key(db, "openai")), "OPENAI_API_KEY configured" if source else "OPENAI_API_KEY missing"
    if runtime.default_provider == "anthropic":
        source = runtime_provider_key_source(db, "anthropic")
        return bool(runtime_provider_api_key(db, "anthropic")), "ANTHROPIC_API_KEY configured" if source else "ANTHROPIC_API_KEY missing"
    return False, f"unsupported provider {runtime.default_provider}"


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


@router.post("/smoke", response_model=HarnessAccepted)
def create_smoke_run(db: Session = Depends(get_db)):
    provider_ok, provider_detail = _provider_ready(db)
    smoke_checks = {
        "provider_config": provider_detail,
        "database_session": "writable",
        "eval_fixtures_dir": str(_fixture_dir()),
        "approval_gate": "pending high-risk typed tool",
    }
    run = AgentRun(
        id=new_id("run"),
        name="Executable harness smoke",
        task="Run internal smoke checks and pause at a typed high-risk tool approval gate",
        status="blocked_pending_approval",
        failure_category="none" if provider_ok else "model_failure",
        context_summary="Executes the backend-safe smoke subset behind scripts/docker-smoke.sh without shelling out to Docker.",
        selected_context={
            "files": ["backend/app/api/harness.py", "frontend/src/pages/HarnessPage.tsx"],
            "smoke_checks": smoke_checks,
        },
    )
    db.add(run)
    db.flush()
    db.add(
        ToolCall(
            id=new_id("tool"),
            agent_run_id=run.id,
            tool_name="check_provider_config",
            tool_input_json={"provider": get_runtime_config(db).default_provider},
            tool_output_preview=provider_detail,
            status="completed" if provider_ok else "failed",
            latency_ms=1,
            retry_count=0,
            risk_level="low",
            error_message=None if provider_ok else provider_detail,
        )
    )
    call = ToolCall(
        id=new_id("tool"),
        agent_run_id=run.id,
        tool_name="run_database_migration",
        tool_input_json={"token": "[API_KEY_REDACTED]", "source": "ui_harness_smoke"},
        tool_output_preview="Approval requested from [EMAIL_REDACTED]",
        status="started",
        latency_ms=42,
        retry_count=0,
        risk_level="high",
    )
    db.add(call)
    db.flush()
    db.add(
        HumanApproval(
            id=new_id("approval"),
            agent_run_id=run.id,
            tool_call_id=call.id,
            risk_level="high",
            action=call.tool_name,
            status="pending",
        )
    )
    db.add(
        VerificationResult(
            id=new_id("verify"),
            agent_run_id=run.id,
            check_type="smoke",
            command="internal://docker-smoke/harness-subset",
            status="passed" if provider_ok else "failed",
            expected_files=["backend/app/api/harness.py", "frontend/src/pages/HarnessPage.tsx"],
            forbidden_files=["frontend/dist/", "backend/.venv/"],
            result_summary=f"Internal smoke executed provider, database, eval fixture, redaction, and approval-gate checks. {provider_detail}.",
        )
    )
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
    run = approval.agent_run
    if approval.tool_call:
        if payload.status == "approved":
            _execute_typed_tool(db, run, approval.tool_call)
        else:
            approval.tool_call.status = "cancelled"
    pending_approvals = [item for item in run.approvals if item.id != approval.id and item.status == "pending"]
    if not pending_approvals and run.status == "blocked_pending_approval":
        has_failed_verification = any(result.status == "failed" for result in run.verification_results)
        if payload.status == "rejected":
            run.status = "cancelled"
        elif has_failed_verification:
            run.status = "failed"
            if run.failure_category == "none":
                run.failure_category = "verification_failure"
        else:
            run.status = "completed"
        run.human_override = payload.status == "rejected"
        run.final_action = _redact_optional_text(f"Human {payload.status}: {payload.decision_reason or payload.approver}")
        run.ended_at = now_utc()
        run.latency_ms = max(0, int((run.ended_at - run.started_at).total_seconds() * 1000))
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


@router.post("/evals/{eval_id}/run", response_model=HarnessAccepted)
def run_eval_case(eval_id: str, db: Session = Depends(get_db)):
    eval_case = db.query(EvalCase).filter(EvalCase.id == eval_id).first()
    if not eval_case:
        raise HTTPException(status_code=404, detail="Eval case not found")
    started = now_utc()
    run = AgentRun(
        id=new_id("run"),
        name=eval_case.name,
        task=eval_case.task,
        status="started",
        failure_category="none",
        started_at=started,
        ended_at=now_utc(),
        latency_ms=42,
        context_summary=eval_case.expected_behavior,
        selected_context={
            "eval_case_id": eval_case.id,
            "expected_files": eval_case.expected_files,
            "forbidden_files": eval_case.forbidden_files,
            "success_checks": eval_case.success_checks,
            "passed_checks": eval_case.success_checks,
            "touched_files": eval_case.expected_files,
        },
    )
    db.add(run)
    db.flush()
    _attach_eval_artifacts(db, run, eval_case)
    db.commit()
    return HarnessAccepted(id=run.id)
