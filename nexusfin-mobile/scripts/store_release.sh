#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/release-logs"
TS="$(date -u '+%Y%m%d-%H%M%S')"
LOG_FILE="$LOG_DIR/store-release-$TS.log"

DRY_RUN="${DRY_RUN:-1}"
RUN_SUBMIT="${RUN_SUBMIT:-0}"
PROFILE="${PROFILE:-production}"

mkdir -p "$LOG_DIR"
touch "$LOG_FILE"

log() {
  echo "$1" | tee -a "$LOG_FILE"
}

run_cmd() {
  local cmd="$1"
  log "+ $cmd"
  if [[ "$DRY_RUN" == "1" ]]; then
    return 0
  fi
  eval "$cmd" 2>&1 | tee -a "$LOG_FILE"
}

cd "$ROOT_DIR"

log "[store-release] profile=$PROFILE dry_run=$DRY_RUN run_submit=$RUN_SUBMIT"
run_cmd "npx eas --version"
run_cmd "npx eas whoami"
run_cmd "npx eas build --platform ios --profile $PROFILE"
run_cmd "npx eas build --platform android --profile $PROFILE"

if [[ "$RUN_SUBMIT" == "1" ]]; then
  run_cmd "npx eas submit --platform ios --profile $PROFILE"
  run_cmd "npx eas submit --platform android --profile $PROFILE"
else
  log "[store-release] submit skipped (set RUN_SUBMIT=1 to enable)"
fi

log "[store-release] done. log: $LOG_FILE"
