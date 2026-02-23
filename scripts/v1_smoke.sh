#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
API_DIR="$ROOT_DIR/nexusfin-api"

BASE_URL="${1:-${BASE_URL:-http://localhost:3001}}"
API_BASE="${BASE_URL%/}/api"
RUN_DATE="${RUN_DATE:-$(date +%F)}"
JWT_TOKEN="${JWT_TOKEN:-}"
ADMIN_JOB_TOKEN="${ADMIN_JOB_TOKEN:-}"
MODE="${MODE:-read}" # read|admin
SMOKE_EMAIL="${SMOKE_EMAIL:-nmayerwolf@gmail.com}"

usage() {
  cat <<'USAGE'
Usage:
  v1_smoke.sh [base_url]

Env vars:
  BASE_URL         API base URL (default: http://localhost:3001)
  JWT_TOKEN        Bearer token (optional for localhost; auto-generated if omitted)
  ADMIN_JOB_TOKEN  Required only when MODE=admin (auto-loaded from nexusfin-api/.env if omitted)
  MODE             read|admin (default: read)
  RUN_DATE         Date used for date-based checks (default: today)
  SMOKE_EMAIL      User email for local JWT auto-generation (default: nmayerwolf@gmail.com)

Examples:
  JWT_TOKEN=... ./scripts/v1_smoke.sh
  MODE=admin JWT_TOKEN=... ADMIN_JOB_TOKEN=... ./scripts/v1_smoke.sh https://api.example.com
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

if [[ -z "$ADMIN_JOB_TOKEN" && -f "$API_DIR/.env" ]]; then
  ADMIN_JOB_TOKEN="$(sed -n 's/^ADMIN_JOB_TOKEN=//p' "$API_DIR/.env" | head -n1 | tr -d '\r')"
fi

if [[ -z "$JWT_TOKEN" && "$BASE_URL" == "http://localhost:3001" ]]; then
  if [[ ! -d "$API_DIR" ]]; then
    echo "ERROR: cannot auto-generate JWT; missing $API_DIR"
    exit 1
  fi

  echo "INFO: JWT_TOKEN not provided. Generating local token for $SMOKE_EMAIL ..."
  JWT_TOKEN="$(
    cd "$API_DIR"
    SMOKE_EMAIL="$SMOKE_EMAIL" node -e 'const {query,pool}=require("./src/config/db"); const {issueToken,storeSession}=require("./src/middleware/auth"); (async()=>{ const email=String(process.env.SMOKE_EMAIL||"").trim(); const out=await query("SELECT id,email FROM users WHERE email=$1 LIMIT 1",[email]); const u=out.rows[0]; if(!u) throw new Error(`user not found for ${email}`); const t=issueToken({id:u.id,email:u.email}); await storeSession(u.id,t); process.stdout.write(t); await pool.end(); })().catch(async e=>{ console.error(e.message); try{await pool.end();}catch{} process.exit(1); });'
  )"
fi

if [[ -z "$JWT_TOKEN" ]]; then
  echo "ERROR: JWT_TOKEN is required for V1 smoke checks (or use localhost auto-generation)."
  exit 1
fi

request() {
  local method="$1"
  local path="$2"
  local body="${3:-}"

  local tmp
  tmp="$(mktemp)"

  local -a args
  args=(
    --max-time 30
    -sS
    -o "$tmp"
    -w "%{http_code}"
    -X "$method"
    "$API_BASE$path"
    -H "Authorization: Bearer $JWT_TOKEN"
  )

  if [[ -n "$body" ]]; then
    args+=( -H "Content-Type: application/json" --data "$body" )
  fi

  if [[ -n "$ADMIN_JOB_TOKEN" ]]; then
    args+=( -H "x-admin-token: $ADMIN_JOB_TOKEN" )
  fi

  local code
  code="$(curl "${args[@]}")"
  echo "$code" "$tmp"
}

assert_http() {
  local label="$1"
  local expected="$2"
  local code="$3"
  local file="$4"

  if [[ "$code" != "$expected" ]]; then
    echo "ERROR: $label returned HTTP $code (expected $expected)"
    cat "$file"
    rm -f "$file"
    exit 1
  fi
  echo "OK $label"
  rm -f "$file"
}

echo "== V1 Smoke =="
echo "Base: $BASE_URL"
echo "Mode: $MODE"

healthBody="$(mktemp)"
healthCode="$(curl --max-time 20 -sS -o "$healthBody" -w "%{http_code}" "$API_BASE/health")"
assert_http "GET /health" "200" "$healthCode" "$healthBody"

read -r briefCode briefBody < <(request "GET" "/brief/today")
assert_http "GET /brief/today" "200" "$briefCode" "$briefBody"

read -r pkgTodayCode pkgTodayBody < <(request "GET" "/packages/today")
assert_http "GET /packages/today" "200" "$pkgTodayCode" "$pkgTodayBody"

read -r pkgDateCode pkgDateBody < <(request "GET" "/packages/$RUN_DATE")
assert_http "GET /packages/:date" "200" "$pkgDateCode" "$pkgDateBody"

read -r ideasCode ideasBody < <(request "GET" "/ideas")
assert_http "GET /ideas" "200" "$ideasCode" "$ideasBody"

read -r portfolioCode portfolioBody < <(request "GET" "/portfolio")
assert_http "GET /portfolio" "200" "$portfolioCode" "$portfolioBody"

read -r challengesCode challengesBody < <(request "GET" "/portfolio/challenges")
assert_http "GET /portfolio/challenges" "200" "$challengesCode" "$challengesBody"

if [[ "$MODE" == "admin" ]]; then
  if [[ -z "$ADMIN_JOB_TOKEN" ]]; then
    echo "ERROR: ADMIN_JOB_TOKEN required for MODE=admin"
    exit 1
  fi

  read -r adminStatusCode adminStatusBody < <(request "GET" "/admin/jobs/status")
  assert_http "GET /admin/jobs/status" "200" "$adminStatusCode" "$adminStatusBody"

  read -r adminRunCode adminRunBody < <(request "POST" "/admin/jobs/run" "{\"date\":\"$RUN_DATE\"}")
  assert_http "POST /admin/jobs/run" "200" "$adminRunCode" "$adminRunBody"
fi

echo "DONE: V1 smoke checks passed."
