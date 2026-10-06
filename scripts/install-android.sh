#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
: "${ANDROID_SERIAL:?Choisir explicitement l’appareil avec ANDROID_SERIAL}"
apk="${1:-livraison/Cailloute-local.apk}"
"${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools/adb" -s "$ANDROID_SERIAL" install -r "$apk"
