#!/bin/bash
set -euo pipefail

BASE_URL="${1:-http://localhost:3001}"
JWT_TOKEN="${JWT_TOKEN:-}"
CSRF_TOKEN="${CSRF_TOKEN:-${JWT_TOKEN}}"
ADMIN_JOB_TOKEN="${ADMIN_JOB_TOKEN:-}"
RUN_DATE="${RUN_DATE:-}"

if [[ -z "$JWT_TOKEN" ]]; then
  echo "Missing JWT_TOKEN env var"
  exit 1
fi

if [[ -z "$ADMIN_JOB_TOKEN" ]]; then
  echo "Missing ADMIN_JOB_TOKEN env var"
  exit 1
fi

HEADERS=(
  -H "Authorization: Bearer ${JWT_TOKEN}"
  -H "x-csrf-token: ${CSRF_TOKEN}"
  -H "x-admin-token: ${ADMIN_JOB_TOKEN}"
  -H "Content-Type: application/json"
)

echo "=== Horsai Sources Smoke ==="
echo "Target: ${BASE_URL}"

echo "1) Run jobs"
if [[ -n "$RUN_DATE" ]]; then
  curl -sS "${BASE_URL}/api/admin/jobs/run" "${HEADERS[@]}" -X POST -d "{\"date\":\"${RUN_DATE}\"}" | jq .
else
  curl -sS "${BASE_URL}/api/admin/jobs/run" "${HEADERS[@]}" -X POST -d '{}' | jq .
fi

echo ""
echo "2) Sources status"
curl -sS "${BASE_URL}/api/admin/jobs/sources/status" "${HEADERS[@]}" | jq .

echo ""
echo "=== Done ==="
