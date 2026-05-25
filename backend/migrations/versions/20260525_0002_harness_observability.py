"""harness observability

Revision ID: 20260525_0002
Revises: 20260525_0001
Create Date: 2026-05-25
"""

from alembic import op
import sqlalchemy as sa

revision = "20260525_0002"
down_revision = "20260525_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_runs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("task", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("failure_category", sa.String(length=64), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("context_summary", sa.Text(), nullable=True),
        sa.Column("selected_context", sa.JSON(), nullable=False),
        sa.Column("final_action", sa.Text(), nullable=True),
        sa.Column("human_override", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_agent_runs_failure_category", "agent_runs", ["failure_category"])
    op.create_index("ix_agent_runs_started_at", "agent_runs", ["started_at"])
    op.create_index("ix_agent_runs_status", "agent_runs", ["status"])

    op.create_table(
        "eval_cases",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("category", sa.String(length=120), nullable=False),
        sa.Column("task", sa.Text(), nullable=False),
        sa.Column("expected_behavior", sa.Text(), nullable=False),
        sa.Column("expected_files", sa.JSON(), nullable=False),
        sa.Column("forbidden_files", sa.JSON(), nullable=False),
        sa.Column("success_checks", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name", "category", name="uq_eval_cases_name_category"),
    )
    op.create_index("ix_eval_cases_category", "eval_cases", ["category"])

    op.create_table(
        "tool_calls",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("agent_run_id", sa.String(length=64), nullable=False),
        sa.Column("tool_name", sa.String(length=120), nullable=False),
        sa.Column("tool_input_json", sa.JSON(), nullable=False),
        sa.Column("tool_output_preview", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False),
        sa.Column("risk_level", sa.String(length=32), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["agent_run_id"], ["agent_runs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_tool_calls_agent_run_id", "tool_calls", ["agent_run_id"])
    op.create_index("ix_tool_calls_risk_level", "tool_calls", ["risk_level"])
    op.create_index("ix_tool_calls_status", "tool_calls", ["status"])
    op.create_index("ix_tool_calls_tool_name", "tool_calls", ["tool_name"])

    op.create_table(
        "verification_results",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("agent_run_id", sa.String(length=64), nullable=False),
        sa.Column("check_type", sa.String(length=64), nullable=False),
        sa.Column("command", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("expected_files", sa.JSON(), nullable=False),
        sa.Column("forbidden_files", sa.JSON(), nullable=False),
        sa.Column("result_summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["agent_run_id"], ["agent_runs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_verification_results_agent_run_id", "verification_results", ["agent_run_id"])
    op.create_index("ix_verification_results_check_type", "verification_results", ["check_type"])
    op.create_index("ix_verification_results_status", "verification_results", ["status"])

    op.create_table(
        "human_approvals",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("agent_run_id", sa.String(length=64), nullable=False),
        sa.Column("tool_call_id", sa.String(length=64), nullable=True),
        sa.Column("risk_level", sa.String(length=32), nullable=False),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("approver", sa.String(length=120), nullable=True),
        sa.Column("decision_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["agent_run_id"], ["agent_runs.id"]),
        sa.ForeignKeyConstraint(["tool_call_id"], ["tool_calls.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_human_approvals_agent_run_id", "human_approvals", ["agent_run_id"])
    op.create_index("ix_human_approvals_risk_level", "human_approvals", ["risk_level"])
    op.create_index("ix_human_approvals_status", "human_approvals", ["status"])
    op.create_index("ix_human_approvals_tool_call_id", "human_approvals", ["tool_call_id"])

    op.create_table(
        "eval_runs",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("eval_case_id", sa.String(length=64), nullable=False),
        sa.Column("agent_run_id", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("failure_category", sa.String(length=64), nullable=False),
        sa.Column("result_summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["agent_run_id"], ["agent_runs.id"]),
        sa.ForeignKeyConstraint(["eval_case_id"], ["eval_cases.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_eval_runs_agent_run_id", "eval_runs", ["agent_run_id"])
    op.create_index("ix_eval_runs_eval_case_id", "eval_runs", ["eval_case_id"])
    op.create_index("ix_eval_runs_failure_category", "eval_runs", ["failure_category"])
    op.create_index("ix_eval_runs_status", "eval_runs", ["status"])


def downgrade() -> None:
    op.drop_table("eval_runs")
    op.drop_table("human_approvals")
    op.drop_table("verification_results")
    op.drop_table("tool_calls")
    op.drop_table("eval_cases")
    op.drop_table("agent_runs")
