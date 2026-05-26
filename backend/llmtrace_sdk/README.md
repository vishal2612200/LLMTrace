# LLMTrace Python SDK

Small Python client for emitting LLM lifecycle events to LLMTrace ingestion.

```python
from llmtrace_sdk import LLMTraceClient

async with LLMTraceClient(
    ingestion_url="http://127.0.0.1:8000/api/ingest/logs",
    api_key="dev-ingestion-key",
) as trace:
    await trace.request_started(
        event_id="evt_12345678",
        request_id="req_12345678",
        conversation_id="conv_12345678",
        provider="openai",
        model="gpt-4.1-mini",
        prompt_tokens=120,
        input_preview="User asked a redacted question",
    )
```

Environment variables:

| Variable | Purpose |
| --- | --- |
| `LLMTRACE_INGESTION_URL` | Ingestion endpoint. Falls back to `SDK_INGESTION_URL`. |
| `LLMTRACE_API_KEY` | Ingestion key. Falls back to `INGESTION_API_KEY`. |
| `LLMTRACE_TIMEOUT_SECONDS` | HTTP timeout, default `2.0`. |

The SDK exposes the event contract in `IngestionEvent` and convenience helpers for:

- `request_started`
- `token_chunk`
- `request_completed`
- `request_failed`
- `request_cancelled`

The backend imports this package directly, so the submitted app uses the same public SDK contract that external Python callers would use.
