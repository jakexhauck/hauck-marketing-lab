#!/usr/bin/env bash
# Loads .env, then runs the coordinator with whatever you pass through.
#   bash run.sh --watch          poll for runs queued from the Leads page
#   bash run.sh --run <id>       execute one run
#   bash run.sh --local          the SOP's standalone queue mode
set -euo pipefail
cd "$(dirname "$0")"

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example)." >&2
  exit 1
fi

exec .venv/bin/python coordinator.py "$@"
