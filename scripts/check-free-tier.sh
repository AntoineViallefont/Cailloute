#!/bin/sh
# Refuse un projet facturable OU une vérification impossible. Aucun effet sur la facturation.
set -eu
project="${1:-cailloute-macavi}"
case "$project" in cailloute-macavi) ;; *) echo 'Projet non autorisé pour le déploiement gratuit.' >&2; exit 1;; esac
command -v gcloud >/dev/null 2>&1 || { echo 'Vérification gratuite impossible : gcloud absent.' >&2; exit 1; }
billing_json="$(gcloud billing projects describe "$project" --format=json)" || { echo 'État de facturation inconnu : déploiement refusé.' >&2; exit 1; }
printf '%s' "$billing_json" | python3 -c 'import json,sys; d=json.load(sys.stdin); ok=d.get("billingEnabled") is False and not d.get("billingAccountName"); print("Projet sans facturation : forfait gratuit confirmé." if ok else "Facturation activée ou inconnue : déploiement refusé."); sys.exit(0 if ok else 1)'
