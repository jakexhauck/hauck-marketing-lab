#!/usr/bin/env bash
# One-time setup for the lead scraper on macOS (and Linux).
# Run from this directory:  bash setup_mac.sh
set -euo pipefail

cd "$(dirname "$0")"
echo "Lead scraper setup, $(pwd)"

mkdir -p data out logs

# --- Python -----------------------------------------------------------------
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python 3.11+ is required. Install it (brew install python) and re-run." >&2
  exit 1
fi
echo "1/4  Python venv"
python3 -m venv .venv
.venv/bin/pip install --upgrade pip --quiet
.venv/bin/pip install -r requirements.txt --quiet
echo "     ok ($(.venv/bin/python --version))"

# --- gosom, the Maps engine --------------------------------------------------
echo "2/4  gosom (the Google Maps scraper)"
if command -v go >/dev/null 2>&1; then
  go install github.com/gosom/google-maps-scraper@latest
  echo native > data/.engine
  echo "     ok, native binary in $(go env GOPATH)/bin"
elif command -v docker >/dev/null 2>&1; then
  docker pull gosom/google-maps-scraper
  echo docker > data/.engine
  echo "     ok, via Docker"
else
  echo "     NOT INSTALLED. gosom needs either Go or Docker:" >&2
  echo "       brew install go       (then re-run this script)" >&2
  echo "       or install Docker Desktop" >&2
  echo "     Everything else is set up; the scraper cannot run until this is fixed." >&2
fi

# --- credentials -------------------------------------------------------------
echo "3/4  credentials"
if [ ! -f .env ]; then
  cp .env.example .env
  echo "     wrote .env from the example. Fill in SUPABASE_URL and"
  echo "     SUPABASE_SERVICE_ROLE_KEY before the first run."
else
  echo "     .env already present, left alone"
fi

# --- prove the qualifier still works ----------------------------------------
echo "4/4  regression test"
.venv/bin/python -m unittest discover -s tests -q

echo
echo "Done. Start the runner with:  bash run.sh --watch"
