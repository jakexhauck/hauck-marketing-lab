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

# A venv is Scripts/python.exe on Windows and bin/python everywhere else, and
# this repo is checked out on both. Pick whichever exists rather than assuming.
if [ -x .venv/bin/python ]; then
  PY=.venv/bin/python
elif [ -x .venv/Scripts/python.exe ]; then
  PY=.venv/Scripts/python.exe
else
  echo "No virtualenv found. Create one: python -m venv .venv && .venv/*/pip install -r requirements.txt" >&2
  exit 1
fi

exec "$PY" coordinator.py "$@"
