#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-https://api.horsai.app}"
API_BASE="${BASE_URL%/}/api"

# Optional for authenticated checks.
JWT_TOKEN="${JWT_TOKEN:-}"
ADMIN_JOB_TOKEN="${ADMIN_JOB_TOKEN:-}"

has_jq=0
if command -v jq >/dev/null 2>&1; then
  has_jq=1
fi

request_json() {
  local method="$1"
  local url="$2"
  local expected="$3"
  shift 3

  local tmp_body
  tmp_body="$(mktemp)"
  local code
  code="$(curl -sS -o "$tmp_body" -w "%{http_code}" -X "$method" "$url" "$@")"

  if [[ "$code" != "$expected" ]]; then
    echo "ERROR $method $url -> HTTP $code (expected $expected)"
    cat "$tmp_body"
    rm -f "$tmp_body"
    exit 1
  fi

  echo "OK    $method $url -> $code"
  if [[ "$has_jq" -eq 1 ]]; then
    jq . "$tmp_body" >/dev/null 2>&1 || true
  fi
  rm -f "$tmp_body"
}

echo "== MVP PROD SMOKE =="
echo "Base: $BASE_URL"

echo ""
echo "[1/4] Public health endpoints"
request_json "GET" "$API_BASE/health" "200"
request_json "GET" "$API_BASE/health/cron" "200"

if [[ -z "$JWT_TOKEN" ]]; then
  echo ""
  echo "JWT_TOKEN no definido: se omiten checks autenticados."
  echo "Para correr smoke completo:"
  echo "  JWT_TOKEN=<bearer> ADMIN_JOB_TOKEN=<token> ./scripts/mvp_prod_smoke.sh https://api.horsai.app"
  exit 0
fi

AUTH_HEADER=(-H "Authorization: Bearer $JWT_TOKEN")

echo ""
echo "[2/4] Auth + MVP contract endpoints"
request_json "GET" "$API_BASE/auth/me" "200" "${AUTH_HEADER[@]}"
request_json "GET" "$API_BASE/news/digest/today" "200" "${AUTH_HEADER[@]}"
request_json "GET" "$API_BASE/reco/today" "200" "${AUTH_HEADER[@]}"
request_json "GET" "$API_BASE/crisis/today" "200" "${AUTH_HEADER[@]}"

if [[ -z "$ADMIN_JOB_TOKEN" ]]; then
  echo ""
  echo "ADMIN_JOB_TOKEN no definido: se omiten checks admin jobs."
  exit 0
fi

ADMIN_HEADERS=("${AUTH_HEADER[@]}" -H "x-admin-token: $ADMIN_JOB_TOKEN" -H "Content-Type: application/json")

echo ""
echo "[3/4] Admin jobs read endpoints"
request_json "GET" "$API_BASE/admin/jobs/runs?limit=5" "200" "${ADMIN_HEADERS[@]}"
request_json "GET" "$API_BASE/admin/jobs/status?limit=5" "200" "${ADMIN_HEADERS[@]}"

echo ""
echo "[4/4] Admin jobs run endpoint (single safe job)"
request_json "POST" "$API_BASE/admin/jobs/run" "200" "${ADMIN_HEADERS[@]}" --data '{"jobs":["news_ingest_daily"]}'

echo ""
echo "Smoke MVP PROD: OK"
