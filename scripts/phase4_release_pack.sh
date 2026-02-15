#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLE_FILE="$ROOT_DIR/PHASE4_AUDIT_BUNDLE.md"
API_DIR="$ROOT_DIR/nexusfin-api"

RUN_CHECKS="${RUN_CHECKS:-0}"

if [[ "$RUN_CHECKS" == "1" ]]; then
  echo "[phase4-release-pack] running phase4 gate first..."
  "$ROOT_DIR/scripts/phase4_gate.sh"
fi

echo "[phase4-release-pack] generating $BUNDLE_FILE"

{
  echo "# PHASE 4 AUDIT BUNDLE"
  echo
  echo "Generated: $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
  echo
  echo "## 1. CLOSEOUT"
  echo
  cat "$ROOT_DIR/PHASE4_CLOSEOUT.md"
  echo
  echo "## 2. SMOKE RUNBOOK"
  echo
  cat "$ROOT_DIR/PHASE4_SMOKE_RUNBOOK.md"
  echo
  echo "## 3. GATE SCRIPT"
  echo
  echo '```bash'
  cat "$ROOT_DIR/scripts/phase4_gate.sh"
  echo '```'
  echo
  echo "## 4. REPO STATUS"
  echo
  echo "### Git status"
  git -C "$ROOT_DIR" status --short || true
  echo
  echo "### Last commits"
  git -C "$ROOT_DIR" log --oneline -10 || true
  echo
  echo "### File tree (src)"
  find "$ROOT_DIR/src" -type f | head -80 || true
  echo
  echo "### Package.json dependencies"
  grep -A 80 '"dependencies"' "$ROOT_DIR/package.json" || true
  echo
  echo "### Backend migrations"
  ls -la "$API_DIR/migrations" 2>/dev/null || echo "No migrations dir"
  echo
  echo "### Web tests (tail)"
  npm -C "$ROOT_DIR" test -- --silent 2>&1 | tail -30 || true
  echo
  echo "### API coverage (tail)"
  (
    cd "$API_DIR"
    DATABASE_URL="${DATABASE_URL:-postgres://test:test@localhost:5432/test}" \
    JWT_SECRET="${JWT_SECRET:-test-secret}" \
    npm run test:coverage 2>&1 | tail -30
  ) || true
} >"$BUNDLE_FILE"

echo "[phase4-release-pack] done"
