#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ ! -x backend/.venv/bin/python ]; then sh scripts/install.sh; fi
PYTHONPATH=backend backend/.venv/bin/python -m uvicorn cailloute.main:app --no-access-log --host 127.0.0.1 --port 8787 &
api_pid=$!
trap 'kill "$api_pid" 2>/dev/null || true' EXIT INT TERM
VITE_PERSONAL_MODE=true VITE_FREE_COLLABORATION=false VITE_FREE_EMULATORS=false npm --prefix app run dev
