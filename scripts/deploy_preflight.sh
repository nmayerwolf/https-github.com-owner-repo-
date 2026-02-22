#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_DIR="$ROOT_DIR/nexusfin-api"

echo "[deploy-preflight] Root: $ROOT_DIR"

echo "[deploy-preflight] 1) Verificando archivos de deploy..."
test -f "$ROOT_DIR/vercel.json" || { echo "Falta vercel.json"; exit 1; }
test -f "$API_DIR/railway.toml" || { echo "Falta nexusfin-api/railway.toml"; exit 1; }
test -f "$API_DIR/.env.example" || { echo "Falta nexusfin-api/.env.example"; exit 1; }
test -f "$ROOT_DIR/.env.production.example" || { echo "Falta .env.production.example"; exit 1; }
test -f "$API_DIR/.env.production.example" || { echo "Falta nexusfin-api/.env.production.example"; exit 1; }
test -f "$ROOT_DIR/nexusfin-mobile/.env.production.example" || { echo "Falta nexusfin-mobile/.env.production.example"; exit 1; }
echo "OK"

echo "[deploy-preflight] 2) Validando consistencia de integraciones y DNS..."
node "$ROOT_DIR/scripts/integration_doctor.cjs"
echo "OK"

echo "[deploy-preflight] 3) Verificando .env en gitignore..."
if ! grep -q "^\\.env$" "$ROOT_DIR/.gitignore"; then
  echo "ERROR: .env no está en .gitignore"
  exit 1
fi
echo "OK"

echo "[deploy-preflight] 4) Buscando secretos hardcodeados en frontend..."
if rg -n "sk-ant|d6742n|UFZ6W|FINNHUB_KEY|ALPHA_VANTAGE_KEY|TWELVE_DATA_KEY" "$ROOT_DIR/src" --glob "*.{js,jsx}" >/tmp/horsai-secrets.txt; then
  echo "ERROR: Posibles secretos encontrados en frontend:"
  cat /tmp/horsai-secrets.txt
  exit 1
fi
echo "OK"

echo "[deploy-preflight] 5) Check frontend..."
cd "$ROOT_DIR"
npm run check

echo "[deploy-preflight] 6) Check backend..."
cd "$API_DIR"
if [[ -z "${DATABASE_URL:-}" || -z "${JWT_SECRET:-}" ]]; then
  echo "WARN: DATABASE_URL/JWT_SECRET no definidos; salteando check backend."
else
  npm run check
fi

echo "[deploy-preflight] 7) Yahoo health local (opcional)..."
if curl -fsS "http://localhost:3001/api/health/yahoo" >/tmp/horsai-yahoo-health.json 2>/dev/null; then
  echo "OK (local API): /api/health/yahoo responde"
else
  echo "INFO: API local no disponible en :3001 o Yahoo health no accesible (no bloqueante)."
fi

echo "[deploy-preflight] DONE"
