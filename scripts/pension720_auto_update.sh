#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="/home/ubuntu/lotto-play-picker"
ENV_LOCAL="$ROOT_DIR/.env.local"
ENV_FILE="$ROOT_DIR/.env"
API_BASE_URL="${API_BASE_URL:-https://lotto.42222.cloud}"

load_env_file() {
  local file_path="$1"
  if [[ ! -f "$file_path" ]]; then
    return 0
  fi

  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line%"${line##*[![:space:]]}"}"

    if [[ -z "$line" || "$line" == \#* || "$line" != *=* ]]; then
      continue
    fi

    local key="${line%%=*}"
    local value="${line#*=}"

    key="${key%"${key##*[![:space:]]}"}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"

    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:-1}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:-1}"
    fi

    export "$key=$value"
  done < "$file_path"
}

load_env_file "$ENV_LOCAL"
load_env_file "$ENV_FILE"

if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "[pension720-auto-update] Missing CRON_SECRET in environment or env file." >&2
  exit 1
fi

run_step() {
  local path="$1"
  local label="$2"

  echo "[pension720-auto-update] Running ${label}..."
  curl --fail --silent --show-error \
    -X POST \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    "${API_BASE_URL}${path}"
  echo
}

run_step "/api/sync-pension720-draws" "sync-pension720-draws"
run_step "/api/check-pension720-result" "check-pension720-result"
run_step "/api/generate-pension720-weekly" "generate-pension720-weekly"

echo "[pension720-auto-update] Completed successfully."
