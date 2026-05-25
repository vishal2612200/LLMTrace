export const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";
const INGESTION_KEY = import.meta.env.VITE_INGESTION_API_KEY;

function ingestionHeaders() {
  return INGESTION_KEY ? { "x-ingestion-key": INGESTION_KEY } : undefined;
}

export type ConversationSummary = {
  id: string;
  title: string;
  status: string;
  provider: string;
  model: string;
  created_at: string;
  updated_at: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  preview: string;
  token_count: number;
  redaction_metadata: Record<string, number>;
  created_at: string;
};

export type InferenceLog = {
  id: string;
  provider: string;
  model: string;
  status: string;
  latency_ms: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  error_type: string | null;
  error_message: string | null;
};

export type ConversationDetail = ConversationSummary & {
  messages: Message[];
  inference_logs: InferenceLog[];
};

export type MetricsSummary = {
  total_requests: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  error_rate: number;
  total_tokens: number;
  recent_failures: Array<Record<string, string | number | null>>;
};

export type TimeseriesPoint = {
  bucket: string;
  requests: number;
  errors: number;
  p95_latency_ms: number;
};

export type ProviderMetric = {
  provider: string;
  model: string;
  requests: number;
  errors: number;
  tokens: number;
};

export type DlqEntry = {
  id: string;
  payload?: Record<string, unknown>;
  error?: string;
};

export type AgentRunSummary = {
  id: string;
  name: string;
  task: string;
  status: string;
  failure_category: string;
  started_at: string;
  ended_at: string | null;
  latency_ms: number | null;
  tool_count: number;
  verification_status: string;
  approval_status: string;
};

export type ToolCall = {
  id: string;
  tool_name: string;
  tool_input_json: Record<string, unknown>;
  tool_output_preview: string | null;
  status: string;
  latency_ms: number | null;
  retry_count: number;
  risk_level: string;
  error_message: string | null;
  created_at: string;
};

export type VerificationResult = {
  id: string;
  check_type: string;
  command: string | null;
  status: string;
  expected_files: string[];
  forbidden_files: string[];
  result_summary: string | null;
  created_at: string;
};

export type HumanApproval = {
  id: string;
  tool_call_id: string | null;
  risk_level: string;
  action: string;
  status: string;
  approver: string | null;
  decision_reason: string | null;
  created_at: string;
  decided_at: string | null;
};

export type EvalCase = {
  id: string;
  name: string;
  category: string;
  task: string;
  expected_behavior: string;
  expected_files: string[];
  forbidden_files: string[];
  success_checks: string[];
  created_at: string;
};

export type AgentRunDetail = AgentRunSummary & {
  created_at: string;
  context_summary: string | null;
  selected_context: Record<string, unknown>;
  final_action: string | null;
  human_override: boolean;
  tool_calls: ToolCall[];
  verification_results: VerificationResult[];
  approvals: HumanApproval[];
  eval_runs: Array<Record<string, unknown>>;
};

export type HarnessMetricsSummary = {
  run_count: number;
  pass_rate: number;
  failure_categories: Record<string, number>;
  approval_counts: Record<string, number>;
  average_tool_latency_ms: number;
  pending_high_risk_approvals: number;
  most_common_failure_category: string;
};

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function getIngestionJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, { headers: ingestionHeaders() });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export const api = {
  conversations: () => getJson<ConversationSummary[]>("/api/conversations"),
  conversation: (id: string) => getJson<ConversationDetail>(`/api/conversations/${id}`),
  metricsSummary: () => getJson<MetricsSummary>("/api/metrics/summary"),
  metricsTimeseries: () => getJson<TimeseriesPoint[]>("/api/metrics/timeseries"),
  metricsProviders: () => getJson<ProviderMetric[]>("/api/metrics/providers"),
  dlq: () => getIngestionJson<DlqEntry[]>("/api/ingest/dlq"),
  replayDlq: async (id: string) => {
    const response = await fetch(`${API_BASE}/api/ingest/dlq/${encodeURIComponent(id)}/replay`, {
      method: "POST",
      headers: ingestionHeaders(),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  },
  harnessRuns: () => getJson<AgentRunSummary[]>("/api/harness/runs"),
  harnessRun: (id: string) => getJson<AgentRunDetail>(`/api/harness/runs/${id}`),
  harnessMetricsSummary: () => getJson<HarnessMetricsSummary>("/api/harness/metrics/summary"),
  harnessEvals: () => getJson<EvalCase[]>("/api/harness/evals"),
  loadHarnessFixtures: async () => {
    const response = await fetch(`${API_BASE}/api/harness/evals/load-fixtures`, { method: "POST" });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<{ loaded: number; skipped: number }>;
  },
  cancel: async (conversationId: string) => {
    const response = await fetch(`${API_BASE}/api/chat/${conversationId}/cancel`, { method: "POST" });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  },
};

export type StreamHandlers = {
  onMetadata: (data: { conversation_id: string; request_id: string }) => void;
  onToken: (chunk: string) => void;
  onDone: (data: { status: string }) => void;
  onError: (message: string) => void;
};

export async function streamChat(
  body: { message: string; conversation_id?: string; provider?: string; model?: string },
  handlers: StreamHandlers,
) {
  const response = await fetch(`${API_BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) throw new Error(await response.text());

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const event = frame.match(/^event: (.+)$/m)?.[1];
      const dataLine = frame.match(/^data: (.+)$/m)?.[1];
      if (!event || !dataLine) continue;
      const data = JSON.parse(dataLine);
      if (event === "metadata") handlers.onMetadata(data);
      if (event === "token") handlers.onToken(data.chunk);
      if (event === "done") handlers.onDone(data);
      if (event === "error") handlers.onError(data.message);
    }
  }
}
