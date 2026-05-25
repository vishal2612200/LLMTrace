# LLMTrace

Fullstack LLM inference logging and ingestion system for the engineering assignment.

## What It Does

- React chatbot with multi-turn context, streaming responses, cancel, list, and resume.
- FastAPI backend with a lightweight LLM wrapper around provider calls.
- Near-real-time inference ingestion through Redis Streams and a worker.
- Optional ingestion API key and in-memory rate limiting for log ingestion.
- Sensitive-data redaction before logs, queues, analytics, traces, or database writes.
- Postgres storage for conversations, messages, inference requests, redacted event payloads, and redaction audit metadata.
- Dashboard for request volume, latency, errors, token usage, and provider/model breakdown.
- Docker Compose setup plus self-hosted Kubernetes manifests.

## Quick Start

```bash
cp .env.example .env
docker compose up --build
```

Open:

- Frontend: http://localhost:5173
- Backend health: http://localhost:8000/health
- OpenAPI: http://localhost:8000/docs

The mock provider is the default, so no API key is required. To use real providers, set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` and select the matching provider/model in the UI.

The backend SDK wrapper posts inference events to `SDK_INGESTION_URL` by default and falls back to the internal publisher if the endpoint is unavailable during local development.

## Local Development

Backend:

```bash
cd backend
python3.12 -m venv .venv
. .venv/bin/activate
pip install -e '.[dev]'
alembic upgrade head
uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

| Variable | Default/example | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://llmtrace:llmtrace@postgres:5432/llmtrace` | SQLAlchemy database URL. Local app defaults to SQLite if unset. |
| `REDIS_URL` | `redis://redis:6379/0` | Redis Streams connection for ingestion events and DLQ. |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Allowed frontend origins. |
| `DEFAULT_PROVIDER` | `mock` | Provider used when the request does not specify one. |
| `DEFAULT_MODEL` | `mock-fast` | Model used when the request does not specify one. |
| `CONTEXT_WINDOW_MESSAGES` | `8` | Number of recent redacted messages used for chat context. |
| `PREVIEW_CHARS` | `500` | Max stored preview length after redaction. |
| `SDK_INGESTION_URL` | `http://127.0.0.1:8000/api/ingest/logs` | HTTP endpoint used by the wrapper to emit lifecycle events. |
| `INGESTION_API_KEY` | `dev-ingestion-key` | Optional shared key required by ingestion and DLQ endpoints. |
| `INGESTION_RATE_LIMIT_PER_MINUTE` | `120` | In-memory per-process ingestion limit. |
| `OPENAI_API_KEY` | empty | Enables the OpenAI provider adapter. |
| `ANTHROPIC_API_KEY` | empty | Enables the Anthropic provider adapter. |
| `INGESTION_STREAM` | `llmtrace:events` | Redis Stream name for accepted events. |
| `DLQ_STREAM` | `llmtrace:dlq` | Redis Stream name for failed worker events. |
| `WORKER_GROUP` | `llmtrace-workers` | Redis consumer group name. |
| `INLINE_INGESTION_FALLBACK` | `true` | Allows local fallback normalization if Redis publishing fails. |
| `VITE_API_BASE` | `http://localhost:8000` | Frontend API base URL. |
| `VITE_INGESTION_API_KEY` | `dev-ingestion-key` | Frontend key for local DLQ admin actions. |

## API Surface

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Backend health check. |
| `POST` | `/api/chat/stream` | SSE chat stream. Body: `message`, optional `conversation_id`, `provider`, `model`. |
| `POST` | `/api/chat/{conversation_id}/cancel` | Cancels an active conversation/request. |
| `GET` | `/api/conversations` | Lists conversation summaries. |
| `GET` | `/api/conversations/{conversation_id}` | Returns messages and related inference logs. |
| `POST` | `/api/ingest/logs` | Receives SDK lifecycle events after validation/redaction. |
| `GET` | `/api/ingest/dlq` | Lists recent DLQ entries for local admin/debug use. |
| `POST` | `/api/ingest/dlq/{message_id}/replay` | Replays a DLQ event by Redis message id. |
| `GET` | `/api/metrics/summary` | Totals, p50/p95 latency, errors, and tokens. |
| `GET` | `/api/metrics/timeseries` | Request/error/latency series for charts. |
| `GET` | `/api/metrics/providers` | Provider and model breakdown. |

When `INGESTION_API_KEY` is set, ingestion and DLQ endpoints require `x-ingestion-key`.

## Verification

```bash
cd backend && . .venv/bin/activate && pytest -q
cd frontend && npm test -- --run
cd frontend && npm run build
docker compose config
./scripts/docker-smoke.sh
```

The Docker smoke script validates one-command startup, `/health`, SSE chat streaming, redacted email/API-key output, conversation storage, worker ingestion, and metrics updates. It tears down containers and volumes when done.

For browser-level smoke testing, start the backend on `127.0.0.1:8000` and frontend on `127.0.0.1:5173`, then run:

```bash
cd frontend
npm run test:e2e
```

To capture demo screenshots after local services are running:

```bash
./scripts/capture-demo.sh
```

Screenshots are written to `/tmp/llmtrace-chat.png` and `/tmp/llmtrace-dashboard.png`.

## Architecture

```text
React UI
  -> FastAPI chat API
  -> LLM wrapper/provider adapter
  -> sensitive-data redaction
  -> ingestion API / event publisher
  -> Redis Streams
  -> ingestion worker
  -> Postgres
  -> metrics APIs / dashboard
```

## Sensitive-Data Policy

Raw full prompt/response content is not persisted by default. The system stores:

- redacted preview
- SHA-256 content hash
- redaction metadata counts
- operational metadata such as provider, model, status, latency, tokens, timestamps

The redaction pass covers common PII and secrets: email, phone, SSN, bearer tokens, JWTs, OpenAI/AWS/GitHub/Stripe-like keys, private keys, cookies, session tokens, and webhook secrets.

Conversation context is rebuilt from redacted previews by design. This keeps multi-turn chat functional for the assignment while preventing raw sensitive text from being reloaded from storage.

The React UI also redacts common sensitive patterns in optimistic messages before streaming completes. Backend redaction remains the source of truth for all persisted data.

## Assignment Checklist

- Chatbot with multi-turn context: yes.
- Simple UI: yes.
- LLM SDK/wrapper: yes.
- Near-real-time ingestion endpoint: yes.
- SDK-to-ingestion HTTP path: yes, with internal fallback.
- Ingestion auth/rate limit: yes, configurable.
- Database storage for chat messages, inference logs, extracted metadata: yes.
- Dashboards for latency, throughput, errors, tokens: yes.
- Multi-provider support: mock, OpenAI, Anthropic.
- Streaming responses: SSE.
- Docker Compose one-command setup: yes.
- Event-based architecture: Redis Streams + worker.
- Sensitive-data redaction: yes.
- Self-hosted k8s artifact: manifests in `deploy/k8s`.
- Conversation cancel/list/resume: yes.
- DLQ API/dashboard replay: yes.

## Documentation

- [Architecture](docs/architecture.md)
- [Architecture decisions](docs/decisions.md)
- [Schema](docs/schema.md)
- [Kubernetes notes](deploy/k8s/README.md)

## Tradeoffs

This implementation optimizes for correctness, debuggability, and clear replacement boundaries. Redis Streams can become Kafka/NATS, Postgres analytics can move to ClickHouse/Timescale, and in-app provider adapters can become a versioned SDK once the interface stabilizes.

## Known Limitations

- Real OpenAI/Anthropic tests require provider API keys and are skipped by default.
- Ingestion auth is a demo shared key, not tenant/project-scoped production auth.
- Rate limiting is in-memory per backend process.
- Kubernetes manifests are deployable artifacts, not proof of a live cluster rollout.
- Dashboards are eventually consistent because ingestion normalization is asynchronous.
- Conversation context uses redacted previews, so recall is safer but less faithful than raw-content retention.

## Improve With More Time

- Extract ingestion SDK into versioned Python/npm packages.
- Replace demo ingestion key with tenant/project scoped auth, RBAC, and distributed rate limits.
- Add OpenTelemetry tracing across chat, provider, ingestion, worker, and analytics writes.
- Add richer worker backpressure controls.
- Add cost tracking by provider, model, token, and project.
- Add retention policies, GDPR deletion, encrypted raw-content vault, and semantic sensitive-data detection.
- Add load tests, latency regression tests, failure injection, and production Kubernetes rollout strategy.
