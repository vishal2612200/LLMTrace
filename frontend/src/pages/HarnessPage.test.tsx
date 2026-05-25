import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { HarnessPage } from "./HarnessPage";

const mockApi = vi.hoisted(() => ({
  harnessMetricsSummary: vi.fn(),
  harnessRuns: vi.fn(),
  harnessEvals: vi.fn(),
  harnessRun: vi.fn(),
  loadHarnessFixtures: vi.fn(),
}));

vi.mock("../api/client", () => ({
  api: mockApi,
}));

describe("HarnessPage", () => {
  beforeEach(() => {
    mockApi.harnessMetricsSummary.mockReset();
    mockApi.harnessRuns.mockReset();
    mockApi.harnessEvals.mockReset();
    mockApi.harnessRun.mockReset();
    mockApi.loadHarnessFixtures.mockReset();
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
      eval_runs: [],
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

    expect(await screen.findAllByText("Login redirect")).toHaveLength(2);
    expect(screen.getByText("run_tests · completed · low · 24 ms")).toBeInTheDocument();
    expect(screen.getByText("tests · passed · All green")).toBeInTheDocument();
    expect(screen.getByText("deploy · high · pending")).toBeInTheDocument();
    expect(screen.getByText("login redirect bug")).toBeInTheDocument();
    expect(screen.getByText("Expected: auth/middleware.ts, routes/login.ts")).toBeInTheDocument();
  });
});
