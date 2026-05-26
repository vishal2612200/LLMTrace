import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { api } from "../api/client";
import { ConversationsPage } from "./ConversationsPage";

vi.mock("../api/client", () => ({
  api: {
    conversations: vi.fn(),
  },
}));

describe("ConversationsPage", () => {
  it("resumes a conversation when the row is clicked or activated by keyboard", async () => {
    vi.mocked(api.conversations).mockResolvedValue([
      {
        id: "conversation-1",
        title: "Pricing follow-up",
        status: "completed",
        provider: "mock",
        model: "mock-fast",
        created_at: "2026-05-25T00:00:00Z",
        updated_at: "2026-05-25T00:01:00Z",
      },
    ]);
    const onResume = vi.fn();

    render(<ConversationsPage onResume={onResume} />);

    const row = await screen.findByRole("button", { name: "Resume conversation Pricing follow-up" });
    await userEvent.click(row);

    expect(onResume).toHaveBeenCalledWith("conversation-1");

    onResume.mockClear();
    row.focus();
    await userEvent.keyboard("{Enter}");

    await waitFor(() => {
      expect(onResume).toHaveBeenCalledWith("conversation-1");
    });
  });
});
