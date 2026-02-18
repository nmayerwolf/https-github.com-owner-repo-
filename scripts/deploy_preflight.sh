#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/nexusfin-api"

echo "[deploy-preflight] Root: $ROOT_DIR"

echo "[deploy-preflight] 1) Verificando archivos de deploy..."
test -f "$ROOT_DIR/vercel.json" || { echo "Falta vercel.json"; exit 1; }
test -f "$API_DIR/railway.toml" || { echo "Falta nexusfin-api/railway.toml"; exit 1; }
test -f "$API_DIR/.env.example" || { echo "Falta nexusfin-api/.env.example"; exit 1; }
echo "OK"

echo "[deploy-preflight] 2) Verificando .env en gitignore..."
if ! grep -q "^\\.env$" "$ROOT_DIR/.gitignore"; then
  echo "ERROR: .env no está en .gitignore"
  exit 1
fi
echo "OK"

echo "[deploy-preflight] 3) Buscando secretos hardcodeados en frontend..."
if rg -n "sk-ant|d6742n|UFZ6W|FINNHUB_KEY|ALPHA_VANTAGE_KEY" "$ROOT_DIR/src" --glob "*.{js,jsx}" >/tmp/horsai-secrets.txt; then
  echo "ERROR: Posibles secretos encontrados en frontend:"
  cat /tmp/horsai-secrets.txt
  exit 1
fi
echo "OK"

echo "[deploy-preflight] 4) Check frontend..."
cd "$ROOT_DIR"
npm run check

echo "[deploy-preflight] 5) Check backend..."
cd "$API_DIR"
if [[ -z "${DATABASE_URL:-}" || -z "${JWT_SECRET:-}" ]]; then
  echo "WARN: DATABASE_URL/JWT_SECRET no definidos; salteando check backend."
else
  npm run check
fi

echo "[deploy-preflight] DONE"

