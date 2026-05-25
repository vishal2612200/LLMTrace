# Architecture Decisions

## FastAPI + React Split

Decision: use separate FastAPI backend and React frontend.

Why chosen now: clean API/frontend boundary, independently testable ingestion logic, and OpenAPI docs from FastAPI.

Tradeoff: more boilerplate than a single Next.js app.

What breaks at scale: frontend/backend contracts can drift.

Upgrade path: generate typed API clients from OpenAPI and add schema versioning discipline.

## Redis Streams Event Bus

Decision: use Redis Streams for async ingestion.

Why chosen now: lightweight, easy to run locally, supports consumer groups, and is enough for assignment-grade event architecture.

Tradeoff: weaker than Kafka/NATS for long retention, partitioning, replay tooling, and fanout.

What breaks at scale: high-throughput analytics may outgrow Redis retention and ops model.

Upgrade path: keep an event bus interface and swap Redis for Kafka/NATS later.

## Sync Ack + Async Worker

Decision: ingestion validates/redacts/publishes quickly; worker normalizes later.

Why chosen now: low request latency, isolated heavy processing, and responsive chat path.

Tradeoff: dashboards are eventually consistent and retry/idempotency handling matters.

What breaks at scale: duplicate events or worker failures can skew metrics.

Upgrade path: add idempotency keys, retry policy, DLQ replay UI, and backpressure controls.

## SDK-to-Ingestion HTTP Path

Decision: the wrapper posts events to `POST /api/ingest/logs` and falls back to the internal publisher when local endpoint delivery fails.

Why chosen now: it matches the assignment wording while keeping local demos resilient.

Tradeoff: self-HTTP inside the backend is less efficient than a direct in-process call.

What breaks at scale: high event volume should avoid loopback HTTP overhead and use a dedicated SDK/client package.

Upgrade path: extract a versioned SDK with batching, retry policy, backoff, and signed project keys.

## Lightweight Ingestion Auth and Rate Limit

Decision: protect ingestion endpoints with optional `x-ingestion-key` and in-memory rate limiting.

Why chosen now: demonstrates production awareness without adding auth infrastructure.

Tradeoff: in-memory limits are per-process and reset on restart.

What breaks at scale: multiple backend replicas need a shared limiter and scoped tenant/project credentials.

Upgrade path: Redis-backed rate limits, hashed API keys, project-scoped tokens, RBAC, and audit logs.

## Postgres Analytics Store

Decision: use Postgres for conversations, logs, and first analytics layer.

Why chosen now: lower operational complexity, easy debugging, and enough for assignment volume.

Tradeoff: high-volume time-series queries may need optimization.

What breaks at scale: dashboard queries can slow as event volume grows.

Upgrade path: add indexes, partitioning, materialized views, then TimescaleDB or ClickHouse.

## Regex Sensitive-Data Redaction

Decision: deterministic regex redaction as first protection layer.

Why chosen now: fast, transparent, easy to test, and predictable.

Tradeoff: misses semantic/contextual sensitive data and may false-positive.

What breaks at scale: regulated use needs stronger detection and governance.

Upgrade path: add Presidio/classifier detection, configurable policies, and encrypted raw vault controls.

## In-App Provider Adapters

Decision: keep provider adapters inside backend for v1.

Why chosen now: assignment stays scoped and provider interface can evolve quickly.

Tradeoff: less reusable across services.

What breaks at scale: multiple apps would duplicate provider logic.

Upgrade path: extract a versioned Python/npm SDK after interface stabilizes.

## SSE Streaming

Decision: use SSE for assistant token stream.

Why chosen now: simple browser support and fits one-way LLM token streaming.

Tradeoff: not ideal for bidirectional realtime workflows.

What breaks at scale: collaborative or client-driven realtime controls may need a bidirectional channel.

Upgrade path: add WebSockets when product requirements justify it.

## Mock Provider Default

Decision: default local demo uses mock provider.

Why chosen now: deterministic, cheap, reliable, and no external API key required.

Tradeoff: real provider latency, errors, rate limits, and token accounting need integration validation.

What breaks at scale: mock can hide provider-specific edge cases.

Upgrade path: add real-provider contract tests, failure simulation, and rate-limit tests.

## Kubernetes Manifests

Decision: include k8s manifests as deploy artifact.

Why chosen now: shows deployment thinking and satisfies bonus without overbuilding infra.

Tradeoff: manifests alone are not full production ops.

What breaks at scale: production needs secrets, autoscaling, ingress TLS, monitoring, and rollout strategy.

Upgrade path: Helm/Kustomize, HPA, external secrets, ingress TLS, Grafana dashboards, alerts, and runbooks.

## Harness Observability as Additive Layer

Decision: add agent run, tool-call, verification, approval, failure-taxonomy, and eval-case telemetry beside inference logging rather than replacing it.

Why chosen now: inference observability and harness observability answer different questions. Inference logs show provider/model/latency/token/status behavior for LLM calls. Harness logs show the control loop around agent work: selected context, chosen tools, deterministic checks, approval gates, final action, and failure category. Keeping them separate preserves the existing assignment requirements while demonstrating production agent-harness thinking.

Tradeoff: the implementation records harness activity but does not yet execute tools, enforce external permissions, or run evals automatically.

What breaks at scale: without an execution engine, policy service, and eval runner, approval state is advisory telemetry rather than a hard runtime gate.

Upgrade path: connect typed permissioned tools, an approval enforcement layer, automated verification runners, eval-run orchestration, and trace correlation between inference requests and agent runs.
