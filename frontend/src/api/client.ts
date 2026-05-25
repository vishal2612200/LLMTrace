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
