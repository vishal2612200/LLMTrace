import React from "react";
import { PauseCircle, Play, RotateCcw, SendHorizontal, ShieldCheck } from "lucide-react";

import { api, Message, streamChat } from "../api/client";
import { redactForPreview } from "../utils/redaction";

type ChatPageProps = {
  conversationId?: string;
  onConversationChange: (id: string | undefined) => void;
};

type UiMessage = Pick<Message, "role" | "preview"> & { id: string };

export function ChatPage({ conversationId, onConversationChange }: ChatPageProps) {
  const [messages, setMessages] = React.useState<UiMessage[]>([]);
  const [input, setInput] = React.useState("");
  const [provider, setProvider] = React.useState("mock");
  const [model, setModel] = React.useState("mock-fast");
  const [streaming, setStreaming] = React.useState(false);
  const [status, setStatus] = React.useState("Ready");
  const messageListRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (streaming) return;
    if (!conversationId) {
      setMessages([]);
      return;
    }
    api
      .conversation(conversationId)
      .then((detail) => {
        setMessages(detail.messages.map((m) => ({ id: m.id, role: m.role, preview: m.preview })));
        setProvider(detail.provider);
        setModel(detail.model);
      })
      .catch((error) => setStatus(error.message));
  }, [conversationId, streaming]);

  React.useEffect(() => {
    const node = messageListRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setStreaming(true);
    setStatus("Streaming");
    const userMessage = { id: crypto.randomUUID(), role: "user" as const, preview: redactForPreview(text) };
    const assistantMessage = { id: crypto.randomUUID(), role: "assistant" as const, preview: "" };
    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    try {
      await streamChat(
        { message: text, conversation_id: conversationId, provider, model },
        {
          onMetadata: (data) => onConversationChange(data.conversation_id),
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
          },
          onError: (message) => {
            setStreaming(false);
            setStatus(message);
          },
        },
      );
    } catch (error) {
      setStreaming(false);
      setStatus(error instanceof Error ? error.message : "Request failed");
    }
  }

  async function cancel() {
    if (!conversationId) return;
    await api.cancel(conversationId);
    setStreaming(false);
    setStatus("cancelled");
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
              onChange={(event) => setProvider(event.target.value)}
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
            <input value={model} onChange={(event) => setModel(event.target.value)} aria-label="Model" disabled={streaming} />
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
              <article key={message.id} className={`message ${message.role}`}>
                <span>{message.role}</span>
                <p>{message.preview}</p>
              </article>
            ))
          )}
        </div>

        <div className="composer">
          <div className="status-line">
            <span>
              <span className={`status-dot ${streaming ? "live" : ""}`} />
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
            <button className="primary" onClick={send} disabled={streaming || input.trim().length === 0}>
              <SendHorizontal size={18} /> Send
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
