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

echo "Docker smoke passed"
