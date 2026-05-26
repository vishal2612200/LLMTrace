# Schema

Raw prompts/responses are not stored by default. Message and inference payload storage uses redacted previews, full redacted content, SHA-256 hashes, redaction counts, context checkpoints, and operational metadata.

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
| `rolling_summary` | `Text` | Redacted summary of older turns outside the current token budget. |
| `structured_memory` | `JSON` | Extracted redacted memory buckets: preferences, task state, decisions, and open TODOs. |

Indexes: `ix_conversations_status`, `ix_conversations_updated_at`.

## `messages`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String(64)` | Primary key. |
| `conversation_id` | `String(64)` | FK to `conversations.id`. |
| `role` | `String(32)` | `user`, `assistant`, or `system`. |
| `preview` | `Text` | Redacted content preview only. |
| `redacted_content` | `Text` | Full redacted content used by the context builder. |
| `content_hash` | `String(64)` | SHA-256 of original content for correlation/dedup. |
| `token_count` | `Integer` | Lightweight token estimate. |
| `redaction_metadata` | `JSON` | Counts by redaction type. |
| `created_at` | `DateTime` | UTC timestamp. |

Indexes: `ix_messages_conversation_id`.

## `conversation_checkpoints`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String(64)` | Primary key. |
| `conversation_id` | `String(64)` | FK to `conversations.id`. |
| `sequence` | `Integer` | Monotonic checkpoint number per conversation. |
| `reason` | `String(64)` | `pre_model`, `turn_complete`, `failed`, or `cancelled`. |
| `summary` | `Text` | Redacted checkpoint summary with message/token counts and latest-turn notes. |
| `context_messages` | `JSON` | Exact redacted context array sent to the model for `pre_model`, or recent redacted context for terminal checkpoints. |
| `message_count` | `Integer` | Messages present when the checkpoint was created. |
| `token_count` | `Integer` | Estimated total message tokens at checkpoint time. |
| `created_at` | `DateTime` | UTC timestamp. |

Constraints/indexes: unique `uq_conversation_checkpoint_sequence`, `ix_conversation_checkpoints_conversation_id`, `ix_conversation_checkpoints_created_at`, `ix_conversation_checkpoints_reason`.

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

## `runtime_settings`

| Column | Type | Notes |
| --- | --- | --- |
| `key` | `String(64)` | Primary key, currently `app`. |
| `value_json` | `JSON` | Server-backed runtime defaults: provider, model, context message limit, context token budget, and preview length. |
| `updated_at` | `DateTime` | UTC timestamp. |

## `agent_runs`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String(64)` | Primary key. |
| `name` | `String(200)` | Redacted run name. |
| `task` | `Text` | Redacted task preview/text. |
| `status` | `String(32)` | `started`, `completed`, `failed`, `cancelled`, or `blocked_pending_approval`. |
| `failure_category` | `String(64)` | `context_failure`, `tool_failure`, `planning_failure`, `reasoning_failure`, `verification_failure`, `permission_failure`, `format_failure`, `model_failure`, or `none`. |
| `started_at` | `DateTime` | UTC timestamp. |
| `ended_at` | `DateTime nullable` | Set on terminal run status. |
| `latency_ms` | `Integer nullable` | Computed when the run ends. |
| `created_at` | `DateTime` | UTC timestamp. |
| `context_summary` | `Text nullable` | Redacted summary of selected context. |
| `selected_context` | `JSON` | Redacted context metadata such as files, traces, or issue ids. |
| `final_action` | `Text nullable` | Redacted final action summary. |
| `human_override` | `Boolean` | Whether a human overrode the run result. |

Indexes: `ix_agent_runs_status`, `ix_agent_runs_failure_category`, `ix_agent_runs_started_at`.

## `tool_calls`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String(64)` | Primary key. |
| `agent_run_id` | `String(64)` | FK to `agent_runs.id`. |
| `tool_name` | `String(120)` | Selected typed tool name. |
| `tool_input_json` | `JSON` | Redacted tool input. |
| `tool_output_preview` | `Text nullable` | Redacted output preview only. |
| `status` | `String(32)` | `started`, `completed`, `failed`, or `cancelled`. |
| `latency_ms` | `Integer nullable` | Tool latency when known. |
| `retry_count` | `Integer` | Retry attempts for the tool call. |
| `risk_level` | `String(32)` | `low`, `medium`, or `high`. |
| `error_message` | `Text nullable` | Redacted error message. |
| `created_at` | `DateTime` | UTC timestamp. |

Indexes: `ix_tool_calls_agent_run_id`, `ix_tool_calls_tool_name`, `ix_tool_calls_status`, `ix_tool_calls_risk_level`.

## `verification_results`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String(64)` | Primary key. |
| `agent_run_id` | `String(64)` | FK to `agent_runs.id`. |
| `check_type` | `String(64)` | Example: `tests`, `lint`, `typecheck`, `forbidden_file_check`, `schema_validation`, or `golden_output`. |
| `command` | `Text nullable` | Redacted command or check identifier. |
| `status` | `String(32)` | `passed`, `failed`, or `skipped`. |
| `expected_files` | `JSON` | Files expected to change or be inspected. |
| `forbidden_files` | `JSON` | Files or paths that must not be touched. |
| `result_summary` | `Text nullable` | Redacted verification output summary. |
| `created_at` | `DateTime` | UTC timestamp. |

Indexes: `ix_verification_results_agent_run_id`, `ix_verification_results_check_type`, `ix_verification_results_status`.

## `human_approvals`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String(64)` | Primary key. |
| `agent_run_id` | `String(64)` | FK to `agent_runs.id`. |
| `tool_call_id` | `String(64) nullable` | FK to the tool call that requires approval. |
| `risk_level` | `String(32)` | Approval risk level, usually `high`. |
| `action` | `Text` | Action requiring approval. |
| `status` | `String(32)` | `pending`, `approved`, or `rejected`. |
| `approver` | `String(120) nullable` | Human approver identifier. |
| `decision_reason` | `Text nullable` | Redacted decision reason. |
| `created_at` | `DateTime` | UTC timestamp. |
| `decided_at` | `DateTime nullable` | Set when approved or rejected. |

Indexes: `ix_human_approvals_agent_run_id`, `ix_human_approvals_tool_call_id`, `ix_human_approvals_risk_level`, `ix_human_approvals_status`.

## `eval_cases`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String(64)` | Primary key. |
| `name` | `String(200)` | Eval case name. |
| `category` | `String(120)` | Eval category, such as `coding-agent`. |
| `task` | `Text` | User task for the eval. |
| `expected_behavior` | `Text` | Target behavior. |
| `expected_files` | `JSON` | Files expected to be used or changed. |
| `forbidden_files` | `JSON` | Files or paths that must not be touched. |
| `success_checks` | `JSON` | Deterministic checks for the eval. |
| `created_at` | `DateTime` | UTC timestamp. |

Constraints/indexes: unique `uq_eval_cases_name_category`, `ix_eval_cases_category`.

## `eval_runs`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `String(64)` | Primary key. |
| `eval_case_id` | `String(64)` | FK to `eval_cases.id`. |
| `agent_run_id` | `String(64) nullable` | Optional FK to `agent_runs.id`. |
| `status` | `String(32)` | Eval run status. |
| `score` | `Integer nullable` | Optional numeric score. |
| `failure_category` | `String(64)` | Same taxonomy used by agent runs. |
| `result_summary` | `Text nullable` | Redacted result summary. |
| `created_at` | `DateTime` | UTC timestamp. |

Indexes: `ix_eval_runs_eval_case_id`, `ix_eval_runs_agent_run_id`, `ix_eval_runs_status`, `ix_eval_runs_failure_category`.

## Retention Path

Raw prompts and responses are intentionally absent from the default schema. The default context path uses full redacted content plus checkpoints so resume remains useful without raw retention. If raw retention is required later, add a separate encrypted vault table with short TTL, strict RBAC, audit logging, and deletion support instead of mixing raw content into operational tables.

The harness schema follows the same default: tool inputs, tool outputs, verification summaries, selected context, and approval reasons are redacted before persistence. The schema records enough control telemetry to debug agent behavior without storing raw secrets or full sensitive payloads.
