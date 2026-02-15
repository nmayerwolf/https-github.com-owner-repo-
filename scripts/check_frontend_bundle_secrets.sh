#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="${ROOT_DIR}/dist"

if [[ ! -d "${DIST_DIR}" ]]; then
  echo "dist/ no existe. Ejecutá build antes del escaneo."
  exit 1
fi

# Heuristics for accidental key leakage in bundled assets.
PATTERN='VITE_FINNHUB_KEY|VITE_ALPHA_VANTAGE_KEY|FINNHUB_KEY|ALPHA_VANTAGE_KEY|d6742npr01qmckkc23sgd6742npr01qmckkc23t0|UFZ6W2F1RUPUGVWF'

if rg -n --hidden -e "${PATTERN}" "${DIST_DIR}" >/tmp/nexusfin_bundle_secret_scan.txt; then
  echo "Se detectaron posibles secretos de mercado en dist/:"
  cat /tmp/nexusfin_bundle_secret_scan.txt
  exit 1
fi

echo "OK: no se detectaron secretos de mercado en dist/."
