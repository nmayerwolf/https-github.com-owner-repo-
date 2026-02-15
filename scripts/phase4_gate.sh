#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/nexusfin-api"
MOBILE_DIR="$ROOT_DIR/nexusfin-mobile"

echo "[phase4-gate] Running web check..."
cd "$ROOT_DIR"
npm run check

echo "[phase4-gate] Running web e2e..."
npm run test:e2e

echo "[phase4-gate] Running api coverage..."
cd "$API_DIR"
DATABASE_URL="${DATABASE_URL:-postgres://test:test@localhost:5432/test}" \
JWT_SECRET="${JWT_SECRET:-test-secret}" \
npm run test:coverage

echo "[phase4-gate] Optional live health checks..."
if curl -fsS http://localhost:3001/api/health >/tmp/phase4-health.json 2>/dev/null; then
  cat /tmp/phase4-health.json
  echo
  curl -fsS http://localhost:3001/api/health/mobile || true
  echo
  curl -fsS http://localhost:3001/api/health/phase3 || true
  echo
  curl -fsS http://localhost:3001/api/health/cron || true
  echo
else
  echo "[phase4-gate] API not running on :3001; skipped live health curls."
fi

echo "[phase4-gate] Mobile readiness files..."
for f in "$MOBILE_DIR/app.json" "$MOBILE_DIR/eas.json" "$MOBILE_DIR/APP_STORE_METADATA.md"; do
  if [[ -f "$f" ]]; then
    echo "  OK: $f"
  else
    echo "  MISSING: $f"
    exit 1
  fi
done

echo "[phase4-gate] DONE"
