const SETTINGS_KEY = "llmtrace.runtimeSettings.cache";
let transientIngestionKey = "";

export const DEFAULT_RUNTIME_SETTINGS = {
  apiBase: import.meta.env.VITE_API_BASE ?? "http://localhost:8000",
  ingestionKey: import.meta.env.VITE_INGESTION_API_KEY ?? "",
  defaultProvider: "mock",
  defaultModel: "mock-fast",
  contextWindowMessages: "8",
  contextWindowTokens: "1200",
  previewChars: "500",
};

export const API_BASE = DEFAULT_RUNTIME_SETTINGS.apiBase;

export type RuntimeSettings = typeof DEFAULT_RUNTIME_SETTINGS;

function readStoredSettings(): Partial<RuntimeSettings> {
  try {
    const stored = window.localStorage.getItem(SETTINGS_KEY);
    const parsed = stored ? (JSON.parse(stored) as Partial<RuntimeSettings>) : {};
    const { ingestionKey: _ingestionKey, ...nonSecret } = parsed;
    return nonSecret;
  } catch {
    return {};
  }
}

function normalizeSettings(settings: Partial<RuntimeSettings>): RuntimeSettings {
  return {
    apiBase: (settings.apiBase || DEFAULT_RUNTIME_SETTINGS.apiBase).trim().replace(/\/+$/, ""),
    ingestionKey: (settings.ingestionKey ?? transientIngestionKey).trim(),
    defaultProvider: (settings.defaultProvider || DEFAULT_RUNTIME_SETTINGS.defaultProvider).trim(),
    defaultModel: (settings.defaultModel || DEFAULT_RUNTIME_SETTINGS.defaultModel).trim(),
    contextWindowMessages: (settings.contextWindowMessages || DEFAULT_RUNTIME_SETTINGS.contextWindowMessages).trim(),
    contextWindowTokens: (settings.contextWindowTokens || DEFAULT_RUNTIME_SETTINGS.contextWindowTokens).trim(),
    previewChars: (settings.previewChars || DEFAULT_RUNTIME_SETTINGS.previewChars).trim(),
  };
}

export function getRuntimeSettings(): RuntimeSettings {
  return normalizeSettings(readStoredSettings());
}

export function saveRuntimeSettings(settings: Partial<RuntimeSettings>): RuntimeSettings {
  const next = normalizeSettings({ ...getRuntimeSettings(), ...settings });
  transientIngestionKey = next.ingestionKey;
  const { ingestionKey: _ingestionKey, ...stored } = next;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(stored));
  window.dispatchEvent(new CustomEvent<RuntimeSettings>("llmtrace:settings-changed", { detail: next }));
  return next;
}

export function resetRuntimeSettings(): RuntimeSettings {
  window.localStorage.removeItem(SETTINGS_KEY);
  transientIngestionKey = "";
  const next = normalizeSettings(DEFAULT_RUNTIME_SETTINGS);
  window.dispatchEvent(new CustomEvent<RuntimeSettings>("llmtrace:settings-changed", { detail: next }));
  return next;
}

export function subscribeRuntimeSettings(listener: (settings: RuntimeSettings) => void) {
  function onSettingsChanged(event: Event) {
    listener((event as CustomEvent<RuntimeSettings>).detail ?? getRuntimeSettings());
  }

  function onStorage(event: StorageEvent) {
    if (event.key === SETTINGS_KEY) listener(getRuntimeSettings());
  }

  window.addEventListener("llmtrace:settings-changed", onSettingsChanged);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener("llmtrace:settings-changed", onSettingsChanged);
    window.removeEventListener("storage", onStorage);
  };
}

function apiBase() {
  return getRuntimeSettings().apiBase;
}

function ingestionHeaders() {
  const ingestionKey = transientIngestionKey;
  return ingestionKey ? { "x-ingestion-key": ingestionKey } : undefined;
}

export type ServerRuntimeSettings = {
  default_provider: "mock" | "openai" | "anthropic";
  default_model: string;
  context_window_messages: number;
  context_window_tokens: number;
  preview_chars: number;
};

export type ProviderStatus = {
  provider: "mock" | "openai" | "anthropic";
  configured: boolean;
  selected: boolean;
  key_env_var: string | null;
  detail: string;
  key_source?: string | null;
};

function serverToRuntime(settings: ServerRuntimeSettings): Partial<RuntimeSettings> {
  return {
    defaultProvider: settings.default_provider,
    defaultModel: settings.default_model,
    contextWindowMessages: String(settings.context_window_messages),
    contextWindowTokens: String(settings.context_window_tokens),
    previewChars: String(settings.preview_chars),
  };
}

function runtimeToServer(settings: RuntimeSettings): ServerRuntimeSettings {
  return {
    default_provider: settings.defaultProvider as ServerRuntimeSettings["default_provider"],
    default_model: settings.defaultModel,
    context_window_messages: Number(settings.contextWindowMessages),
    context_window_tokens: Number(settings.contextWindowTokens),
    preview_chars: Number(settings.previewChars),
  };
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

export type ConversationCheckpoint = {
  id: string;
  sequence: number;
  reason: string;
  summary: string;
  message_count: number;
  token_count: number;
  context_messages: Array<Record<string, unknown>>;
  created_at: string;
};

export type ConversationDetail = ConversationSummary & {
  rolling_summary: string;
  structured_memory: Record<string, string[]>;
  messages: Message[];
  inference_logs: InferenceLog[];
  checkpoints: ConversationCheckpoint[];
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

export type EvalRun = {
  id: string;
  eval_case_id: string;
  agent_run_id: string | null;
  status: string;
  score: number | null;
  failure_category: string;
  result_summary: string | null;
  created_at: string;
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
  eval_runs: EvalRun[];
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
  const response = await fetch(`${apiBase()}${path}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function getIngestionJson<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBase()}${path}`, { headers: ingestionHeaders() });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export const api = {
  conversations: () => getJson<ConversationSummary[]>("/api/conversations"),
  conversation: (id: string) => getJson<ConversationDetail>(`/api/conversations/${id}`),
  metricsSummary: () => getJson<MetricsSummary>("/api/metrics/summary"),
  metricsTimeseries: () => getJson<TimeseriesPoint[]>("/api/metrics/timeseries"),
  metricsProviders: () => getJson<ProviderMetric[]>("/api/metrics/providers"),
  runtimeSettings: async () => {
    const settings = await getJson<ServerRuntimeSettings>("/api/settings/runtime");
    return saveRuntimeSettings({ ...serverToRuntime(settings), ingestionKey: transientIngestionKey });
  },
  updateRuntimeSettings: async (settings: RuntimeSettings) => {
    const response = await fetch(`${apiBase()}/api/settings/runtime`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(runtimeToServer(settings)),
    });
    if (!response.ok) throw new Error(await response.text());
    const saved = (await response.json()) as ServerRuntimeSettings;
    return saveRuntimeSettings({ ...serverToRuntime(saved), apiBase: settings.apiBase, ingestionKey: settings.ingestionKey });
  },
  resetRuntimeSettings: async () => {
    const response = await fetch(`${apiBase()}/api/settings/runtime/reset`, { method: "POST" });
    if (!response.ok) throw new Error(await response.text());
    const reset = (await response.json()) as ServerRuntimeSettings;
    return saveRuntimeSettings({
      ...serverToRuntime(reset),
      apiBase: getRuntimeSettings().apiBase,
      ingestionKey: transientIngestionKey,
    });
  },
  providerStatuses: () => getJson<ProviderStatus[]>("/api/settings/providers/status"),
  updateProviderKey: async (provider: "openai" | "anthropic", apiKey: string) => {
    const response = await fetch(`${apiBase()}/api/settings/providers/${provider}/key`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey }),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<ProviderStatus>;
  },
  dlq: () => getIngestionJson<DlqEntry[]>("/api/ingest/dlq"),
  replayDlq: async (id: string) => {
    const response = await fetch(`${apiBase()}/api/ingest/dlq/${encodeURIComponent(id)}/replay`, {
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
  runHarnessSmoke: async () => {
    const response = await fetch(`${apiBase()}/api/harness/smoke`, { method: "POST" });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<{ id: string }>;
  },
  runHarnessEval: async (id: string) => {
    const response = await fetch(`${apiBase()}/api/harness/evals/${encodeURIComponent(id)}/run`, { method: "POST" });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<{ id: string }>;
  },
  decideHarnessApproval: async (id: string, status: "approved" | "rejected", decisionReason: string) => {
    const response = await fetch(`${apiBase()}/api/harness/approvals/${encodeURIComponent(id)}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, approver: "ui_operator", decision_reason: decisionReason }),
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<{ id: string }>;
  },
  loadHarnessFixtures: async () => {
    const response = await fetch(`${apiBase()}/api/harness/evals/load-fixtures`, { method: "POST" });
    if (!response.ok) throw new Error(await response.text());
    return response.json() as Promise<{ loaded: number; skipped: number }>;
  },
  cancel: async (conversationId: string) => {
    const response = await fetch(`${apiBase()}/api/chat/${conversationId}/cancel`, { method: "POST" });
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
  const response = await fetch(`${apiBase()}/api/chat/stream`, {
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
