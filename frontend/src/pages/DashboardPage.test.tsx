import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import { DashboardPage } from "./DashboardPage";

const mockApi = vi.hoisted(() => ({
  dlq: vi.fn(),
  metricsProviders: vi.fn(),
  metricsSummary: vi.fn(),
  metricsTimeseries: vi.fn(),
  replayDlq: vi.fn(),
}));

vi.mock("../api/client", () => ({
  api: mockApi,
  getRuntimeSettings: () => ({ apiBase: "http://localhost:8000" }),
}));

describe("DashboardPage", () => {
  beforeEach(() => {
    mockApi.dlq.mockReset();
    mockApi.metricsProviders.mockReset();
    mockApi.metricsSummary.mockReset();
    mockApi.metricsTimeseries.mockReset();
    mockApi.replayDlq.mockReset();
  });

  it("expands recent failures to show the full error", async () => {
    mockApi.metricsSummary.mockResolvedValue({
      total_requests: 1,
      p50_latency_ms: 0,
      p95_latency_ms: 0,
      error_rate: 1,
      total_tokens: 0,
      recent_failures: [
        {
          id: "req_1",
          provider: "openai",
          model: "mock-fast",
          error_type: "RuntimeError",
          error_message: "OPENAI_API_KEY is not configured\nFull stack detail",
          created_at: "2026-05-25T00:00:00Z",
          latency_ms: null,
        },
      ],
    });
    mockApi.metricsTimeseries.mockResolvedValue([]);
    mockApi.metricsProviders.mockResolvedValue([]);
    mockApi.dlq.mockResolvedValue([]);

    render(<DashboardPage />);

    const row = await screen.findByRole("button", { name: "Show error details for openai / mock-fast" });
    expect(screen.queryByText(/Full stack detail/)).not.toBeInTheDocument();

    await userEvent.click(row);

    expect(screen.getByText(/OPENAI_API_KEY is not configured\s+Full stack detail/)).toBeInTheDocument();
    expect(screen.getByText("req_1")).toBeInTheDocument();
    expect(row).toHaveAttribute("aria-expanded", "true");
  });
});
