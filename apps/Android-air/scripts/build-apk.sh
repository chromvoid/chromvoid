#!/usr/bin/env bash
# Package the Android client from the native libraries build-rust.sh produced.
#
#   build-apk.sh debug   [--abi arm64-v8a|x86_64] [--install <adb-serial>]
#   build-apk.sh release [--abi arm64-v8a|x86_64]
#
# debug is the development identity with whatever libraries were built last,
# fixture ones included. release takes release libraries only - Gradle refuses
# anything else - and comes out unsigned: signing and publication are a
# separate decision, outside this client's plan.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
air_export_android_env

VARIANT="${1:-}"
case "$VARIANT" in
  debug | release) shift ;;
  *) echo "usage: build-apk.sh debug|release [--abi <abi>] [--install <adb-serial>]" >&2; exit 2 ;;
esac

ABI=""
SERIAL=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --abi) ABI="${2:?--abi needs arm64-v8a or x86_64}"; shift 2 ;;
    --install) SERIAL="${2:?--install needs an adb serial}"; shift 2 ;;
    *) echo "Unknown option $1" >&2; exit 2 ;;
  esac
done
if [[ -n "$SERIAL" && "$VARIANT" != debug ]]; then
  echo "Only a debug build installs: a release build is unsigned." >&2
  exit 2
fi

# The bindings and the libraries must come from the same sources, or every
# call fails on the device with IncompatibleBuild. Say so before packaging.
PROVENANCE="$AIR_ROOT/bridge/src/main/jniLibs/.build-provenance"
EXPECTED="$(sed -n 's/.*EXPECTED: String = "\([0-9a-f]*\)".*/\1/p' \
  "$AIR_ROOT/bridge/src/main/kotlin/com/chromvoid/air/bridge/BuildFingerprint.kt")"
BUILT="$(sed -n 's/^fingerprint=//p' "$PROVENANCE" 2>/dev/null || true)"
MODE="$(sed -n 's/^mode=//p' "$PROVENANCE" 2>/dev/null || true)"
if [[ "$EXPECTED" != "$BUILT" ]]; then
  echo "Native libraries were built from other sources (${BUILT:-none}, bindings expect $EXPECTED)." >&2
  echo "Run scripts/build-rust.sh ${VARIANT/debug/fixture} first." >&2
  exit 1
fi

# Installing on one device packages only the ABI it runs, unless asked otherwise.
if [[ -n "$SERIAL" && -z "$ABI" ]]; then
  ABI="$("$ANDROID_HOME/platform-tools/adb" -s "$SERIAL" shell getprop ro.product.cpu.abi | tr -d '\r')"
  [[ -n "$ABI" ]] || { echo "Could not read the device ABI from $SERIAL" >&2; exit 1; }
fi

GRADLE_ARGS=()
[[ -n "$ABI" ]] && GRADLE_ARGS+=("-PairAbi=$ABI")
TASK=":app:assemble$(tr '[:lower:]' '[:upper:]' <<<"${VARIANT:0:1}")${VARIANT:1}"
"$AIR_ROOT/scripts/gradle.sh" ${GRADLE_ARGS[@]+"${GRADLE_ARGS[@]}"} "$TASK"

APK_DIR="$AIR_ROOT/app/build/outputs/apk/$VARIANT"
APK="$(find "$APK_DIR" -maxdepth 1 -name '*.apk' -print | head -n 1)"
if [[ -z "$APK" ]]; then
  echo "No APK under $APK_DIR" >&2
  exit 1
fi
echo "Built $VARIANT APK with $MODE libraries (${ABI:-arm64-v8a and x86_64}): $APK ($(du -h "$APK" | cut -f1))"

if [[ -n "$SERIAL" ]]; then
  "$ANDROID_HOME/platform-tools/adb" -s "$SERIAL" install -r "$APK"
fi
