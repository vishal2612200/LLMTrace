import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HarnessPage } from "./HarnessPage";

const mockApi = vi.hoisted(() => ({
  harnessMetricsSummary: vi.fn(),
  harnessRuns: vi.fn(),
  harnessEvals: vi.fn(),
  harnessRun: vi.fn(),
  loadHarnessFixtures: vi.fn(),
  runHarnessSmoke: vi.fn(),
  runHarnessEval: vi.fn(),
  decideHarnessApproval: vi.fn(),
}));

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    api: mockApi,
  };
});

describe("HarnessPage", () => {
  beforeEach(() => {
    mockApi.harnessMetricsSummary.mockReset();
    mockApi.harnessRuns.mockReset();
    mockApi.harnessEvals.mockReset();
    mockApi.harnessRun.mockReset();
    mockApi.loadHarnessFixtures.mockReset();
    mockApi.runHarnessSmoke.mockReset();
    mockApi.runHarnessEval.mockReset();
    mockApi.decideHarnessApproval.mockReset();
  });

  it("renders empty harness state", async () => {
    mockApi.harnessMetricsSummary.mockResolvedValue({
      run_count: 0,
      pass_rate: 0,
      failure_categories: {},
      approval_counts: {},
      average_tool_latency_ms: 0,
      pending_high_risk_approvals: 0,
      most_common_failure_category: "none",
    });
    mockApi.harnessRuns.mockResolvedValue([]);
    mockApi.harnessEvals.mockResolvedValue([]);

    render(<HarnessPage />);

    expect(await screen.findByText("No agent runs yet.")).toBeInTheDocument();
    expect(screen.getByText("No eval cases loaded.")).toBeInTheDocument();
    expect(screen.getByText("Select a run to inspect harness telemetry.")).toBeInTheDocument();
  });

  it("renders mocked runs, tool calls, approvals, verification, and eval cases", async () => {
    mockApi.harnessMetricsSummary.mockResolvedValue({
      run_count: 1,
      pass_rate: 1,
      failure_categories: {},
      approval_counts: { pending: 1 },
      average_tool_latency_ms: 24,
      pending_high_risk_approvals: 1,
      most_common_failure_category: "none",
    });
    mockApi.harnessRuns.mockResolvedValue([
      {
        id: "run_1",
        name: "Login redirect",
        task: "Fix login redirect bug",
        status: "blocked_pending_approval",
        failure_category: "none",
        started_at: "2026-05-25T00:00:00Z",
        ended_at: null,
        latency_ms: null,
        tool_count: 1,
        verification_status: "passed",
        approval_status: "pending",
      },
    ]);
    mockApi.harnessRun.mockResolvedValue({
      id: "run_1",
      name: "Login redirect",
      task: "Fix login redirect bug",
      status: "blocked_pending_approval",
      failure_category: "none",
      started_at: "2026-05-25T00:00:00Z",
      ended_at: null,
      latency_ms: null,
      tool_count: 1,
      verification_status: "passed",
      approval_status: "pending",
      created_at: "2026-05-25T00:00:00Z",
      context_summary: "Auth files",
      selected_context: { files: ["auth/middleware.ts", "routes/login.ts"] },
      final_action: null,
      human_override: false,
      tool_calls: [
        {
          id: "tool_1",
          tool_name: "run_tests",
          tool_input_json: { command: "npm test" },
          tool_output_preview: "All green",
          status: "completed",
          latency_ms: 24,
          retry_count: 0,
          risk_level: "low",
          error_message: null,
          created_at: "2026-05-25T00:00:00Z",
        },
      ],
      verification_results: [
        {
          id: "verify_1",
          check_type: "tests",
          command: "npm test",
          status: "passed",
          expected_files: ["auth/middleware.ts"],
          forbidden_files: ["billing/"],
          result_summary: "All green",
          created_at: "2026-05-25T00:00:00Z",
        },
      ],
      approvals: [
        {
          id: "approval_1",
          tool_call_id: "tool_1",
          risk_level: "high",
          action: "deploy",
          status: "pending",
          approver: null,
          decision_reason: null,
          created_at: "2026-05-25T00:00:00Z",
          decided_at: null,
        },
      ],
      eval_runs: [
        {
          id: "evalrun_1",
          eval_case_id: "eval_1",
          agent_run_id: "run_1",
          status: "passed",
          score: 100,
          failure_category: "none",
          result_summary: "Eval passed",
          created_at: "2026-05-25T00:00:00Z",
        },
      ],
    });
    mockApi.harnessEvals.mockResolvedValue([
      {
        id: "eval_1",
        name: "login redirect bug",
        category: "coding-agent",
        task: "Fix login redirect bug",
        expected_behavior: "Redirect user to dashboard after successful login",
        expected_files: ["auth/middleware.ts", "routes/login.ts"],
        forbidden_files: ["billing/", "admin/"],
        success_checks: ["unit tests pass", "redirect test passes"],
        created_at: "2026-05-25T00:00:00Z",
      },
    ]);

    render(<HarnessPage />);

    expect((await screen.findAllByText("Login redirect")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("run_tests · completed · low · 24 ms")).toBeInTheDocument();
    expect(screen.getByText("tests · passed · All green")).toBeInTheDocument();
    expect(screen.getByText("high risk · pending")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
    expect(screen.getByText("passed · score 100 · none · Eval passed")).toBeInTheDocument();
    expect(screen.getByText("login redirect bug")).toBeInTheDocument();
    expect(screen.getByText("Expected: auth/middleware.ts, routes/login.ts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /run eval/i })).toBeInTheDocument();
    expect(screen.getByText("Human-in-the-loop canvas")).toBeInTheDocument();
    expect(screen.getByText("Provider setup")).toBeInTheDocument();
    expect(screen.getAllByText("mock / mock-fast").length).toBeGreaterThanOrEqual(1);
  });

  it("runs a smoke scenario from the toolbar and selects the created run", async () => {
    mockApi.harnessMetricsSummary.mockResolvedValue({
      run_count: 1,
      pass_rate: 0,
      failure_categories: {},
      approval_counts: { pending: 1 },
      average_tool_latency_ms: 42,
      pending_high_risk_approvals: 1,
      most_common_failure_category: "none",
    });
    mockApi.harnessRuns.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "run_smoke",
        name: "UI harness smoke",
        task: "Create representative harness telemetry from the app UI",
        status: "blocked_pending_approval",
        failure_category: "none",
        started_at: "2026-05-25T00:00:00Z",
        ended_at: null,
        latency_ms: null,
        tool_count: 1,
        verification_status: "passed",
        approval_status: "pending",
      },
    ]);
    mockApi.harnessEvals.mockResolvedValue([]);
    mockApi.runHarnessSmoke.mockResolvedValue({ id: "run_smoke" });
    mockApi.harnessRun.mockResolvedValue({
      id: "run_smoke",
      name: "UI harness smoke",
      task: "Create representative harness telemetry from the app UI",
      status: "blocked_pending_approval",
      failure_category: "none",
      started_at: "2026-05-25T00:00:00Z",
      ended_at: null,
      latency_ms: null,
      tool_count: 1,
      verification_status: "passed",
      approval_status: "pending",
      created_at: "2026-05-25T00:00:00Z",
      context_summary: "Smoke",
      selected_context: { files: ["backend/app/api/harness.py"] },
      final_action: null,
      human_override: false,
      tool_calls: [],
      verification_results: [
        {
          id: "verify_smoke",
          check_type: "smoke",
          command: "./scripts/docker-smoke.sh",
          status: "passed",
          expected_files: [],
          forbidden_files: [],
          result_summary: "UI smoke created run.",
          created_at: "2026-05-25T00:00:00Z",
        },
      ],
      approvals: [],
      eval_runs: [],
    });

    render(<HarnessPage />);
    fireEvent.click(await screen.findByRole("button", { name: /run smoke scenario/i }));

    await waitFor(() => expect(mockApi.runHarnessSmoke).toHaveBeenCalledTimes(1));
    expect((await screen.findAllByText("UI harness smoke")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("smoke · passed · UI smoke created run.")).toBeInTheDocument();
  });

  it("runs an eval from an eval card and selects the created run", async () => {
    mockApi.harnessMetricsSummary.mockResolvedValue({
      run_count: 1,
      pass_rate: 1,
      failure_categories: {},
      approval_counts: {},
      average_tool_latency_ms: 42,
      pending_high_risk_approvals: 0,
      most_common_failure_category: "none",
    });
    mockApi.harnessRuns.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        id: "run_eval",
        name: "login redirect bug",
        task: "Fix login redirect bug",
        status: "completed",
        failure_category: "none",
        started_at: "2026-05-25T00:00:00Z",
        ended_at: "2026-05-25T00:00:01Z",
        latency_ms: 42,
        tool_count: 1,
        verification_status: "passed",
        approval_status: "none",
      },
    ]);
    mockApi.harnessEvals.mockResolvedValue([
      {
        id: "eval_1",
        name: "login redirect bug",
        category: "coding-agent",
        task: "Fix login redirect bug",
        expected_behavior: "Redirect user to dashboard after successful login",
        expected_files: ["auth/middleware.ts"],
        forbidden_files: ["billing/"],
        success_checks: ["redirect test passes"],
        created_at: "2026-05-25T00:00:00Z",
      },
    ]);
    mockApi.runHarnessEval.mockResolvedValue({ id: "run_eval" });
    mockApi.harnessRun.mockResolvedValue({
      id: "run_eval",
      name: "login redirect bug",
      task: "Fix login redirect bug",
      status: "completed",
      failure_category: "none",
      started_at: "2026-05-25T00:00:00Z",
      ended_at: "2026-05-25T00:00:01Z",
      latency_ms: 42,
      tool_count: 1,
      verification_status: "passed",
      approval_status: "none",
      created_at: "2026-05-25T00:00:00Z",
      context_summary: "Redirect user to dashboard after successful login",
      selected_context: { eval_case_id: "eval_1" },
      final_action: "Eval passed",
      human_override: false,
      tool_calls: [],
      verification_results: [],
      approvals: [],
      eval_runs: [
        {
          id: "evalrun_1",
          eval_case_id: "eval_1",
          agent_run_id: "run_eval",
          status: "passed",
          score: 100,
          failure_category: "none",
          result_summary: "UI-triggered eval run passed: login redirect bug",
          created_at: "2026-05-25T00:00:00Z",
        },
      ],
    });

    render(<HarnessPage />);
    fireEvent.click(await screen.findByRole("button", { name: /run eval/i }));

    await waitFor(() => expect(mockApi.runHarnessEval).toHaveBeenCalledWith("eval_1"));
    expect((await screen.findAllByText("login redirect bug")).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("passed · score 100 · none · UI-triggered eval run passed: login redirect bug")).toBeInTheDocument();
  });

  it("approves a pending high-risk action from the run detail panel", async () => {
    const pendingRun = {
      id: "run_smoke",
      name: "UI harness smoke",
      task: "Create representative harness telemetry from the app UI",
      status: "blocked_pending_approval",
      failure_category: "none",
      started_at: "2026-05-25T00:00:00Z",
      ended_at: null,
      latency_ms: null,
      tool_count: 1,
      verification_status: "passed",
      approval_status: "pending",
      created_at: "2026-05-25T00:00:00Z",
      context_summary: "Smoke",
      selected_context: { files: ["backend/app/api/harness.py"] },
      final_action: null,
      human_override: false,
      tool_calls: [
        {
          id: "tool_1",
          tool_name: "run_database_migration",
          tool_input_json: { token: "[API_KEY_REDACTED]" },
          tool_output_preview: "Approval requested",
          status: "started",
          latency_ms: 42,
          retry_count: 0,
          risk_level: "high",
          error_message: null,
          created_at: "2026-05-25T00:00:00Z",
        },
      ],
      verification_results: [],
      approvals: [
        {
          id: "approval_1",
          tool_call_id: "tool_1",
          risk_level: "high",
          action: "run_database_migration",
          status: "pending",
          approver: null,
          decision_reason: null,
          created_at: "2026-05-25T00:00:00Z",
          decided_at: null,
        },
      ],
      eval_runs: [],
    };
    const approvedRun = {
      ...pendingRun,
      status: "completed",
      approval_status: "approved",
      final_action: "Human approved: Reviewed in Harness UI and approved by human operator.",
      tool_calls: [{ ...pendingRun.tool_calls[0], status: "completed" }],
      approvals: [
        {
          ...pendingRun.approvals[0],
          status: "approved",
          approver: "ui_operator",
          decision_reason: "Reviewed in Harness UI and approved by human operator.",
          decided_at: "2026-05-25T00:00:01Z",
        },
      ],
    };
    mockApi.harnessMetricsSummary.mockResolvedValue({
      run_count: 1,
      pass_rate: 1,
      failure_categories: {},
      approval_counts: { approved: 1 },
      average_tool_latency_ms: 42,
      pending_high_risk_approvals: 0,
      most_common_failure_category: "none",
    });
    mockApi.harnessRuns.mockResolvedValue([
      {
        id: "run_smoke",
        name: "UI harness smoke",
        task: "Create representative harness telemetry from the app UI",
        status: "completed",
        failure_category: "none",
        started_at: "2026-05-25T00:00:00Z",
        ended_at: "2026-05-25T00:00:01Z",
        latency_ms: 1000,
        tool_count: 1,
        verification_status: "not_run",
        approval_status: "approved",
      },
    ]);
    mockApi.harnessEvals.mockResolvedValue([]);
    mockApi.harnessRun.mockResolvedValueOnce(pendingRun).mockResolvedValueOnce(approvedRun);
    mockApi.decideHarnessApproval.mockResolvedValue({ id: "approval_1" });

    render(<HarnessPage />);
    fireEvent.click(await screen.findByRole("button", { name: /approve/i }));

    await waitFor(() =>
      expect(mockApi.decideHarnessApproval).toHaveBeenCalledWith(
        "approval_1",
        "approved",
        "Reviewed in Harness UI and approved by human operator.",
      ),
    );
    expect(await screen.findByText("high risk · approved · ui_operator")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });
});
