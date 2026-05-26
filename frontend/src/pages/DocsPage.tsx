import React from "react";
import {
  BookOpen,
  CheckCircle2,
  Clipboard,
  Database,
  ExternalLink,
  FileJson,
  GitBranch,
  Radio,
  ShieldCheck,
  Terminal,
} from "lucide-react";

import { useRuntimeSettings } from "../hooks/useRuntimeSettings";
import { CodeBlock, CopyState, copyTextToClipboard, UtilityTitle } from "./UtilityComponents";

const apiRows = [
  ["GET", "/health", "Backend health check used by Settings and smoke checks."],
  ["POST", "/api/chat/stream", "Creates or resumes a conversation, stores user/assistant messages, and streams the reply over SSE."],
  ["POST", "/api/chat/{conversation_id}/cancel", "Marks an active conversation as cancelled and stops the stream on the next cancellation check."],
  ["GET", "/api/conversations", "Conversation history with provider, model, status, and timestamps."],
  ["GET", "/api/conversations/{conversation_id}", "Conversation detail with redacted messages, rolling summary, structured memory, checkpoints, and inference logs."],
  ["POST", "/api/ingest/logs", "SDK log ingestion endpoint: validates payloads, redacts sensitive fields, persists events, and queues normalization."],
  ["GET", "/api/ingest/dlq", "Dead-letter queue entries for failed worker normalization."],
  ["POST", "/api/ingest/dlq/{message_id}/replay", "Replays a dead-letter queue event by Redis message id."],
  ["GET", "/api/metrics/summary", "Request, token, latency, error, and recent failure summary."],
  ["GET", "/api/metrics/timeseries", "Request, error, and p95 latency buckets for the dashboard."],
  ["GET", "/api/metrics/providers", "Provider/model request, error, and token breakdown."],
  ["GET", "/api/harness/runs", "Agent run, tool, verification, approval, and failure telemetry."],
  ["POST", "/api/harness/runs", "Creates an agent run with task and selected context."],
  ["PATCH", "/api/harness/runs/{run_id}", "Completes, fails, or cancels an agent run and records final action metadata."],
  ["GET", "/api/harness/runs/{run_id}", "Run detail with tool calls, verification results, approvals, and eval runs."],
  ["POST", "/api/harness/runs/{run_id}/tool-calls", "Stores redacted tool telemetry and creates pending approvals for high-risk actions."],
  ["POST", "/api/harness/runs/{run_id}/verification-results", "Stores deterministic verification outputs such as tests, lint, and eval checks."],
  ["POST", "/api/harness/approvals/{approval_id}/decision", "Records approval/rejection decisions and runs registered dry-run tool handlers after approval."],
  ["GET", "/api/harness/metrics/summary", "Harness pass rate, failure taxonomy, approval counts, and tool latency summary."],
  ["POST", "/api/harness/smoke", "Creates an executable backend-safe smoke run with provider readiness, verification, and a high-risk approval gate."],
  ["GET", "/api/harness/evals", "Lists loaded eval cases."],
  ["POST", "/api/harness/evals/load-fixtures", "Loads JSON eval fixtures from evals/ idempotently."],
  ["POST", "/api/harness/evals/{eval_id}/run", "Scores an eval case using expected files, forbidden files, touched files, and declared checks."],
  ["GET", "/api/settings/runtime", "Reads server-backed runtime defaults for provider, model, context message limit, token budget, and preview length."],
  ["PUT", "/api/settings/runtime", "Updates server-backed runtime defaults."],
  ["POST", "/api/settings/runtime/reset", "Resets runtime defaults back to environment configuration."],
  ["GET", "/api/settings/providers/status", "Reports selected provider and backend API-key readiness for OpenAI/Anthropic."],
];

const schemaRows = [
  ["conversations", "Conversation status, provider/model, title, rolling summary, structured memory, cancellation state, and lifecycle timestamps."],
  ["messages", "Per-turn user/assistant records with redacted preview, full redacted context content, hashes, token counts, and redaction metadata."],
  ["conversation_checkpoints", "Durable redacted context snapshots with sequence, reason, exact context messages, message count, and token count."],
  ["inference_requests", "Normalized request metadata: provider, model, status, latency, token counts, and error fields."],
  ["inference_events", "Idempotent processed SDK events after schema validation and redaction."],
  ["redaction_audit", "Counts of sensitive values removed from ingestion payloads."],
  ["runtime_settings", "Server-backed runtime overrides for provider, model, context message limit, token budget, and preview length."],
  ["agent_runs", "Harness-level task, context, failure taxonomy, and final action."],
  ["tool_calls", "Redacted tool input/output, latency, retries, status, and risk."],
  ["verification_results", "Deterministic check outputs with expected and forbidden file metadata."],
  ["human_approvals", "Pending, approved, or rejected high-risk action decisions."],
  ["eval_cases", "JSON-backed eval definitions loaded idempotently from evals/."],
  ["eval_runs", "Eval execution outcomes linked back to agent runs when available."],
];

const coverageRows = [
  [
    "Multi-turn conversations",
    "Yes",
    "Clients pass conversation_id back to /api/chat/stream; the backend resumes that row and appends each new user and assistant turn to messages.",
  ],
  [
    "Short conversational context",
    "Yes",
    "context_messages() uses full redacted_content, CONTEXT_WINDOW_TOKENS, rolling summary, structured memory, and persisted checkpoints before sending model context.",
  ],
  [
    "SDK log ingestion API",
    "Yes",
    "POST /api/ingest/logs receives SDK lifecycle events such as request_started, token_chunk, request_completed, request_failed, and request_cancelled.",
  ],
  [
    "Validate and parse payloads",
    "Yes",
    "FastAPI/Pydantic validates IngestionEvent fields, ids, timestamps, token counts, latency, event_type, provider, and model before accepting the event.",
  ],
  [
    "Extract useful metadata",
    "Yes",
    "The publisher/worker extracts request id, conversation id, provider, model, status, latency, tokens, errors, timestamps, and redaction counts.",
  ],
  [
    "Store processed data",
    "Yes",
    "Processed events are persisted in inference_events, normalized terminal data lands in inference_requests, and redaction counts go to redaction_audit.",
  ],
];

const contextFlow = [
  "New chat stores a conversation row and the first user message as redacted preview plus full redacted content.",
  "Follow-up calls include conversation_id so the same conversation is resumed.",
  "Structured memory extracts preferences, task state, decisions, and open TODOs from redacted user turns.",
  "The context builder adds system prompt, rolling summary, structured memory, and recent redacted turns within CONTEXT_WINDOW_TOKENS.",
  "pre_model checkpoints persist the exact redacted context sent to the model; terminal checkpoints capture turn_complete, failed, or cancelled state.",
];

const ingestionFlow = [
  "SDK emits lifecycle logs to POST /api/ingest/logs.",
  "The API validates the event schema and applies ingestion auth/rate limits.",
  "Payloads are redacted and written idempotently to inference_events.",
  "Events are queued on Redis Streams; fallback can normalize inline.",
  "The worker parses terminal events into inference_requests for dashboard queries.",
];

const dockerCommands = `cp .env.example .env
docker compose up --build`;

const devCommands = `cd backend
python3.12 -m venv .venv
. .venv/bin/activate
pip install -e '.[dev]'
alembic upgrade head
uvicorn app.main:app --reload

cd ../frontend
npm install
npm run dev`;

export function DocsPage() {
  const [copied, setCopied] = React.useState<CopyState>({});
  const settings = useRuntimeSettings();

  async function copy(id: string, value: string) {
    await copyTextToClipboard(value);
    setCopied((state) => ({ ...state, [id]: true }));
    window.setTimeout(() => setCopied((state) => ({ ...state, [id]: false })), 1400);
  }

  return (
    <section className="workspace utility-workspace">
      <header className="toolbar">
        <div>
          <h1>Docs</h1>
          <p>Operational references for running, extending, and debugging LLMTrace without leaving the app.</p>
        </div>
      </header>

      <div className="utility-grid">
        <section className="panel utility-card">
          <UtilityTitle icon={<BookOpen size={18} />} title="Start Here" meta="Local demo" />
          <p>Use Docker Compose for the full stack: React, FastAPI, Redis, Postgres, migrations, and worker.</p>
          <CodeBlock id="docker" value={dockerCommands} copied={copied.docker} onCopy={copy} />
          <div className="utility-link-list">
            <a href={`${settings.apiBase}/health`} target="_blank" rel="noreferrer">
              <CheckCircle2 size={16} /> Backend health <ExternalLink size={14} />
            </a>
            <a href={`${settings.apiBase}/docs`} target="_blank" rel="noreferrer">
              <FileJson size={16} /> OpenAPI docs <ExternalLink size={14} />
            </a>
          </div>
        </section>

        <section className="panel utility-card">
          <UtilityTitle icon={<Terminal size={18} />} title="Developer Loop" meta="Manual services" />
          <p>Run backend and frontend separately when editing code or stepping through failures.</p>
          <CodeBlock id="dev" value={devCommands} copied={copied.dev} onCopy={copy} />
        </section>
      </div>

      <section className="panel utility-card">
        <UtilityTitle icon={<CheckCircle2 size={18} />} title="Requirement Coverage" meta="Direct answer" />
        <div className="coverage-grid">
          {coverageRows.map(([requirement, status, detail]) => (
            <article className="coverage-card" key={requirement}>
              <div>
                <strong>{requirement}</strong>
                <span>{status}</span>
              </div>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="utility-grid">
        <section className="panel utility-card">
          <UtilityTitle icon={<GitBranch size={18} />} title="Conversation Flow" meta="Multi-turn context" />
          <ol className="flow-list">
            {contextFlow.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>

        <section className="panel utility-card">
          <UtilityTitle icon={<Database size={18} />} title="Ingestion Flow" meta="SDK logs to database" />
          <ol className="flow-list">
            {ingestionFlow.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </section>
      </div>

      <section className="panel utility-card">
        <UtilityTitle icon={<Radio size={18} />} title="API Map" meta={`${apiRows.length} primary routes`} />
        <div className="utility-table" role="table" aria-label="API map">
          {apiRows.map(([method, path, detail]) => (
            <div className="utility-table-row" role="row" key={path}>
              <span className="method-pill">{method}</span>
              <code>{path}</code>
              <span>{detail}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel utility-card">
        <UtilityTitle icon={<Database size={18} />} title="Data Model" meta="Redacted by default" />
        <div className="schema-grid">
          {schemaRows.map(([name, detail]) => (
            <article className="schema-card" key={name}>
              <strong>{name}</strong>
              <span>{detail}</span>
            </article>
          ))}
        </div>
      </section>

      <div className="utility-grid">
        <section className="panel utility-card">
          <UtilityTitle icon={<ShieldCheck size={18} />} title="Sensitive Data Policy" meta="Storage rule" />
          <ul className="check-list">
            <li>Raw prompts and responses are not stored by default.</li>
            <li>Messages persist redacted previews for UI and full redacted content for context rebuilding.</li>
            <li>Conversation checkpoints persist the exact redacted model context for audit/debug inspection.</li>
            <li>Hashes, token estimates, redaction counts, rolling summary, and structured memory are stored without raw sensitive values.</li>
            <li>Ingestion events are validated and redacted before queues, logs, metrics, or database writes.</li>
            <li>Raw retention belongs in a separate encrypted vault with TTL, RBAC, and audit logs.</li>
          </ul>
        </section>

        <section className="panel utility-card">
          <UtilityTitle icon={<Clipboard size={18} />} title="Release Checklist" meta="Before demo" />
          <ul className="check-list">
            <li>
              Run frontend tests and typecheck with <code>npm test</code> and <code>npm run build</code>.
            </li>
            <li>
              Run backend tests with <code>pytest -q</code>.
            </li>
            <li>
              Smoke Docker with <code>./scripts/docker-smoke.sh</code>.
            </li>
            <li>Load harness fixtures, send a chat, confirm dashboard metrics update, and replay DLQ if present.</li>
          </ul>
        </section>
      </div>
    </section>
  );
}
