#!/usr/bin/env bash
# Instrumentation checks. The device is explicit: this script never adopts
# whichever emulator another task happens to have booted.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
air_export_android_env
SERIAL="${1:-${ANDROID_SERIAL:-}}"
if [[ -z "$SERIAL" ]]; then
  echo "usage: test-ui.sh <adb-serial>   (or set ANDROID_SERIAL)" >&2
  "$ANDROID_HOME/platform-tools/adb" devices -l >&2 || true
  exit 2
fi
export ANDROID_SERIAL="$SERIAL"
# Rust refuses bindings built against other sources, so a stale library would
# fail every test on the device with IncompatibleBuild. Say so before building.
EXPECTED="$(sed -n 's/.*EXPECTED: String = "\([0-9a-f]*\)".*/\1/p' \
  "$AIR_ROOT/bridge/src/main/kotlin/com/chromvoid/air/bridge/BuildFingerprint.kt")"
BUILT="$(sed -n 's/^fingerprint=//p' "$AIR_ROOT/bridge/src/main/jniLibs/.build-provenance" 2>/dev/null || true)"
if [[ "$EXPECTED" != "$BUILT" ]]; then
  echo "Native libraries were built from other sources (${BUILT:-unknown}, bindings expect $EXPECTED)." >&2
  echo "Run scripts/build-rust.sh fixture first." >&2
  exit 1
fi
# Package only the ABI this device runs: the other one is 25 MB of native
# library the device can never load, and it has failed emulator installs.
ABI="${AIR_ABI:-$("$ANDROID_HOME/platform-tools/adb" -s "$SERIAL" shell getprop ro.product.cpu.abi | tr -d '\r')}"
if [[ -z "$ABI" ]]; then
  echo "Could not read the device ABI from $SERIAL" >&2
  exit 1
fi
# Only this client's checks: the shared module's own instrumentation tests
# belong to whichever host runs them.
# AIR_TEST_CLASS narrows the run to one class (or Class#method) while working
# on a route; the default runs every instrumentation test.
FILTER=()
if [[ -n "${AIR_TEST_CLASS:-}" ]]; then
  FILTER+=("-Pandroid.testInstrumentationRunnerArguments.class=com.chromvoid.air.$AIR_TEST_CLASS")
fi
# AIR_TEST_ARGS hands a test its inputs as space-separated key=value pairs,
# such as the local relay an interoperability run owns.
for pair in ${AIR_TEST_ARGS:-}; do
  FILTER+=("-Pandroid.testInstrumentationRunnerArguments.$pair")
done
# AIR_KEEP_INSTALLED=1 leaves the app on the device after the run, which a
# physical phone needs: the person's choice of autofill and passkey provider
# goes with the app when Gradle uninstalls it. Each listed test (or
# Class#method) then runs on its own, after the app's files are deleted, as the
# orchestrator would clear them; such a phone refuses the orchestrator's own
# clearing. The files go through run-as rather than `pm clear`, which the
# system treats as the package being reset.
if [[ -n "${AIR_KEEP_INSTALLED:-}" ]]; then
  if [[ -z "${AIR_TEST_CLASS:-}" ]]; then
    echo "AIR_KEEP_INSTALLED needs AIR_TEST_CLASS" >&2
    exit 2
  fi
  "$AIR_ROOT/scripts/gradle.sh" --no-daemon "-PairAbi=$ABI" :app:installDebug :app:installDebugAndroidTest
  ADB="$ANDROID_HOME/platform-tools/adb"
  ARGS=()
  for pair in ${AIR_TEST_ARGS:-}; do
    ARGS+=(-e "${pair%%=*}" "${pair#*=}")
  done
  FAILED=0
  IFS=',' read -r -a TESTS <<< "$AIR_TEST_CLASS"
  for test in "${TESTS[@]}"; do
    test="${test#com.chromvoid.air.}"
    "$ADB" -s "$SERIAL" shell am force-stop com.chromvoid.air.dev
    # A test that failed with the notification shade open leaves it over the next one.
    "$ADB" -s "$SERIAL" shell cmd statusbar collapse
    "$ADB" -s "$SERIAL" shell run-as com.chromvoid.air.dev sh -c "'rm -rf ./* ; true'"
    OUTPUT="$("$ADB" -s "$SERIAL" shell am instrument -w -r -e class "com.chromvoid.air.$test" \
      ${ARGS[@]+"${ARGS[@]}"} com.chromvoid.air.dev.test/androidx.test.runner.AndroidJUnitRunner)"
    if grep -q "^OK (" <<< "$OUTPUT"; then
      echo "PASS $test ($(grep -oE '^OK \([0-9]+ tests?\)' <<< "$OUTPUT"))"
    else
      FAILED=1
      echo "FAIL $test"
      grep -E "INSTRUMENTATION_STATUS: stack=|^Tests run|FAILURES|shortMsg|longMsg" <<< "$OUTPUT" | head -20
    fi
  done
  exit "$FAILED"
fi
"$AIR_ROOT/scripts/gradle.sh" --no-daemon "-PairAbi=$ABI" ${FILTER[@]+"${FILTER[@]}"} :app:connectedDebugAndroidTest
