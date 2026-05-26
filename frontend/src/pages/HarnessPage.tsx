import React from "react";
import { Background, Controls, MarkerType, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CheckCircle2, FlaskConical, GitBranch, LockKeyhole, Play, RotateCw, Settings, ShieldCheck, XCircle } from "lucide-react";

import { AgentRunDetail, AgentRunSummary, api, EvalCase, HarnessMetricsSummary, RuntimeSettings } from "../api/client";
import { useRuntimeSettings } from "../hooks/useRuntimeSettings";

type HarnessPageProps = {
  onOpenSettings?: () => void;
};

export function HarnessPage({ onOpenSettings }: HarnessPageProps = {}) {
  const [summary, setSummary] = React.useState<HarnessMetricsSummary | null>(null);
  const [runs, setRuns] = React.useState<AgentRunSummary[]>([]);
  const [selectedRun, setSelectedRun] = React.useState<AgentRunDetail | null>(null);
  const [evals, setEvals] = React.useState<EvalCase[]>([]);
  const [status, setStatus] = React.useState("Ready");
  const [runningAction, setRunningAction] = React.useState<string | null>(null);
  const [decisionAction, setDecisionAction] = React.useState<string | null>(null);
  const runtimeSettings = useRuntimeSettings();

  async function load(preferredRunId?: string) {
    const [metrics, runRows, evalRows] = await Promise.all([
      api.harnessMetricsSummary(),
      api.harnessRuns(),
      api.harnessEvals(),
    ]);
    setSummary(metrics);
    setRuns(runRows);
    setEvals(evalRows);
    const selectedId = preferredRunId ?? selectedRun?.id;
    const runToSelect = runRows.find((run) => run.id === selectedId) ?? runRows[0];
    if (runToSelect) {
      setSelectedRun(await api.harnessRun(runToSelect.id));
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

  async function runSmokeScenario() {
    setRunningAction("smoke");
    setStatus("Running smoke scenario...");
    try {
      const result = await api.runHarnessSmoke();
      await load(result.id);
      setStatus("Smoke scenario created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Smoke scenario failed.");
    } finally {
      setRunningAction(null);
    }
  }

  async function runEval(item: EvalCase) {
    setRunningAction(item.id);
    setStatus(`Running eval: ${item.name}`);
    try {
      const result = await api.runHarnessEval(item.id);
      await load(result.id);
      setStatus(`Eval completed: ${item.name}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Eval run failed.");
    } finally {
      setRunningAction(null);
    }
  }

  async function selectRun(id: string) {
    setSelectedRun(await api.harnessRun(id));
  }

  async function decideApproval(approvalId: string, decision: "approved" | "rejected") {
    if (!selectedRun) return;
    setDecisionAction(`${approvalId}:${decision}`);
    setStatus(`${decision === "approved" ? "Approving" : "Rejecting"} action...`);
    try {
      const reason =
        decision === "approved"
          ? "Reviewed in Harness UI and approved by human operator."
          : "Reviewed in Harness UI and rejected by human operator.";
      await api.decideHarnessApproval(approvalId, decision, reason);
      await load(selectedRun.id);
      setStatus(decision === "approved" ? "Action approved." : "Action rejected.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Approval decision failed.");
    } finally {
      setDecisionAction(null);
    }
  }

  const loopSteps = buildLoopSteps(selectedRun, runtimeSettings);
  const loopGraph = React.useMemo(() => buildLoopGraph(loopSteps), [loopSteps]);

  return (
    <section className="workspace">
      <header className="toolbar">
        <div>
          <h1>Harness Observatory</h1>
          <p>Agent runs, tool calls, deterministic checks, approvals, and eval fixtures.</p>
          <span className="toolbar-status">{status}</span>
        </div>
        <div className="toolbar-actions">
          <button disabled={runningAction !== null} onClick={() => void runSmokeScenario()}>
            <Play size={18} /> {runningAction === "smoke" ? "Running..." : "Run smoke scenario"}
          </button>
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

      <section className="loop-canvas" aria-label="Harness human approval loop">
        <div className="loop-canvas-header">
          <div>
            <h2>Human-in-the-loop canvas</h2>
            <span>{selectedRun ? selectedRun.name : "Select or create a run to see the full control loop."}</span>
          </div>
          <div className="loop-canvas-actions">
            <strong>{runtimeSettings.defaultProvider} / {runtimeSettings.defaultModel}</strong>
            {onOpenSettings ? (
              <button onClick={onOpenSettings}>
                <Settings size={18} /> Configure provider
              </button>
            ) : null}
            <strong>{selectedRun?.status ?? "idle"}</strong>
          </div>
        </div>
        <div className="loop-flow-wrap" data-testid="approval-loop-graph">
          <ReactFlow
            nodes={loopGraph.nodes}
            edges={loopGraph.edges}
            fitView
            fitViewOptions={{ padding: 0.18 }}
            minZoom={0.25}
            maxZoom={1.2}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            panOnScroll
            preventScrolling={false}
            zoomOnDoubleClick={false}
            zoomOnPinch={false}
            zoomOnScroll={false}
          >
            <Background gap={18} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
      </section>

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
                    <article className={`approval-card ${approval.status}`} key={approval.id}>
                      <div>
                        <strong>{approval.action}</strong>
                        <span>
                          {approval.risk_level} risk · {approval.status}
                          {approval.approver ? ` · ${approval.approver}` : ""}
                        </span>
                        {approval.decision_reason ? <small>{approval.decision_reason}</small> : null}
                      </div>
                      {approval.status === "pending" ? (
                        <div className="approval-actions">
                          <button
                            disabled={decisionAction !== null}
                            onClick={() => void decideApproval(approval.id, "approved")}
                          >
                            <ShieldCheck size={18} /> {decisionAction === `${approval.id}:approved` ? "Approving..." : "Approve"}
                          </button>
                          <button
                            className="danger-button"
                            disabled={decisionAction !== null}
                            onClick={() => void decideApproval(approval.id, "rejected")}
                          >
                            <XCircle size={18} /> {decisionAction === `${approval.id}:rejected` ? "Rejecting..." : "Reject"}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))
                )}
              </div>
              <div>
                <strong>Eval runs</strong>
                {selectedRun.eval_runs.length === 0 ? (
                  <span>No eval runs attached.</span>
                ) : (
                  selectedRun.eval_runs.map((result) => (
                    <span key={result.id}>
                      {result.status} · score {result.score ?? "n/a"} · {result.failure_category} · {result.result_summary ?? "no summary"}
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
                <div className="eval-card-actions">
                  <button disabled={runningAction !== null} onClick={() => void runEval(item)}>
                    <FlaskConical size={18} /> {runningAction === item.id ? "Running..." : "Run eval"}
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </section>
  );
}

type LoopStep = {
  id: string;
  kicker: string;
  label: string;
  detail: string;
  state: "idle" | "done" | "active" | "blocked" | "error";
};

function buildLoopSteps(run: AgentRunDetail | null, settings: RuntimeSettings): LoopStep[] {
  const firstApproval = run?.approvals[0];
  const hasVerification = Boolean(run?.verification_results.length);
  const hasEval = Boolean(run?.eval_runs.length);
  const approvalState = firstApproval?.status === "pending" ? "blocked" : firstApproval?.status === "rejected" ? "error" : firstApproval ? "done" : "idle";
  const terminalState = run?.status === "cancelled" ? "error" : run?.status === "completed" ? "done" : run ? "active" : "idle";

  return [
    {
      id: "provider-setup",
      kicker: "00",
      label: "Provider setup",
      detail: `${settings.defaultProvider} / ${settings.defaultModel}`,
      state: settings.defaultProvider && settings.defaultModel ? "done" : "blocked",
    },
    {
      id: "intake",
      kicker: "01",
      label: "Run intake",
      detail: run ? run.task : "No run selected",
      state: run ? "done" : "idle",
    },
    {
      id: "tool-risk",
      kicker: "02",
      label: "Tool risk check",
      detail: run?.tool_calls.length ? `${run.tool_calls.length} tool call${run.tool_calls.length === 1 ? "" : "s"}` : "Waiting for tool telemetry",
      state: run?.tool_calls.length ? "done" : "idle",
    },
    {
      id: "approval",
      kicker: "03",
      label: "Human approval",
      detail: firstApproval ? `${firstApproval.action}: ${firstApproval.status}` : "No approval required",
      state: approvalState,
    },
    {
      id: "verification",
      kicker: "04",
      label: "Verification",
      detail: hasVerification ? `${run?.verification_results[0]?.check_type}: ${run?.verification_results[0]?.status}` : "No verification yet",
      state: hasVerification ? "done" : "idle",
    },
    {
      id: "outcome",
      kicker: "05",
      label: "Outcome",
      detail: hasEval ? `Eval score ${run?.eval_runs[0]?.score ?? "n/a"}` : run?.final_action ?? run?.status ?? "Awaiting run",
      state: terminalState,
    },
  ];
}

function buildLoopGraph(steps: LoopStep[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = steps.map((step, index) => ({
    id: step.id,
    type: "default",
    position: { x: index * 214, y: 78 },
    data: { label: <LoopNode step={step} /> },
    className: `loop-flow-node ${step.state}`,
    draggable: false,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
  }));
  const edges: Edge[] = steps.slice(0, -1).map((step, index) => ({
    id: `${step.id}-${steps[index + 1].id}`,
    source: step.id,
    target: steps[index + 1].id,
    type: "smoothstep",
    animated: step.state === "active" || step.state === "blocked",
    markerEnd: { type: MarkerType.ArrowClosed },
    className: `loop-flow-edge ${step.state}`,
  }));
  return { nodes, edges };
}

function LoopNode({ step }: { step: LoopStep }) {
  return (
    <div className="loop-node-content">
      <small>{step.kicker}</small>
      <strong>{step.label}</strong>
      <span>{step.detail}</span>
    </div>
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
