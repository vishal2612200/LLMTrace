import React from "react";
import { AlertTriangle, GitCommitHorizontal, PauseCircle, Play, RotateCcw, SendHorizontal, ShieldCheck } from "lucide-react";

import { api, ConversationCheckpoint, ConversationDetail, getRuntimeSettings, Message, streamChat, subscribeRuntimeSettings } from "../api/client";
import { redactForPreview } from "../utils/redaction";

type ChatPageProps = {
  conversationId?: string;
  onConversationChange: (id: string | undefined) => void;
};

type UiMessage = Pick<Message, "role" | "preview"> & {
  id: string;
  state?: "streaming" | "failed" | "done";
};

type ModelOption = {
  label: string;
  value: string;
};

const MODEL_OPTIONS: Record<string, ModelOption[]> = {
  mock: [{ label: "Mock fast", value: "mock-fast" }],
  openai: [
    { label: "GPT-5.2", value: "gpt-5.2" },
    { label: "GPT-5.2 pro", value: "gpt-5.2-pro" },
    { label: "GPT-5 mini", value: "gpt-5-mini" },
    { label: "GPT-5 nano", value: "gpt-5-nano" },
    { label: "GPT-4.1", value: "gpt-4.1" },
    { label: "GPT-4.1 mini", value: "gpt-4.1-mini" },
    { label: "GPT-4o", value: "gpt-4o" },
    { label: "GPT-4o mini", value: "gpt-4o-mini" },
  ],
  anthropic: [
    { label: "Claude Opus 4.1", value: "claude-opus-4-1-20250805" },
    { label: "Claude Opus 4", value: "claude-opus-4-20250514" },
    { label: "Claude Sonnet 4", value: "claude-sonnet-4-20250514" },
    { label: "Claude 3.7 Sonnet", value: "claude-3-7-sonnet-20250219" },
    { label: "Claude 3.5 Haiku", value: "claude-3-5-haiku-20241022" },
    { label: "Claude 3 Haiku", value: "claude-3-haiku-20240307" },
  ],
};

export function ChatPage({ conversationId, onConversationChange }: ChatPageProps) {
  const [messages, setMessages] = React.useState<UiMessage[]>([]);
  const [checkpoints, setCheckpoints] = React.useState<ConversationCheckpoint[]>([]);
  const [input, setInput] = React.useState("");
  const [provider, setProvider] = React.useState(() => getRuntimeSettings().defaultProvider);
  const [model, setModel] = React.useState(() => getRuntimeSettings().defaultModel);
  const [streaming, setStreaming] = React.useState(false);
  const [status, setStatus] = React.useState("Ready");
  const [statusTone, setStatusTone] = React.useState<"idle" | "streaming" | "failed" | "done">("idle");
  const messageListRef = React.useRef<HTMLDivElement | null>(null);
  const streamFailureMessagesRef = React.useRef<Record<string, string>>({});
  const modelOptions = modelOptionsForProvider(provider);
  const selectedModelOption = modelOptions.some((option) => option.value === model) ? model : "custom";
  const isCustomModel = selectedModelOption === "custom";
  const canSend = !streaming && input.trim().length > 0 && model.trim().length > 0;

  React.useEffect(() => {
    if (streaming) return;
    if (!conversationId) {
      setMessages([]);
      setCheckpoints([]);
      return;
    }
    api
      .conversation(conversationId)
      .then((detail) => {
        setMessages(messagesFromConversation(detail, streamFailureMessagesRef.current[detail.id]));
        setCheckpoints(detail.checkpoints ?? []);
        setProvider(detail.provider);
        setModel(detail.model);
        setStatus(detail.status);
        setStatusTone(detail.status === "failed" ? "failed" : detail.status === "completed" ? "done" : "idle");
      })
      .catch((error) => {
        setStatus(error.message);
        setStatusTone("failed");
      });
  }, [conversationId, streaming]);

  React.useEffect(() => {
    return subscribeRuntimeSettings((settings) => {
      if (conversationId || streaming) return;
      setProvider(settings.defaultProvider);
      setModel(settings.defaultModel);
    });
  }, [conversationId, streaming]);

  React.useEffect(() => {
    const node = messageListRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  async function refreshCheckpoints(id: string | undefined) {
    if (!id) return;
    try {
      const detail = await api.conversation(id);
      setCheckpoints(detail.checkpoints ?? []);
    } catch {
      // Keep the visible streamed response if metadata refresh fails.
    }
  }

  async function send() {
    const text = input.trim();
    const selectedModel = model.trim();
    if (!text || !selectedModel || streaming) return;
    setInput("");
    setStreaming(true);
    setStatus("Streaming");
    setStatusTone("streaming");
    const userMessage = { id: crypto.randomUUID(), role: "user" as const, preview: redactForPreview(text) };
    const assistantMessage = { id: crypto.randomUUID(), role: "assistant" as const, preview: "", state: "streaming" as const };
    let streamedConversationId = conversationId;
    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    try {
      await streamChat(
        { message: text, conversation_id: conversationId, provider, model: selectedModel },
        {
          onMetadata: (data) => {
            streamedConversationId = data.conversation_id;
            onConversationChange(data.conversation_id);
          },
          onToken: (chunk) => {
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessage.id ? { ...message, preview: message.preview + chunk } : message,
              ),
            );
          },
          onDone: (data) => {
            setStreaming(false);
            setStatus(data.status);
            setStatusTone(data.status === "completed" ? "done" : data.status === "cancelled" ? "idle" : "failed");
            void refreshCheckpoints(streamedConversationId);
            setMessages((prev) =>
              prev.map((message) =>
                message.id === assistantMessage.id
                  ? {
                      ...message,
                      preview: message.preview || (data.status === "cancelled" ? "Request cancelled before a response was returned." : message.preview),
                      state: data.status === "completed" ? "done" : data.status === "cancelled" ? "failed" : "failed",
                    }
                  : message,
              ),
            );
          },
          onError: (message) => {
            setStreaming(false);
            setStatus(message);
            setStatusTone("failed");
            if (streamedConversationId) streamFailureMessagesRef.current[streamedConversationId] = message;
            void refreshCheckpoints(streamedConversationId);
            setMessages((prev) =>
              prev.map((item) =>
                item.id === assistantMessage.id
                  ? { ...item, preview: formatFailureMessage(message, provider, selectedModel), state: "failed" }
                  : item,
              ),
            );
          },
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      setStreaming(false);
      setStatus(message);
      setStatusTone("failed");
      void refreshCheckpoints(streamedConversationId);
      setMessages((prev) =>
        prev.map((item) =>
          item.id === assistantMessage.id ? { ...item, preview: formatFailureMessage(message, provider, selectedModel), state: "failed" } : item,
        ),
      );
    }
  }

  async function cancel() {
    if (!conversationId) return;
    await api.cancel(conversationId);
    setStreaming(false);
    setStatus("cancelled");
    setStatusTone("idle");
  }

  return (
    <section className="workspace">
      <header className="toolbar">
        <div>
          <h1>Chat Trace</h1>
          <p>Multi-turn LLM chat with redacted observability events.</p>
        </div>
        <div className="toolbar-actions">
          <label className="field-control">
            <span>Provider</span>
            <select
              value={provider}
              onChange={(event) => {
                const nextProvider = event.target.value;
                setProvider(nextProvider);
                setModel(defaultModelForProvider(nextProvider));
              }}
              aria-label="Provider"
              disabled={streaming}
            >
              <option value="mock">Mock</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </label>
          <label className="field-control model-field">
            <span>Model</span>
            <select
              value={selectedModelOption}
              onChange={(event) => {
                if (event.target.value === "custom") {
                  setModel(isKnownModel(provider, model) ? "" : model);
                  return;
                }
                setModel(event.target.value);
              }}
              aria-label="Model"
              disabled={streaming}
            >
              {modelOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              <option value="custom">Custom model...</option>
            </select>
            {isCustomModel && (
              <input
                value={model}
                onChange={(event) => setModel(event.target.value)}
                aria-label="Custom model"
                disabled={streaming}
                placeholder={customModelPlaceholder(provider)}
              />
            )}
          </label>
          <button
            className="icon-button"
            onClick={() => onConversationChange(undefined)}
            title="New conversation"
            aria-label="New conversation"
          >
            <RotateCcw size={18} />
          </button>
        </div>
      </header>

      <div className="chat-layout">
        <div className="message-list" aria-live="polite" ref={messageListRef}>
          {messages.length === 0 ? (
            <div className="empty-state">
              <Play size={30} />
              <strong>Start a traceable conversation</strong>
              <span>Send a prompt with an email or API key to see redacted previews and ingestion metrics.</span>
              <div className="prompt-chips" aria-label="Example prompts">
                {[
                  {
                    label: "Demo email redaction",
                    prompt: "Summarize this system and include test@example.com",
                  },
                  {
                    label: "Demo API-key redaction",
                    prompt: "Log this Bearer sk-demo12345678901234567890 safely",
                  },
                ].map(({ label, prompt }) => (
                  <button key={label} onClick={() => setInput(prompt)}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <article key={message.id} className={`message ${message.role} ${message.state === "failed" ? "failed" : ""}`}>
                <span>
                  {message.state === "failed" && <AlertTriangle size={14} />}
                  {message.role}{message.state === "failed" ? " failed" : ""}
                </span>
                {message.preview ? <p>{message.preview}</p> : <p className="message-pending">Waiting for response...</p>}
              </article>
            ))
          )}
      </div>

        <CheckpointPanel checkpoints={checkpoints} />

        <div className="composer">
          <div className={`status-line ${statusTone === "failed" ? "failed" : ""}`}>
            <span>
              <span className={`status-dot ${streaming ? "live" : ""} ${statusTone === "failed" ? "warn" : ""}`} />
              {status}
            </span>
            <span className="redaction-note">
              <ShieldCheck size={15} /> Redacted previews only
            </span>
          </div>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
            placeholder="Type a message. Sensitive data is redacted before storage."
          />
          <div className="composer-actions">
            <button onClick={cancel} disabled={!streaming || !conversationId}>
              <PauseCircle size={18} /> Cancel
            </button>
            <button className="primary" onClick={send} disabled={!canSend}>
              <SendHorizontal size={18} /> Send
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function CheckpointPanel({ checkpoints }: { checkpoints: ConversationCheckpoint[] }) {
  const latest = checkpoints[0];
  const contextCheckpoint = checkpoints.find((checkpoint) => checkpoint.reason === "pre_model") ?? latest;
  return (
    <section className="checkpoint-panel" aria-label="Conversation checkpoints">
      <div className="checkpoint-head">
        <span>
          <GitCommitHorizontal size={16} /> Context checkpoint
        </span>
        <strong>{latest ? `#${latest.sequence} ${formatCheckpointReason(latest.reason)}` : "waiting"}</strong>
      </div>
      {latest ? (
        <>
          <p>{latest.summary}</p>
          <div className="checkpoint-stats">
            <span>{latest.message_count} messages</span>
            <span>{latest.token_count} tokens</span>
            <span>{new Date(latest.created_at).toLocaleTimeString()}</span>
          </div>
          {checkpoints.length > 1 ? (
            <div className="checkpoint-history">
              {checkpoints.slice(1, 4).map((checkpoint) => (
                <span key={checkpoint.id}>
                  #{checkpoint.sequence} {formatCheckpointReason(checkpoint.reason)}
                </span>
              ))}
            </div>
          ) : null}
          {contextCheckpoint?.context_messages.length ? (
            <details className="context-debug">
              <summary>Context sent to model</summary>
              <div>
                {contextCheckpoint.context_messages.map((message, index) => (
                  <article key={`${contextCheckpoint.id}-${index}`}>
                    <strong>{String(message.role ?? "context")}</strong>
                    <p>{String(message.content ?? "")}</p>
                  </article>
                ))}
              </div>
            </details>
          ) : null}
        </>
      ) : (
        <p>Each resumed chat now gets a durable redacted context snapshot before model calls and after terminal states.</p>
      )}
    </section>
  );
}

function formatCheckpointReason(reason: string) {
  return reason.replace(/_/g, " ");
}

function formatFailureMessage(message: string, provider: string, model: string) {
  const trimmed = message.trim() || "Request failed.";
  return `Request failed for ${provider} / ${model}.\n\n${trimmed}`;
}

function modelOptionsForProvider(provider: string) {
  return MODEL_OPTIONS[provider] ?? [];
}

function defaultModelForProvider(provider: string) {
  return modelOptionsForProvider(provider)[0]?.value ?? "";
}

function isKnownModel(provider: string, model: string) {
  return modelOptionsForProvider(provider).some((option) => option.value === model);
}

function customModelPlaceholder(provider: string) {
  if (provider === "openai") return "gpt-5.2-2026-...";
  if (provider === "anthropic") return "claude-sonnet-4-...";
  return "custom-model-id";
}

function messagesFromConversation(detail: ConversationDetail, streamedFailureMessage?: string): UiMessage[] {
  const messages: UiMessage[] = detail.messages.map((m) => ({ id: m.id, role: m.role, preview: m.preview, state: "done" }));
  if (detail.status !== "failed") return messages;
  const hasFailedAssistant = messages.some((message) => message.role === "assistant" && message.state === "failed");
  if (hasFailedAssistant) return messages;
  const latestFailure = [...detail.inference_logs].reverse().find((log) => log.status === "failed" || log.error_message);
  messages.push({
    id: `${detail.id}-failed`,
    role: "assistant",
    preview: formatFailureMessage(
      streamedFailureMessage ?? latestFailure?.error_message ?? "The request failed before a response was returned.",
      detail.provider,
      detail.model,
    ),
    state: "failed",
  });
  return messages;
}
