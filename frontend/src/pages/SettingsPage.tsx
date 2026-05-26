import React from "react";
import { AlertTriangle, CheckCircle2, Cloud, FileJson, FileText, KeyRound, Radio, RotateCcw, Settings, ShieldCheck } from "lucide-react";

import { api, DEFAULT_RUNTIME_SETTINGS, ProviderStatus, resetRuntimeSettings, RuntimeSettings, saveRuntimeSettings } from "../api/client";
import { useRuntimeSettings } from "../hooks/useRuntimeSettings";
import { CodeBlock, CopyState, copyTextToClipboard, StatusCard, UtilityTitle } from "./UtilityComponents";

const envRows = [
  ["VITE_API_BASE", DEFAULT_RUNTIME_SETTINGS.apiBase, "Initial frontend API target before local overrides."],
  ["VITE_INGESTION_API_KEY", DEFAULT_RUNTIME_SETTINGS.ingestionKey ? "configured" : "missing", "Initial DLQ admin key before local overrides."],
  ["DEFAULT_PROVIDER", DEFAULT_RUNTIME_SETTINGS.defaultProvider, "Initial chat provider for new conversations."],
  ["DEFAULT_MODEL", DEFAULT_RUNTIME_SETTINGS.defaultModel, "Initial chat model for new conversations."],
  ["INGESTION_API_KEY", "optional", "Shared key required by ingestion and DLQ endpoints when set."],
  ["CONTEXT_WINDOW_MESSAGES", "8", "Maximum recent messages considered before token budgeting."],
  ["CONTEXT_WINDOW_TOKENS", "1200", "Maximum redacted context tokens sent to the model."],
];

const providerPresets = [
  {
    provider: "mock",
    model: "mock-fast",
    label: "Mock",
    description: "No key required. Best for local demos, tests, and deterministic screenshots.",
  },
  {
    provider: "openai",
    model: "gpt-5-mini",
    label: "OpenAI",
    description: "Use when OPENAI_API_KEY is available in the backend environment.",
  },
  {
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    label: "Anthropic",
    description: "Use when ANTHROPIC_API_KEY is available in the backend environment.",
  },
] satisfies Array<{ provider: RuntimeSettings["defaultProvider"]; model: string; label: string; description: string }>;

function frontendEnvSnippet(settings: RuntimeSettings) {
  return `VITE_API_BASE=${settings.apiBase}
VITE_INGESTION_API_KEY=dev-ingestion-key`;
}

function backendEnvSnippet(settings: RuntimeSettings) {
  return `DEFAULT_PROVIDER=${settings.defaultProvider}
DEFAULT_MODEL=${settings.defaultModel}
INGESTION_API_KEY=dev-ingestion-key
CONTEXT_WINDOW_MESSAGES=${settings.contextWindowMessages}
CONTEXT_WINDOW_TOKENS=${settings.contextWindowTokens}
PREVIEW_CHARS=${settings.previewChars}`;
}

function validateDraft(draft: RuntimeSettings) {
  try {
    const url = new URL(draft.apiBase);
    if (!["http:", "https:"].includes(url.protocol)) return "API base must start with http:// or https://.";
  } catch {
    return "API base must be a valid URL.";
  }
  if (!["mock", "openai", "anthropic"].includes(draft.defaultProvider)) return "Provider must be mock, openai, or anthropic.";
  if (!draft.defaultModel.trim()) return "Default model is required.";
  const contextWindow = Number(draft.contextWindowMessages);
  if (!Number.isInteger(contextWindow) || contextWindow < 1 || contextWindow > 50) {
    return "Context window must be a whole number from 1 to 50.";
  }
  const contextTokens = Number(draft.contextWindowTokens);
  if (!Number.isInteger(contextTokens) || contextTokens < 200 || contextTokens > 32000) {
    return "Context tokens must be a whole number from 200 to 32000.";
  }
  const previewChars = Number(draft.previewChars);
  if (!Number.isInteger(previewChars) || previewChars < 80 || previewChars > 4000) {
    return "Preview chars must be a whole number from 80 to 4000.";
  }
  return null;
}

export function SettingsPage() {
  const [health, setHealth] = React.useState<"checking" | "healthy" | "failed">("checking");
  const [healthDetail, setHealthDetail] = React.useState("Checking backend health.");
  const [copied, setCopied] = React.useState<CopyState>({});
  const settings = useRuntimeSettings();
  const [draft, setDraft] = React.useState(settings);
  const [saveStatus, setSaveStatus] = React.useState("Saved locally");
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [providerStatuses, setProviderStatuses] = React.useState<ProviderStatus[]>([]);
  const [providerKeys, setProviderKeys] = React.useState<Record<"openai" | "anthropic", string>>({ openai: "", anthropic: "" });
  const [providerKeyStatus, setProviderKeyStatus] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const hasChanges = JSON.stringify(draft) !== JSON.stringify(settings);
  const ingestionKeyConfigured = Boolean(settings.ingestionKey);

  async function copy(id: string, value: string) {
    await copyTextToClipboard(value);
    setCopied((state) => ({ ...state, [id]: true }));
    window.setTimeout(() => setCopied((state) => ({ ...state, [id]: false })), 1400);
  }

  async function checkHealth() {
    setHealth("checking");
    setHealthDetail("Checking backend health.");
    try {
      const response = await fetch(`${settings.apiBase}/health`);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      setHealth("healthy");
      setHealthDetail("Backend health endpoint responded successfully.");
    } catch (error) {
      setHealth("failed");
      setHealthDetail(error instanceof Error ? error.message : "Backend health check failed.");
    }
  }

  React.useEffect(() => {
    void checkHealth();
  }, [settings.apiBase]);

  async function refreshProviderStatuses() {
    try {
      setProviderStatuses(await api.providerStatuses());
    } catch {
      setProviderStatuses([]);
    }
  }

  React.useEffect(() => {
    void refreshProviderStatuses();
  }, [settings.apiBase, settings.defaultProvider, settings.defaultModel]);

  function updateDraft(key: keyof RuntimeSettings, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
    setSaveStatus("Unsaved changes");
    setValidationError(null);
  }

  function applyProviderPreset(provider: RuntimeSettings["defaultProvider"], model: string) {
    setDraft((current) => ({ ...current, defaultProvider: provider, defaultModel: model }));
    setSaveStatus("Unsaved provider setup");
    setValidationError(null);
  }

  async function saveProviderKey(provider: "openai" | "anthropic") {
    const apiKey = providerKeys[provider].trim();
    if (!apiKey) {
      setProviderKeyStatus((current) => ({ ...current, [provider]: "Enter a key to configure this provider." }));
      return;
    }
    setProviderKeyStatus((current) => ({ ...current, [provider]: "Saving key to backend runtime settings..." }));
    try {
      await api.updateProviderKey(provider, apiKey);
      setProviderKeys((current) => ({ ...current, [provider]: "" }));
      setProviderKeyStatus((current) => ({ ...current, [provider]: "Configured from Settings." }));
      await refreshProviderStatuses();
    } catch (error) {
      setProviderKeyStatus((current) => ({
        ...current,
        [provider]: error instanceof Error ? `Key not saved: ${error.message}` : "Key not saved.",
      }));
    }
  }

  async function saveSettings() {
    const error = validateDraft(draft);
    if (error) {
      setValidationError(error);
      setSaveStatus("Fix validation errors");
      return;
    }
    saveRuntimeSettings(draft);
    try {
      await api.updateRuntimeSettings(draft);
      setSaveStatus("Saved to server");
      setValidationError(null);
      await refreshProviderStatuses();
    } catch (saveError) {
      setSaveStatus("Connection saved locally");
      setValidationError(saveError instanceof Error ? `Server settings not saved: ${saveError.message}` : "Server settings not saved.");
    }
  }

  async function resetSettings() {
    resetRuntimeSettings();
    try {
      await api.resetRuntimeSettings();
      setSaveStatus("Reset on server");
      setValidationError(null);
      await refreshProviderStatuses();
    } catch (resetError) {
      setSaveStatus("Reset locally");
      setValidationError(resetError instanceof Error ? `Server settings not reset: ${resetError.message}` : "Server settings not reset.");
    }
  }

  return (
    <section className="workspace utility-workspace">
      <header className="toolbar">
        <div>
          <h1>Settings</h1>
          <p>Runtime configuration, environment values, provider setup, and connection checks for this frontend session.</p>
        </div>
        <button onClick={() => void checkHealth()}>
          <Radio size={18} /> Check API
        </button>
      </header>

      <div className="metric-grid utility-status-grid">
        <StatusCard icon={<Cloud />} label="API base" value={settings.apiBase} note="Saved browser override for API calls" tone="blue" />
        <StatusCard
          icon={health === "healthy" ? <CheckCircle2 /> : <AlertTriangle />}
          label="Backend"
          value={health === "checking" ? "Checking" : health === "healthy" ? "Healthy" : "Unavailable"}
          note={healthDetail}
          tone={health === "healthy" ? "green" : health === "checking" ? "amber" : "red"}
        />
        <StatusCard
          icon={<KeyRound />}
          label="DLQ key"
          value={ingestionKeyConfigured ? "Configured" : "Session only"}
          note="Kept in memory for this tab; not persisted to browser or server storage"
          tone={ingestionKeyConfigured ? "green" : "amber"}
        />
        <StatusCard
          icon={<ShieldCheck />}
          label="Provider"
          value={settings.defaultProvider}
          note={`New chat default model: ${settings.defaultModel}`}
          tone="teal"
        />
      </div>

      <section className="panel utility-card">
        <UtilityTitle icon={<Settings size={18} />} title="Editable Runtime Values" meta={saveStatus} />
        <div className="settings-form">
          <label className="settings-field wide">
            <span>API base URL</span>
            <input aria-label="Settings API base URL" value={draft.apiBase} onChange={(event) => updateDraft("apiBase", event.target.value)} placeholder="http://localhost:8000" />
            <small>Local browser connection setting; needed before this frontend can reach a backend.</small>
          </label>
          <label className="settings-field wide">
            <span>Ingestion API key</span>
            <input aria-label="Settings ingestion API key" value={draft.ingestionKey} onChange={(event) => updateDraft("ingestionKey", event.target.value)} placeholder="dev-ingestion-key" type="password" />
            <small>Session-only secret sent as <code>x-ingestion-key</code> for DLQ calls; never persisted.</small>
          </label>
          <label className="settings-field">
            <span>Default provider</span>
            <select aria-label="Settings default provider" value={draft.defaultProvider} onChange={(event) => updateDraft("defaultProvider", event.target.value)}>
              <option value="mock">mock</option>
              <option value="openai">openai</option>
              <option value="anthropic">anthropic</option>
            </select>
            <small>Saved to server and used for new chat sessions.</small>
          </label>
          <label className="settings-field">
            <span>Default model</span>
            <input aria-label="Settings default model" value={draft.defaultModel} onChange={(event) => updateDraft("defaultModel", event.target.value)} />
            <small>Saved to server and used for new chat sessions.</small>
          </label>
          <label className="settings-field">
            <span>Context window</span>
            <input aria-label="Settings context window" inputMode="numeric" value={draft.contextWindowMessages} onChange={(event) => updateDraft("contextWindowMessages", event.target.value)} />
            <small>Maximum recent messages considered before token budgeting.</small>
          </label>
          <label className="settings-field">
            <span>Context tokens</span>
            <input aria-label="Settings context tokens" inputMode="numeric" value={draft.contextWindowTokens} onChange={(event) => updateDraft("contextWindowTokens", event.target.value)} />
            <small>Token budget for redacted context sent to the model.</small>
          </label>
          <label className="settings-field">
            <span>Preview chars</span>
            <input aria-label="Settings preview chars" inputMode="numeric" value={draft.previewChars} onChange={(event) => updateDraft("previewChars", event.target.value)} />
            <small>Saved to server and applies to new redacted previews.</small>
          </label>
        </div>
        {validationError && (
          <div className="settings-error" role="alert">
            <AlertTriangle size={18} />
            <span>{validationError}</span>
          </div>
        )}
        <div className="settings-actions">
          <button className="primary" onClick={() => void saveSettings()} disabled={!hasChanges}>
            <CheckCircle2 size={18} /> Save settings
          </button>
          <button onClick={() => setDraft(settings)} disabled={!hasChanges}>
            <RotateCcw size={18} /> Discard
          </button>
          <button onClick={() => void resetSettings()}>
            <RotateCcw size={18} /> Reset defaults
          </button>
        </div>
      </section>

      <section className="panel utility-card">
        <UtilityTitle icon={<KeyRound size={18} />} title="Provider API Keys" meta="Backend runtime overrides" />
        <p>Configure real providers here without editing Docker or restarting the backend. Secrets are sent to the backend and are not stored in browser localStorage or returned by the API.</p>
        <div className="provider-key-grid">
          {providerPresets
            .filter((preset) => preset.provider === "openai" || preset.provider === "anthropic")
            .map((preset) => {
              const keyProvider = preset.provider as "openai" | "anthropic";
              const providerStatus = providerStatuses.find((item) => item.provider === keyProvider);
              return (
                <article className="provider-key-card" key={keyProvider}>
                  <div>
                    <strong>{preset.label}</strong>
                    <span>{providerStatus?.detail ?? "Provider readiness not checked yet."}</span>
                  </div>
                  <label>
                    <span>{preset.label} API key</span>
                    <input
                      aria-label={`${preset.label} API key`}
                      type="password"
                      value={providerKeys[keyProvider]}
                      onChange={(event) => {
                        setProviderKeys((current) => ({ ...current, [keyProvider]: event.target.value }));
                        setProviderKeyStatus((current) => ({ ...current, [keyProvider]: "" }));
                      }}
                      placeholder={keyProvider === "openai" ? "sk-..." : "sk-ant-..."}
                    />
                  </label>
                  <div className="settings-actions compact">
                    <button type="button" onClick={() => void saveProviderKey(keyProvider)}>
                      <KeyRound size={18} /> Save key
                    </button>
                    <button type="button" onClick={() => applyProviderPreset(preset.provider, preset.model)}>
                      <CheckCircle2 size={18} /> Select {preset.label}
                    </button>
                  </div>
                  {(providerKeyStatus[keyProvider] || providerStatus?.key_source) && (
                    <small className={providerStatus?.configured ? "provider-ready" : "provider-missing"}>
                      {providerKeyStatus[keyProvider] || `Source: ${providerStatus?.key_source}`}
                    </small>
                  )}
                </article>
              );
            })}
        </div>
      </section>

      <section className="panel utility-card">
        <UtilityTitle icon={<Settings size={18} />} title="Environment Values" meta="Build defaults and saved runtime values" />
        <div className="utility-table settings-table" role="table" aria-label="Environment settings">
          {[
            ["Runtime API base", settings.apiBase, "Current local browser value used by API calls."],
            ["Runtime ingestion key", settings.ingestionKey ? "configured for session" : "session only / not set", "Current in-memory value for DLQ admin calls."],
            ["Runtime provider", settings.defaultProvider, "Current saved server chat default provider."],
            ["Runtime model", settings.defaultModel, "Current saved server chat default model."],
            ...envRows,
          ].map(([name, value, detail]) => (
            <div className="utility-table-row" role="row" key={name}>
              <code>{name}</code>
              <strong>{value}</strong>
              <span>{detail}</span>
            </div>
          ))}
        </div>
      </section>

      <div className="utility-grid">
        <section className="panel utility-card">
          <UtilityTitle icon={<FileText size={18} />} title="Frontend .env.local" meta="Copy into frontend" />
          <p>Use this when the UI needs to point at a non-default backend or send DLQ admin auth.</p>
          <CodeBlock id="frontend-env" value={frontendEnvSnippet(draft)} copied={copied["frontend-env"]} onCopy={copy} />
        </section>

        <section className="panel utility-card">
          <UtilityTitle icon={<FileJson size={18} />} title="Backend .env" meta="Local defaults" />
          <p>Use mock provider for deterministic demos. Add real provider keys only when needed.</p>
          <CodeBlock id="backend-env" value={backendEnvSnippet(draft)} copied={copied["backend-env"]} onCopy={copy} />
        </section>
      </div>

      <section className="panel utility-card">
        <UtilityTitle icon={<KeyRound size={18} />} title="Provider Setup" meta="Operational notes" />
        <div className="provider-setup-grid">
          {providerPresets.map((preset) => {
            const active = draft.defaultProvider === preset.provider && draft.defaultModel === preset.model;
            const providerStatus = providerStatuses.find((item) => item.provider === preset.provider);
            return (
              <article className={active ? "active" : ""} key={preset.provider}>
                <strong>{preset.label}</strong>
                <span>{preset.description}</span>
                <code>{preset.model}</code>
                <small className={providerStatus?.configured ? "provider-ready" : "provider-missing"}>
                  {providerStatus?.detail ?? "Provider readiness not checked yet."}
                </small>
                <button onClick={() => applyProviderPreset(preset.provider, preset.model)} disabled={active}>
                  <CheckCircle2 size={18} /> {active ? "Selected" : `Use ${preset.label}`}
                </button>
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}
