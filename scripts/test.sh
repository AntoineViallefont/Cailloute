#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
PYTHONPATH=backend backend/.venv/bin/python -m pytest backend/tests -q
npm --prefix app test
npm --prefix app run build
