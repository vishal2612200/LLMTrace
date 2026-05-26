import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ChatPage } from "./ChatPage";
import { api, streamChat } from "../api/client";

vi.mock("../api/client", () => ({
  api: {
    conversation: vi.fn(),
    cancel: vi.fn(),
  },
  getRuntimeSettings: () => ({ defaultProvider: "mock", defaultModel: "mock-fast" }),
  subscribeRuntimeSettings: () => () => undefined,
  streamChat: vi.fn(),
}));

describe("ChatPage", () => {
  it("renders empty state and composer", () => {
    render(<ChatPage conversationId={undefined} onConversationChange={() => undefined} />);

    expect(screen.getByText("Start a traceable conversation")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type a message. Sensitive data is redacted before storage.")).toBeInTheDocument();
  });

  it("switches model presets by provider and supports a custom model", async () => {
    render(<ChatPage conversationId={undefined} onConversationChange={() => undefined} />);

    await userEvent.selectOptions(screen.getByLabelText("Provider"), "openai");

    expect(screen.getByLabelText("Model")).toHaveValue("gpt-5.2");
    expect(screen.getByRole("option", { name: "GPT-4o mini" })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Model"), "custom");
    await userEvent.type(screen.getByLabelText("Custom model"), "gpt-custom-local");

    expect(screen.getByLabelText("Custom model")).toHaveValue("gpt-custom-local");

    await userEvent.selectOptions(screen.getByLabelText("Provider"), "anthropic");

    expect(screen.getByLabelText("Model")).toHaveValue("claude-opus-4-1-20250805");
    expect(screen.getByRole("option", { name: "Claude Sonnet 4" })).toBeInTheDocument();
  });

  it("shows a visible failed assistant card when streaming fails", async () => {
    vi.mocked(streamChat).mockImplementation(async (_body, handlers) => {
      handlers.onMetadata({ conversation_id: "conversation-1", request_id: "request-1" });
      handlers.onError("OPENAI_API_KEY is not configured.");
    });

    render(<ChatPage conversationId={undefined} onConversationChange={() => undefined} />);

    await userEvent.type(screen.getByPlaceholderText("Type a message. Sensitive data is redacted before storage."), "hello");
    await userEvent.click(screen.getByRole("button", { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText("assistant failed")).toBeInTheDocument();
    });
    expect(screen.getByText(/Request failed for mock \/ mock-fast/)).toBeInTheDocument();
    expect(screen.getByText("OPENAI_API_KEY is not configured.")).toBeInTheDocument();
  });

  it("shows failed UI when a persisted conversation has failed without an assistant message", async () => {
    vi.mocked(api.conversation).mockResolvedValue({
      id: "conversation-1",
      title: "Failed run",
      status: "failed",
      provider: "openai",
      model: "mock-fast",
      rolling_summary: "",
      structured_memory: {},
      created_at: "2026-05-25T00:00:00Z",
      updated_at: "2026-05-25T00:00:01Z",
      messages: [
        {
          id: "message-1",
          role: "user",
          preview: "hello",
          token_count: 1,
          redaction_metadata: {},
          created_at: "2026-05-25T00:00:00Z",
        },
      ],
      inference_logs: [
        {
          id: "request-1",
          provider: "openai",
          model: "mock-fast",
          status: "failed",
          latency_ms: null,
          prompt_tokens: null,
          completion_tokens: null,
          total_tokens: null,
          error_type: "configuration",
          error_message: "OPENAI_API_KEY is not configured.",
        },
      ],
      checkpoints: [],
    });

    render(<ChatPage conversationId="conversation-1" onConversationChange={() => undefined} />);

    expect(await screen.findByText("assistant failed")).toBeInTheDocument();
    expect(screen.getByText(/Request failed for openai \/ mock-fast/)).toBeInTheDocument();
    expect(screen.getByText(/OPENAI_API_KEY is not configured/)).toBeInTheDocument();
  });

  it("shows persisted conversation checkpoints when resuming", async () => {
    vi.mocked(api.conversation).mockResolvedValue({
      id: "conversation-1",
      title: "Checkpointed run",
      status: "completed",
      provider: "mock",
      model: "mock-fast",
      rolling_summary: "Earlier user asked about staging.",
      structured_memory: { task_state: ["deploy target is staging"] },
      created_at: "2026-05-25T00:00:00Z",
      updated_at: "2026-05-25T00:00:01Z",
      messages: [
        {
          id: "message-1",
          role: "user",
          preview: "hello",
          token_count: 1,
          redaction_metadata: {},
          created_at: "2026-05-25T00:00:00Z",
        },
      ],
      inference_logs: [],
      checkpoints: [
        {
          id: "checkpoint-1",
          sequence: 2,
          reason: "turn_complete",
          summary: "reason=turn_complete; messages=2; tokens=12; latest_user=hello",
          message_count: 2,
          token_count: 12,
          context_messages: [{ role: "user", content: "hello", token_count: 1 }],
          created_at: "2026-05-25T00:00:02Z",
        },
        {
          id: "checkpoint-0",
          sequence: 1,
          reason: "pre_model",
          summary: "reason=pre_model; messages=1; tokens=1; latest_user=hello",
          message_count: 1,
          token_count: 1,
          context_messages: [{ role: "system", content: "Structured conversation memory:\nTask state: deploy target is staging" }],
          created_at: "2026-05-25T00:00:01Z",
        },
      ],
    });

    render(<ChatPage conversationId="conversation-1" onConversationChange={() => undefined} />);

    expect(await screen.findByText("Context checkpoint")).toBeInTheDocument();
    expect(screen.getByText("#2 turn complete")).toBeInTheDocument();
    expect(screen.getByText(/reason=turn_complete/)).toBeInTheDocument();
    expect(screen.getByText("Context sent to model")).toBeInTheDocument();
    expect(screen.getByText(/deploy target is staging/)).toBeInTheDocument();
  });
});
