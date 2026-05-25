import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatPage } from "./ChatPage";

vi.mock("../api/client", () => ({
  api: {
    conversation: vi.fn(),
    cancel: vi.fn(),
  },
  streamChat: vi.fn(),
}));

describe("ChatPage", () => {
  it("renders empty state and composer", () => {
    render(<ChatPage conversationId={undefined} onConversationChange={() => undefined} />);

    expect(screen.getByText("Start a traceable conversation")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Type a message. Sensitive data is redacted before storage.")).toBeInTheDocument();
  });
});
