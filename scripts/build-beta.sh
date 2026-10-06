#!/bin/sh
# Compile la bêta officielle ; les secrets restent hors du dépôt.
set -eu
cd "$(dirname "$0")/.."
: "${CAILLOUTE_KEYSTORE:?Chemin de la clé dédiée nécessaire}"
: "${CAILLOUTE_PASSWORD_FILE:?Fichier du mot de passe nécessaire}"
export JAVA_HOME="${JAVA_HOME:-$(/usr/libexec/java_home -v 21)}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
version="$(node -p 'JSON.parse(require("fs").readFileSync("app/package.json", "utf8")).version')"
VITE_PERSONAL_MODE=true VITE_FREE_COLLABORATION=true VITE_DEV_HTTP=false npm --prefix app run build
(cd app && npx cap sync android && node scripts/slim-native-assets.mjs)
app/android/gradlew -p app/android assembleRelease -PcailloutePersonalMode=true --console=plain
mkdir -p livraison
build_tools="${CAILLOUTE_BUILD_TOOLS:-$ANDROID_HOME/build-tools/36.0.0}"
"$build_tools/zipalign" -f -P 16 4 app/android/app/build/outputs/apk/release/app-release-unsigned.apk "livraison/Cailloute-$version-aligned.apk"
"$build_tools/apksigner" sign --ks "$CAILLOUTE_KEYSTORE" --ks-key-alias cailloute --ks-pass "file:$CAILLOUTE_PASSWORD_FILE" --lineage signatures/cailloute.lineage --rotation-min-sdk-version 28 --min-sdk-version 28 --v1-signing-enabled false --v2-signing-enabled false --v3-signing-enabled true --v4-signing-enabled false --out "livraison/Cailloute-$version-beta.apk" "livraison/Cailloute-$version-aligned.apk"
"$build_tools/apksigner" verify --verbose --print-certs "livraison/Cailloute-$version-beta.apk"
