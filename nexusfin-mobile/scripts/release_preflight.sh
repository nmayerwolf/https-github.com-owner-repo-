#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ok() { echo "OK   - $1"; }
warn() { echo "WARN - $1"; }
fail() { echo "FAIL - $1"; exit 1; }

echo "[preflight] NexusFin mobile release preflight"
echo "[preflight] cwd=$ROOT_DIR"

[[ -f "$ROOT_DIR/app.json" ]] || fail "Missing app.json"
[[ -f "$ROOT_DIR/eas.json" ]] || fail "Missing eas.json"
[[ -f "$ROOT_DIR/APP_STORE_METADATA.md" ]] || fail "Missing APP_STORE_METADATA.md"
[[ -f "$ROOT_DIR/assets/icon.png" ]] || fail "Missing assets/icon.png"
[[ -f "$ROOT_DIR/assets/adaptive-icon.png" ]] || fail "Missing assets/adaptive-icon.png"
[[ -f "$ROOT_DIR/assets/splash.png" ]] || fail "Missing assets/splash.png"
ok "required files present"

if ! command -v node >/dev/null 2>&1; then
  fail "node not installed"
fi
ok "node installed ($(node -v))"

if ! command -v npx >/dev/null 2>&1; then
  fail "npx not installed"
fi
ok "npx installed"

if command -v eas >/dev/null 2>&1; then
  ok "eas cli available ($(eas --version 2>/dev/null || echo unknown))"
  if eas whoami >/dev/null 2>&1; then
    ok "eas authenticated"
  else
    warn "not authenticated in eas (run: eas login)"
  fi
else
  warn "eas cli not available (install: npm i -g eas-cli)"
fi

node -e "JSON.parse(require('fs').readFileSync(process.argv[1], 'utf8'));JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));" \
  "$ROOT_DIR/app.json" "$ROOT_DIR/eas.json" || fail "Invalid JSON in app.json/eas.json"
ok "app.json + eas.json parse"

echo "[preflight] done"
