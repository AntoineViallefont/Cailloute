#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
PYTHONPATH=backend backend/.venv/bin/python -m cailloute.import_data "$@"
PYTHONPATH=backend backend/.venv/bin/python -m cailloute.export_seed
