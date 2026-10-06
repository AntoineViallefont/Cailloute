#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ -z "${JAVA_HOME:-}" ] && [ -x /usr/libexec/java_home ]; then export JAVA_HOME="$(/usr/libexec/java_home -v 21)"; fi
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
# Gradle peut désinstaller l'application testée : réserver ces tests aux émulateurs.
qa_devices=$("$ANDROID_HOME/platform-tools/adb" devices | awk 'NR>1 && $2=="device" {print $1}')
if [ -z "$qa_devices" ]; then
  echo "Démarrer un émulateur Android dédié aux essais." >&2
  exit 1
fi
for qa_device in $qa_devices; do
  case "$qa_device" in
    emulator-*) ;;
    *) echo "Tests automatiques réservés aux émulateurs. Déconnecter le téléphone avant ces tests." >&2; exit 1 ;;
  esac
done
app/android/gradlew -p app/android :app:connectedDebugAndroidTest -PcailloutePersonalMode=false --console=plain
