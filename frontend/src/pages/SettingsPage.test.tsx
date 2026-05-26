import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./SettingsPage";

const apiMock = vi.hoisted(() => ({
  providerStatuses: vi.fn(),
  resetRuntimeSettings: vi.fn(),
  updateRuntimeSettings: vi.fn(),
}));

vi.mock("../api/client", async () => {
  const actual = await vi.importActual<typeof import("../api/client")>("../api/client");
  return {
    ...actual,
    api: {
      ...actual.api,
      providerStatuses: apiMock.providerStatuses,
      resetRuntimeSettings: apiMock.resetRuntimeSettings,
      updateRuntimeSettings: apiMock.updateRuntimeSettings,
    },
  };
});

describe("SettingsPage", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    window.localStorage.clear();
    apiMock.resetRuntimeSettings.mockReset();
    apiMock.updateRuntimeSettings.mockReset();
    apiMock.providerStatuses.mockReset();
    apiMock.updateRuntimeSettings.mockImplementation(async (settings) => settings);
    apiMock.providerStatuses.mockResolvedValue([
      { provider: "mock", configured: true, selected: true, key_env_var: null, detail: "Ready. Mock provider needs no API key." },
      { provider: "openai", configured: false, selected: false, key_env_var: "OPENAI_API_KEY", detail: "Missing OPENAI_API_KEY in backend environment." },
      { provider: "anthropic", configured: false, selected: false, key_env_var: "ANTHROPIC_API_KEY", detail: "Missing ANTHROPIC_API_KEY in backend environment." },
    ]);
    apiMock.resetRuntimeSettings.mockResolvedValue({
      apiBase: "http://localhost:8000",
      ingestionKey: "",
      defaultProvider: "mock",
      defaultModel: "mock-fast",
      contextWindowMessages: "8",
      contextWindowTokens: "1200",
      previewChars: "500",
    });
  });

  it("validates values before saving", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.clear(screen.getByLabelText("Settings API base URL"));
    await user.type(screen.getByLabelText("Settings API base URL"), "ftp://example.com");
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("API base must start with http:// or https://.");
    expect(apiMock.updateRuntimeSettings).not.toHaveBeenCalled();
  });

  it("saves non-secret runtime settings and does not persist ingestion key", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.clear(screen.getByLabelText("Settings ingestion API key"));
    await user.type(screen.getByLabelText("Settings ingestion API key"), "secret-key");
    await user.selectOptions(screen.getByLabelText("Settings default provider"), "openai");
    await user.clear(screen.getByLabelText("Settings default model"));
    await user.type(screen.getByLabelText("Settings default model"), "gpt-test");
    await user.click(screen.getByRole("button", { name: "Save settings" }));

    await waitFor(() => expect(apiMock.updateRuntimeSettings).toHaveBeenCalled());
    expect(window.localStorage.getItem("llmtrace.runtimeSettings.cache")).not.toContain("secret-key");
    expect(screen.getByText("Saved to server")).toBeInTheDocument();
  });

  it("applies provider setup presets before saving", async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);

    await user.click(screen.getByRole("button", { name: "Use OpenAI" }));

    expect(screen.getByLabelText("Settings default provider")).toHaveValue("openai");
    expect(screen.getByLabelText("Settings default model")).toHaveValue("gpt-5-mini");
    expect(screen.getByText("Unsaved provider setup")).toBeInTheDocument();
    expect(screen.getByText("Missing OPENAI_API_KEY in backend environment.")).toBeInTheDocument();
  });
});
