#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
sh scripts/check-free-tier.sh
# Les destinataires sont indiqués explicitement à chaque distribution Android.
tester_email="${1:?Indiquez l’adresse du testeur en premier argument.}"
app_version="$(node -p 'JSON.parse(require("fs").readFileSync("app/package.json", "utf8")).version')"
firebase appdistribution:distribute "livraison/Cailloute-$app_version.apk" --app 1:1049609361777:android:0d13d21cd6c9d6919bfed0 --project cailloute-macavi --testers "$tester_email" --release-notes-file "livraison/NOTES-$app_version.txt" --non-interactive
