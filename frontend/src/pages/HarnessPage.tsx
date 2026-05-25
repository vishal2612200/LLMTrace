import React from "react";
import { CheckCircle2, GitBranch, LockKeyhole, RotateCw } from "lucide-react";

import { AgentRunDetail, AgentRunSummary, api, EvalCase, HarnessMetricsSummary } from "../api/client";

export function HarnessPage() {
  const [summary, setSummary] = React.useState<HarnessMetricsSummary | null>(null);
  const [runs, setRuns] = React.useState<AgentRunSummary[]>([]);
  const [selectedRun, setSelectedRun] = React.useState<AgentRunDetail | null>(null);
  const [evals, setEvals] = React.useState<EvalCase[]>([]);
  const [status, setStatus] = React.useState("Ready");

  async function load() {
    const [metrics, runRows, evalRows] = await Promise.all([
      api.harnessMetricsSummary(),
      api.harnessRuns(),
      api.harnessEvals(),
    ]);
    setSummary(metrics);
    setRuns(runRows);
    setEvals(evalRows);
    if (runRows[0]) {
      setSelectedRun(await api.harnessRun(runRows[0].id));
    } else {
      setSelectedRun(null);
    }
    setStatus("Ready");
  }

  React.useEffect(() => {
    void load();
  }, []);

  async function loadFixtures() {
    const result = await api.loadHarnessFixtures();
    setStatus(`Loaded ${result.loaded}, skipped ${result.skipped}`);
    await load();
  }

  async function selectRun(id: string) {
    setSelectedRun(await api.harnessRun(id));
  }

  return (
    <section className="workspace">
      <header className="toolbar">
        <div>
          <h1>Harness Observatory</h1>
          <p>Agent runs, tool calls, deterministic checks, approvals, and eval fixtures.</p>
        </div>
        <div className="toolbar-actions">
          <button onClick={loadFixtures}>
            <GitBranch size={18} /> Load evals
          </button>
          <button onClick={() => void load()}>
            <RotateCw size={18} /> Refresh
          </button>
        </div>
      </header>

      <div className="metric-grid">
        <Metric icon={<GitBranch />} label="Agent runs" value={summary?.run_count ?? 0} />
        <Metric icon={<CheckCircle2 />} label="Pass rate" value={`${Math.round((summary?.pass_rate ?? 0) * 100)}%`} />
        <Metric icon={<LockKeyhole />} label="Pending high risk" value={summary?.pending_high_risk_approvals ?? 0} />
        <Metric icon={<GitBranch />} label="Top failure" value={summary?.most_common_failure_category ?? "none"} />
      </div>

      <div className="dashboard-grid">
        <section className="table-panel">
          <table>
            <thead>
              <tr>
                <th>Run</th>
                <th>Status</th>
                <th>Failure</th>
                <th>Tools</th>
                <th>Verification</th>
                <th>Approval</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 ? (
                <tr>
                  <td colSpan={6}>No agent runs yet.</td>
                </tr>
              ) : (
                runs.map((run) => (
                  <tr key={run.id}>
                    <td>
                      <button className="link-button" onClick={() => void selectRun(run.id)}>
                        {run.name}
                      </button>
                    </td>
                    <td>
                      <span className={`status-pill ${run.status}`}>{run.status}</span>
                    </td>
                    <td>{run.failure_category}</td>
                    <td>{run.tool_count}</td>
                    <td>{run.verification_status}</td>
                    <td>{run.approval_status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <h2>Run detail</h2>
          {selectedRun ? (
            <div className="detail-stack">
              <div>
                <strong>{selectedRun.name}</strong>
                <span>{selectedRun.task}</span>
              </div>
              <div>
                <strong>Selected context</strong>
                <code>{JSON.stringify(selectedRun.selected_context, null, 2)}</code>
              </div>
              <div>
                <strong>Tool calls</strong>
                {selectedRun.tool_calls.length === 0 ? (
                  <span>No tool calls.</span>
                ) : (
                  selectedRun.tool_calls.map((call) => (
                    <span key={call.id}>
                      {call.tool_name} · {call.status} · {call.risk_level} · {call.latency_ms ?? 0} ms
                    </span>
                  ))
                )}
              </div>
              <div>
                <strong>Verification</strong>
                {selectedRun.verification_results.length === 0 ? (
                  <span>No verification results.</span>
                ) : (
                  selectedRun.verification_results.map((result) => (
                    <span key={result.id}>
                      {result.check_type} · {result.status} · {result.result_summary ?? "no summary"}
                    </span>
                  ))
                )}
              </div>
              <div>
                <strong>Approvals</strong>
                {selectedRun.approvals.length === 0 ? (
                  <span>No approvals.</span>
                ) : (
                  selectedRun.approvals.map((approval) => (
                    <span key={approval.id}>
                      {approval.action} · {approval.risk_level} · {approval.status}
                    </span>
                  ))
                )}
              </div>
            </div>
          ) : (
            <span>{status === "Ready" ? "Select a run to inspect harness telemetry." : status}</span>
          )}
        </section>
      </div>

      <section className="panel">
        <h2>Eval cases</h2>
        <div className="eval-grid">
          {evals.length === 0 ? (
            <span>No eval cases loaded.</span>
          ) : (
            evals.map((item) => (
              <article className="eval-card" key={item.id}>
                <strong>{item.name}</strong>
                <span>{item.expected_behavior}</span>
                <small>Expected: {item.expected_files.join(", ") || "none"}</small>
                <small>Forbidden: {item.forbidden_files.join(", ") || "none"}</small>
                <small>Checks: {item.success_checks.join(", ") || "none"}</small>
              </article>
            ))
          )}
        </div>
      </section>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="metric">
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}
