#!/bin/sh
# Compilation personnelle : signature locale, distincte de la bêta officielle.
set -eu
cd "$(dirname "$0")/.."
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 21)}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
VITE_PERSONAL_MODE=true VITE_FREE_COLLABORATION=false npm --prefix app run build
(cd app && npx cap sync android && node scripts/slim-native-assets.mjs)
app/android/gradlew -p app/android assembleDebug -PcailloutePersonalMode=true --console=plain
mkdir -p livraison
cp app/android/app/build/outputs/apk/debug/app-debug.apk livraison/Cailloute-local.apk
