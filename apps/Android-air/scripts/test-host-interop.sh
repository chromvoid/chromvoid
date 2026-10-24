#!/usr/bin/env bash
# The phone's host against a real computer, with synthetic storage only: the
# repository's relay on this Mac, its port reversed to the device, the
# desktop's own pairing and remote adapter (the desktop crate's
# desktop_observes_native_ui_revoke) and the app's Connections, driven by
# ConnectionsInteropInstrumentationTest. No production relay, desktop UI or
# live vault is involved; the desktop identity is temporary.
#
# The two sides hand over the invitation and their signals as files in the
# app's storage, read and written through run-as:
#   phone   -> invitation.json  the code and offer shown on the phone
#   desktop -> UI_PEER_CONNECTED, then the phone dismisses one revoke -> cancelled
#   script  -> invitation.revoke, and after UI_REVOKE_ARMED -> armed on the phone
#   phone   confirms the revoke; the desktop sees its connection end.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
air_export_android_env
SERIAL="${1:-${ANDROID_SERIAL:-}}"
if [[ -z "$SERIAL" ]]; then
  echo "usage: test-host-interop.sh <adb-serial>   (or set ANDROID_SERIAL)" >&2
  exit 2
fi
ADB="$ANDROID_HOME/platform-tools/adb"
PACKAGE="com.chromvoid.air.dev"
DESKTOP_TEST="network::ios_pairing::native_host_interop_tests::desktop_observes_native_ui_revoke"
LOGS="$(mktemp -d "${TMPDIR:-/tmp}/chromvoid-android-interop.XXXXXX")"
RELAY_PID=""
UI_PID=""
DESKTOP_PID=""
PORT=""
cleanup() {
  local pid
  for pid in "$DESKTOP_PID" "$UI_PID" "$RELAY_PID"; do
    if [[ -n "$pid" ]]; then kill -TERM "$pid" 2>/dev/null || true; fi
  done
  wait 2>/dev/null || true
  if [[ -n "$PORT" ]]; then "$ADB" -s "$SERIAL" reverse --remove "tcp:$PORT" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf 'Interoperability logs: %s\n' "$LOGS"

# wait_for SECONDS DESCRIPTION COMMAND...: polls COMMAND until it succeeds.
wait_for() {
  local seconds="$1" what="$2"
  shift 2
  local deadline=$((SECONDS + seconds))
  until "$@"; do
    if ((SECONDS >= deadline)); then
      echo "Timed out waiting for $what." >&2
      return 1
    fi
    sleep 1
  done
}
alive() { kill -0 "$1" 2>/dev/null; }
on_device() { "$ADB" -s "$SERIAL" shell run-as "$PACKAGE" ls "files/interop/$1" >/dev/null 2>&1; }
in_log() { grep -q "$1" "$2"; }
phone_has() {
  on_device "$1" && return 0
  alive "$UI_PID" || { tail -40 "$LOGS/ui.log" >&2; echo 'The phone test ended early.' >&2; exit 1; }
  return 1
}
desktop_said() {
  in_log "$1" "$LOGS/desktop.log" && return 0
  alive "$DESKTOP_PID" || { tail -40 "$LOGS/desktop.log" >&2; echo 'The desktop test ended early.' >&2; exit 1; }
  return 1
}

cd "$REPO_ROOT"
# Compiled first, so building never eats the invitation's five minutes.
echo 'Building the desktop side…'
cargo test --locked --manifest-path apps/chromvoid/src-tauri/Cargo.toml --lib "$DESKTOP_TEST" --no-run \
  > "$LOGS/desktop-build.log" 2>&1

RELAY_PORT=0 METRICS_PORT=0 bun apps/IOS-air/tools/host-relay.ts "$LOGS/ready.json" > "$LOGS/relay.log" 2>&1 &
RELAY_PID=$!
wait_for 30 'the local relay' test -f "$LOGS/ready.json"
RELAY="$(bun -e 'process.stdout.write((await Bun.file(process.argv[1]).json()).url)' "$LOGS/ready.json")"
PORT="${RELAY##*:}"
# The phone reaches the Mac's loopback relay on its own loopback, which the host admits in debug builds.
"$ADB" -s "$SERIAL" reverse "tcp:$PORT" "tcp:$PORT" >/dev/null
echo "Relay $RELAY, reversed to $SERIAL."

AIR_TEST_CLASS=ConnectionsInteropInstrumentationTest AIR_TEST_ARGS="relay=$RELAY" \
  "$AIR_ROOT/scripts/test-ui.sh" "$SERIAL" > "$LOGS/ui.log" 2>&1 &
UI_PID=$!
echo 'Waiting for the phone to pair…'
wait_for 900 'the phone invitation' phone_has invitation.json
"$ADB" -s "$SERIAL" shell run-as "$PACKAGE" cat files/interop/invitation.json > "$LOGS/invitation.json"

# The desktop must keep the phone as the Android phone its hello says it is.
CHROMVOID_NATIVE_UI_INVITATION="$LOGS/invitation.json" CHROMVOID_NATIVE_UI_PLATFORM=android \
  cargo test --locked --manifest-path apps/chromvoid/src-tauri/Cargo.toml --lib "$DESKTOP_TEST" \
  -- --exact --ignored --nocapture > "$LOGS/desktop.log" 2>&1 &
DESKTOP_PID=$!
wait_for 180 'the desktop to connect' desktop_said UI_PEER_CONNECTED
echo 'The desktop is connected; the phone names it and dismisses one revoke.'
wait_for 180 'the dismissed revoke' phone_has cancelled
touch "$LOGS/invitation.revoke"
wait_for 180 'the desktop to arm the revoke' desktop_said UI_REVOKE_ARMED
"$ADB" -s "$SERIAL" shell run-as "$PACKAGE" touch files/interop/armed
echo 'Armed; the phone revokes the computer.'

DESKTOP_STATUS=0
wait "$DESKTOP_PID" || DESKTOP_STATUS=$?
DESKTOP_PID=""
UI_STATUS=0
wait "$UI_PID" || UI_STATUS=$?
UI_PID=""
if [[ "$DESKTOP_STATUS" != 0 ]] || ! grep -q '^test result: ok\. 1 passed; 0 failed; 0 ignored;' "$LOGS/desktop.log"; then
  tail -40 "$LOGS/desktop.log" >&2
  echo 'The desktop side did not pass.' >&2
  exit 1
fi
RESULTS="$AIR_ROOT/app/build/outputs/androidTest-results/connected/debug"
if [[ "$UI_STATUS" != 0 ]] || ! grep -rq 'tests="1" failures="0" errors="0" skipped="0"' "$RESULTS"; then
  tail -40 "$LOGS/ui.log" >&2
  echo 'The phone side did not pass.' >&2
  exit 1
fi
echo 'Phone and desktop both passed.'
