#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
: "${FIREBASE_PROJECT:?Renseigner votre propre projet Firebase}"
gcloud billing projects describe "$FIREBASE_PROJECT" --format=json | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("billingEnabled") is False and not d.get("billingAccountName") else 1)'
VITE_PERSONAL_MODE=true VITE_FREE_COLLABORATION=false npm --prefix app run build
firebase deploy --only hosting --project "$FIREBASE_PROJECT" --non-interactive
