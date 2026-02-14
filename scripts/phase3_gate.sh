#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/nexusfin-api"

echo "[phase3-gate] Running web check..."
cd "$ROOT_DIR"
npm run check

echo "[phase3-gate] Running api check..."
cd "$API_DIR"
DATABASE_URL="${DATABASE_URL:-postgres://test:test@localhost:5432/test}" \
JWT_SECRET="${JWT_SECRET:-test-secret}" \
npm run check

echo "[phase3-gate] Optional live health checks..."
if curl -fsS http://localhost:3001/api/health >/tmp/phase3-health.json 2>/dev/null; then
  cat /tmp/phase3-health.json
  echo
  curl -fsS http://localhost:3001/api/health/mobile || true
  echo
  curl -fsS http://localhost:3001/api/health/phase3 || true
  echo
else
  echo "[phase3-gate] API not running on :3001; skipped live health curls."
fi

echo "[phase3-gate] DONE"
