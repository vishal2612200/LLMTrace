# Schema

Raw full prompts/responses are not stored by default. Message and inference payload storage uses redacted previews, SHA-256 hashes, redaction counts, and operational metadata.

## `conversations`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String(64)` | Primary key. |
| `title` | `String(200)` | Redacted preview from the first user message. |
| `status` | `String(32)` | `active`, `completed`, `cancelled`, or `failed`. |
| `provider` | `String(64)` | Last selected provider for the conversation. |
| `model` | `String(128)` | Last selected model for the conversation. |
| `created_at` | `DateTime` | UTC timestamp. |
| `updated_at` | `DateTime` | UTC timestamp, updated on changes. |
| `cancelled_at` | `DateTime nullable` | Set when cancellation is requested. |

Indexes: `ix_conversations_status`, `ix_conversations_updated_at`.

## `messages`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String(64)` | Primary key. |
| `conversation_id` | `String(64)` | FK to `conversations.id`. |
| `role` | `String(32)` | `user`, `assistant`, or `system`. |
| `preview` | `Text` | Redacted content preview only. |
| `content_hash` | `String(64)` | SHA-256 of original content for correlation/dedup. |
| `token_count` | `Integer` | Lightweight token estimate. |
| `redaction_metadata` | `JSON` | Counts by redaction type. |
| `created_at` | `DateTime` | UTC timestamp. |

Indexes: `ix_messages_conversation_id`.

## `inference_requests`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String(64)` | Request id from the SDK wrapper. |
| `conversation_id` | `String(64)` | FK to `conversations.id`. |
| `provider` | `String(64)` | Provider name. |
| `model` | `String(128)` | Model name. |
| `status` | `String(32)` | `started`, `completed`, `failed`, or `cancelled`. |
| `started_at` | `DateTime nullable` | Request start timestamp. |
| `ended_at` | `DateTime nullable` | Terminal timestamp. |
| `latency_ms` | `Integer nullable` | End-to-end model latency. |
| `prompt_tokens` | `Integer nullable` | Prompt token count when known. |
| `completion_tokens` | `Integer nullable` | Completion token count when known. |
| `total_tokens` | `Integer nullable` | Total token count when known. |
| `error_type` | `String(120) nullable` | Error class/type for failed requests. |
| `error_message` | `Text nullable` | Redacted error message. |
| `created_at` | `DateTime` | UTC timestamp. |

Indexes: `ix_inference_requests_conversation_id`, `ix_inference_requests_model`, `ix_inference_requests_provider`, `ix_inference_requests_started_at`, `ix_inference_requests_status`, `ix_inference_provider_model`.

## `inference_events`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String(64)` | Primary key. |
| `event_id` | `String(96)` | Unique SDK event id for idempotency. |
| `request_id` | `String(64)` | Request id shared by lifecycle events. |
| `conversation_id` | `String(64)` | Conversation/session id. |
| `event_type` | `String(64)` | `request_started`, `token_chunk`, `request_completed`, `request_failed`, or `request_cancelled`. |
| `payload_json` | `JSON` | Redacted validated event payload. |
| `created_at` | `DateTime` | UTC timestamp. |

Constraints/indexes: unique `uq_inference_events_event_id`, `ix_inference_events_conversation_id`, `ix_inference_events_event_type`, `ix_inference_events_request_id`.

## `redaction_audit`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String(64)` | Primary key. |
| `source_type` | `String(64)` | Example: `message` or `ingestion_event`. |
| `source_id` | `String(96)` | Related message/event id. |
| `redaction_counts` | `JSON` | Counts by type. Original sensitive values are never stored. |
| `created_at` | `DateTime` | UTC timestamp. |

Indexes: `ix_redaction_audit_source_id`, `ix_redaction_audit_source_type`.

## Retention Path

Raw prompts and responses are intentionally absent from the default schema. If raw retention is required later, add a separate encrypted vault table with short TTL, strict RBAC, audit logging, and deletion support instead of mixing raw content into operational tables.
