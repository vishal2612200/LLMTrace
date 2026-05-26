from fastapi.testclient import TestClient

from app.db.models import AgentRun, EvalCase, EvalRun, HumanApproval, ToolCall, VerificationResult
from app.db.session import SessionLocal
from app.main import app


client = TestClient(app)


def test_create_agent_run_stores_task_context_status_and_timestamps():
    response = client.post(
        "/api/harness/runs",
        json={
            "name": "Login fix",
            "task": "Fix login redirect bug",
            "context_summary": "Auth route and middleware",
            "selected_context": {"files": ["auth/middleware.ts", "routes/login.ts"]},
        },
    )

    assert response.status_code == 200
    run_id = response.json()["id"]
    db = SessionLocal()
    run = db.query(AgentRun).filter(AgentRun.id == run_id).one()
    assert run.status == "started"
    assert run.failure_category == "none"
    assert run.started_at is not None
    assert run.selected_context["files"] == ["auth/middleware.ts", "routes/login.ts"]
    db.close()


def test_tool_call_redacts_sensitive_input_and_output_before_storage():
    run_id = client.post("/api/harness/runs", json={"name": "Redact", "task": "Check secrets"}).json()["id"]

    response = client.post(
        f"/api/harness/runs/{run_id}/tool-calls",
        json={
            "tool_name": "run_tests",
            "tool_input_json": {"email": "dev@example.com", "token": "Bearer sk-demo12345678901234567890"},
            "tool_output": "sent to dev@example.com with Bearer sk-demo12345678901234567890",
            "status": "completed",
            "latency_ms": 12,
            "retry_count": 1,
            "risk_level": "low",
        },
    )

    assert response.status_code == 200
    db = SessionLocal()
    call = db.query(ToolCall).filter(ToolCall.agent_run_id == run_id).one()
    assert call.tool_input_json["email"] == "[EMAIL_REDACTED]"
    assert call.tool_input_json["token"] == "[API_KEY_REDACTED]"
    assert "[EMAIL_REDACTED]" in call.tool_output_preview
    assert "[API_KEY_REDACTED]" in call.tool_output_preview
    assert "dev@example.com" not in str(call.tool_input_json)
    assert "sk-demo" not in (call.tool_output_preview or "")
    db.close()


def test_high_risk_tool_call_creates_pending_approval_and_blocks_run():
    run_id = client.post("/api/harness/runs", json={"name": "Deploy", "task": "Run migration"}).json()["id"]

    response = client.post(
        f"/api/harness/runs/{run_id}/tool-calls",
        json={"tool_name": "run_database_migration", "status": "started", "risk_level": "high"},
    )

    assert response.status_code == 200
    db = SessionLocal()
    run = db.query(AgentRun).filter(AgentRun.id == run_id).one()
    approval = db.query(HumanApproval).filter(HumanApproval.agent_run_id == run_id).one()
    assert run.status == "blocked_pending_approval"
    assert approval.status == "pending"
    assert approval.risk_level == "high"
    assert approval.action == "run_database_migration"
    db.close()


def test_approval_decision_updates_audit_fields():
    run_id = client.post("/api/harness/runs", json={"name": "Deploy", "task": "Run migration"}).json()["id"]
    client.post(f"/api/harness/runs/{run_id}/tool-calls", json={"tool_name": "run_database_migration", "status": "started", "risk_level": "high"})
    db = SessionLocal()
    approval_id = db.query(HumanApproval).filter(HumanApproval.agent_run_id == run_id).one().id
    db.close()

    response = client.post(
        f"/api/harness/approvals/{approval_id}/decision",
        json={"status": "approved", "approver": "senior_engineer", "decision_reason": "Rollback plan reviewed"},
    )

    assert response.status_code == 200
    db = SessionLocal()
    approval = db.query(HumanApproval).filter(HumanApproval.id == approval_id).one()
    run = db.query(AgentRun).filter(AgentRun.id == run_id).one()
    call = db.query(ToolCall).filter(ToolCall.agent_run_id == run_id).one()
    assert approval.status == "approved"
    assert approval.approver == "senior_engineer"
    assert approval.decision_reason == "Rollback plan reviewed"
    assert approval.decided_at is not None
    assert run.status == "completed"
    assert run.final_action == "Human approved: Rollback plan reviewed"
    assert call.status == "completed"
    assert "dry-run" in (call.tool_output_preview or "")
    db.close()


def test_verification_result_stores_files_command_and_summary():
    run_id = client.post("/api/harness/runs", json={"name": "Verify", "task": "Run checks"}).json()["id"]

    response = client.post(
        f"/api/harness/runs/{run_id}/verification-results",
        json={
            "check_type": "tests",
            "command": "pytest -q",
            "status": "passed",
            "expected_files": ["backend/app/api/harness.py"],
            "forbidden_files": ["billing/"],
            "result_summary": "All tests passed",
        },
    )

    assert response.status_code == 200
    db = SessionLocal()
    result = db.query(VerificationResult).filter(VerificationResult.agent_run_id == run_id).one()
    assert result.command == "pytest -q"
    assert result.expected_files == ["backend/app/api/harness.py"]
    assert result.forbidden_files == ["billing/"]
    assert result.status == "passed"
    db.close()


def test_failure_category_enum_rejects_unsupported_values():
    run_id = client.post("/api/harness/runs", json={"name": "Bad category", "task": "Fail"}).json()["id"]

    response = client.patch(
        f"/api/harness/runs/{run_id}",
        json={"status": "failed", "failure_category": "llm_bad"},
    )

    assert response.status_code == 422


def test_eval_fixture_loader_imports_json_idempotently():
    first = client.post("/api/harness/evals/load-fixtures")
    second = client.post("/api/harness/evals/load-fixtures")

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["loaded"] >= 2
    assert second.json()["loaded"] == 0
    db = SessionLocal()
    assert db.query(EvalCase).count() >= 2
    db.close()


def test_run_eval_case_creates_run_tool_verification_and_eval_run():
    client.post("/api/harness/evals/load-fixtures")
    eval_case = client.get("/api/harness/evals").json()[0]

    response = client.post(f"/api/harness/evals/{eval_case['id']}/run")

    assert response.status_code == 200
    run_id = response.json()["id"]
    db = SessionLocal()
    run = db.query(AgentRun).filter(AgentRun.id == run_id).one()
    call = db.query(ToolCall).filter(ToolCall.agent_run_id == run_id, ToolCall.tool_name == "run_eval_case").one()
    verification = db.query(VerificationResult).filter(VerificationResult.agent_run_id == run_id).one()
    eval_run = db.query(EvalRun).filter(EvalRun.agent_run_id == run_id).one()
    assert run.status == "completed"
    assert run.failure_category == "none"
    assert call.tool_name == "run_eval_case"
    assert call.status == "completed"
    assert verification.check_type == "eval"
    assert verification.status == "passed"
    assert eval_run.eval_case_id == eval_case["id"]
    assert eval_run.status == "passed"
    assert eval_run.score == 100
    db.close()


def test_create_smoke_run_creates_pending_approval_and_verification():
    response = client.post("/api/harness/smoke")

    assert response.status_code == 200
    run_id = response.json()["id"]
    db = SessionLocal()
    run = db.query(AgentRun).filter(AgentRun.id == run_id).one()
    call = db.query(ToolCall).filter(ToolCall.agent_run_id == run_id, ToolCall.tool_name == "run_database_migration").one()
    approval = db.query(HumanApproval).filter(HumanApproval.agent_run_id == run_id).one()
    verification = db.query(VerificationResult).filter(VerificationResult.agent_run_id == run_id).one()
    assert run.status == "blocked_pending_approval"
    assert call.risk_level == "high"
    assert call.tool_input_json["token"] == "[API_KEY_REDACTED]"
    assert approval.status == "pending"
    assert verification.check_type == "smoke"
    assert verification.command == "internal://docker-smoke/harness-subset"
    assert verification.status == "passed"
    db.close()


def test_harness_metrics_summary_counts_runs_approvals_and_failures():
    run_id = client.post("/api/harness/runs", json={"name": "Metrics", "task": "Measure"}).json()["id"]
    client.post(f"/api/harness/runs/{run_id}/tool-calls", json={"tool_name": "deploy", "status": "started", "risk_level": "high", "latency_ms": 50})
    client.patch(f"/api/harness/runs/{run_id}", json={"status": "failed", "failure_category": "permission_failure"})

    response = client.get("/api/harness/metrics/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["run_count"] >= 1
    assert body["failure_categories"]["permission_failure"] >= 1
    assert body["approval_counts"]["pending"] >= 1
    assert body["pending_high_risk_approvals"] >= 1
    assert body["average_tool_latency_ms"] >= 50
