#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

cleanup() {
  docker compose down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker compose up -d --build

for _ in {1..60}; do
  if curl -fsS http://127.0.0.1:8000/health >/dev/null; then
    break
  fi
  sleep 2
done

curl -fsS http://127.0.0.1:8000/health >/dev/null

curl -fsS -N \
  -X POST http://127.0.0.1:8000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"Docker smoke with docker@example.com and Bearer sk-docker12345678901234567890"}' \
  >/tmp/llmtrace-docker-chat.sse

grep -q '"chunk": "Mock "' /tmp/llmtrace-docker-chat.sse
grep -q "\\[EMAIL_REDACTED\\]" /tmp/llmtrace-docker-chat.sse
grep -q "\\[API_KEY_REDACTED\\]" /tmp/llmtrace-docker-chat.sse

for _ in {1..20}; do
  metrics="$(curl -fsS http://127.0.0.1:8000/api/metrics/summary)"
  if echo "$metrics" | grep -q '"total_requests":[1-9]'; then
    break
  fi
  sleep 1
done

curl -fsS http://127.0.0.1:8000/api/conversations | grep -q "\\[EMAIL_REDACTED\\]"
curl -fsS http://127.0.0.1:8000/api/metrics/summary | grep -q '"total_requests"'

harness_run="$(
  curl -fsS \
    -X POST http://127.0.0.1:8000/api/harness/runs \
    -H "Content-Type: application/json" \
    -d '{"name":"Docker harness run","task":"Verify approval gate","selected_context":{"files":["backend/app/api/harness.py"]}}'
)"
run_id="$(python -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$harness_run")"

curl -fsS \
  -X POST "http://127.0.0.1:8000/api/harness/runs/${run_id}/tool-calls" \
  -H "Content-Type: application/json" \
  -d '{"tool_name":"run_database_migration","tool_input_json":{"token":"Bearer sk-dockerharness12345678901234567890"},"tool_output":"Approval requested from ops@example.com","status":"started","risk_level":"high","latency_ms":42}' \
  >/tmp/llmtrace-harness-tool.json

curl -fsS \
  -X POST "http://127.0.0.1:8000/api/harness/runs/${run_id}/verification-results" \
  -H "Content-Type: application/json" \
  -d '{"check_type":"tests","command":"pytest -q","status":"passed","expected_files":["backend/app/api/harness.py"],"forbidden_files":["billing/"],"result_summary":"Docker smoke verification passed"}' \
  >/tmp/llmtrace-harness-verify.json

curl -fsS -X POST http://127.0.0.1:8000/api/harness/evals/load-fixtures >/tmp/llmtrace-harness-evals.json
curl -fsS http://127.0.0.1:8000/api/harness/metrics/summary | grep -q '"pending_high_risk_approvals":[1-9]'
curl -fsS "http://127.0.0.1:8000/api/harness/runs/${run_id}" | grep -q "\\[API_KEY_REDACTED\\]"
curl -fsS http://127.0.0.1:8000/api/harness/evals | grep -q "login redirect bug"

echo "Docker smoke passed"
