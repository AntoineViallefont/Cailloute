#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
python3 scripts/telecharger-donnees.py
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.lock
npm --prefix app ci
# Ne jamais réimporter ni remplacer une base personnelle pendant l'installation.
