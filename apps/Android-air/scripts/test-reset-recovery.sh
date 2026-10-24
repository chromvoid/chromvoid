#!/usr/bin/env bash
# Destructive only inside a new disposable emulator. The target process dies at
# clearApplicationUserData, so the host owns the four instrumentation stages.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
air_export_android_env
SERIAL="${1:?usage: test-reset-recovery.sh emulator-serial task-owned-avd-name [evidence-dir]}"
AVD="${2:?Supply the disposable CHROMVOID_RESET_RECOVERY_* AVD name}"
OUTPUT="${3:-$REPO_ROOT/.local/tasks/20261014-android-app-reset}"
ADB="$ANDROID_HOME/platform-tools/adb"
PACKAGE=com.chromvoid.air.dev
RUNNER=com.chromvoid.air.dev.test/androidx.test.runner.AndroidJUnitRunner
TEST_CLASS=com.chromvoid.air.AppResetRecoveryInstrumentationTest
EXTERNAL=/sdcard/Documents/ChromVoidResetRecovery

[[ "$SERIAL" =~ ^emulator-[0-9]+$ ]] || { echo 'Refusing a physical device.' >&2; exit 2; }
[[ "$AVD" =~ ^CHROMVOID_RESET_RECOVERY_[A-Za-z0-9_]+$ ]] || { echo 'Refusing an unrelated AVD.' >&2; exit 2; }
[[ "$("$ADB" -s "$SERIAL" shell getprop ro.kernel.qemu | tr -d '\r')" == 1 ]] || exit 2
ACTUAL_AVD="$("$ADB" -s "$SERIAL" shell getprop ro.boot.qemu.avd_name | tr -d '\r')"
[[ "$ACTUAL_AVD" == "$AVD" ]] || { echo "AVD mismatch: $ACTUAL_AVD" >&2; exit 2; }
if "$ADB" -s "$SERIAL" shell pm path "$PACKAGE" | grep -q '^package:'; then
  echo 'Refusing an already installed app. Start a NEW disposable AVD.' >&2
  exit 2
fi
if [[ -n "$("$ADB" -s "$SERIAL" shell ls "$EXTERNAL" 2>/dev/null | tr -d '\r')" ]]; then
  echo 'Refusing an existing recovery evidence directory. Start a NEW disposable AVD.' >&2
  exit 2
fi
EXPECTED="$(sed -n 's/.*EXPECTED: String = "\([0-9a-f]*\)".*/\1/p' \
  "$AIR_ROOT/bridge/src/main/kotlin/com/chromvoid/air/bridge/BuildFingerprint.kt")"
BUILT="$(sed -n 's/^fingerprint=//p' "$AIR_ROOT/bridge/src/main/jniLibs/.build-provenance" 2>/dev/null || true)"
[[ "$EXPECTED" == "$BUILT" ]] || { echo 'Run scripts/build-rust.sh fixture first.' >&2; exit 1; }
mkdir -p "$OUTPUT"
printf 'serial=%s\navd=%s\nfingerprint=%s\n' "$SERIAL" "$AVD" "$EXPECTED" > "$OUTPUT/environment.txt"
"$ADB" -s "$SERIAL" shell getprop ro.build.fingerprint >> "$OUTPUT/environment.txt"
export ANDROID_SERIAL="$SERIAL"
ABI="$("$ADB" -s "$SERIAL" shell getprop ro.product.cpu.abi | tr -d '\r')"
"$AIR_ROOT/scripts/gradle.sh" --no-daemon --no-build-cache "-PairAbi=$ABI" :app:assembleDebug :app:assembleDebugAndroidTest \
  > "$OUTPUT/build.log" 2>&1
"$ADB" -s "$SERIAL" install -r "$AIR_ROOT/app/build/outputs/apk/debug/app-debug.apk"
"$ADB" -s "$SERIAL" install -r "$AIR_ROOT/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk"
"$ADB" -s "$SERIAL" shell mkdir -p "$EXTERNAL"
"$ADB" -s "$SERIAL" shell input keyevent KEYCODE_WAKEUP
"$ADB" -s "$SERIAL" shell wm dismiss-keyguard
# Neither Compose idling nor UiAutomation waits for WindowManager animations, so
# captures could catch a dialog mid enter-animation. This emulator runs without them.
for scale in window_animation_scale transition_animation_scale animator_duration_scale; do
  "$ADB" -s "$SERIAL" shell settings put global "$scale" 0
  [[ "$("$ADB" -s "$SERIAL" shell settings get global "$scale" | tr -d '\r')" == 0 ]] || exit 1
  printf '%s=0\n' "$scale" >> "$OUTPUT/environment.txt"
done

run_stage() {
  local method="$1" theme="$2" log="$OUTPUT/$1-$2.log" attempt
  shift 2
  for attempt in 1 2; do
    "$ADB" -s "$SERIAL" shell am force-stop "$PACKAGE"
    "$ADB" -s "$SERIAL" shell cmd statusbar collapse
    "$ADB" -s "$SERIAL" shell am instrument -w -r \
      -e class "$TEST_CLASS#$method" \
      -e resetRecovery owned-emulator -e recoveryAvd "$AVD" -e captureTheme "$theme" \
      "$@" "$RUNNER" > "$log" 2>&1
    if grep -q '^OK (1 test)' "$log"; then
      echo "PASS $method ($theme)"
      return 0
    fi
    # OS task cleanup can kill a newly forked runner before it attaches. Retry
    # restore once only if no test started; a running restore is never replayed.
    if [[ "$method" == restoreExternalBackupAndVerifyContents && "$attempt" == 1 ]] &&
      grep -q '^INSTRUMENTATION_RESULT: shortMsg=failed to attach' "$log" &&
      ! grep -q '^INSTRUMENTATION_STATUS: test=' "$log"; then
      mv "$log" "$OUTPUT/$method-$theme-attach-failure.log"
      "$ADB" -s "$SERIAL" shell am wait-for-broadcast-idle > "$OUTPUT/reset-broadcast-idle.log"
      continue
    fi
    cat "$log" >&2
    return 1
  done
}

"$ADB" -s "$SERIAL" shell cmd uimode night no
run_stage prepareExternalBackup light
BACKUP="$("$ADB" -s "$SERIAL" shell ls "$EXTERNAL" | tr -d '\r')"
[[ "$BACKUP" =~ ^chromvoid-backup-[0-9]{8}-[0-9]{6}$ ]] || { echo "Unexpected backup: $BACKUP" >&2; exit 1; }
"$ADB" -s "$SERIAL" shell "find '$EXTERNAL/$BACKUP' -type f -exec sha256sum {} \\;" \
  | tr -d '\r' | sort > "$OUTPUT/backup-before.sha256"
[[ -s "$OUTPUT/backup-before.sha256" ]] || exit 1
run_stage cancelResetPreservesVaultAndFile light
"$ADB" -s "$SERIAL" shell cmd uimode night yes
run_stage cancelResetPreservesVaultAndFile dark
"$ADB" -s "$SERIAL" shell cmd uimode night no
"$ADB" -s "$SERIAL" shell wm size 945x2048
run_stage cancelResetPreservesVaultAndFile ru-compact -e captureLocale ru
"$ADB" -s "$SERIAL" shell wm size reset
"$ADB" -s "$SERIAL" pull /sdcard/Pictures/ChromVoidResetRecovery "$OUTPUT/screenshots"

# The app is selected as the emulator's Autofill service, matching an actively used installation.
AUTOFILL="$PACKAGE/com.chromvoid.app.ChromVoidAutofillService"
"$ADB" -s "$SERIAL" shell settings put secure autofill_service "$AUTOFILL"
"$ADB" -s "$SERIAL" shell settings get secure autofill_service > "$OUTPUT/autofill-before-reset.txt"
grep -q "$AUTOFILL" "$OUTPUT/autofill-before-reset.txt"

# clearApplicationUserData must terminate the target and therefore its runner.
# The following stage's welcome assertion proves the reset actually happened.
"$ADB" -s "$SERIAL" shell am force-stop "$PACKAGE"
"$ADB" -s "$SERIAL" shell am instrument -w -r \
  -e class "$TEST_CLASS#confirmResetTerminatesItsOwnProcess" \
  -e resetRecovery owned-emulator -e recoveryAvd "$AVD" "$RUNNER" \
  > "$OUTPUT/confirm-reset.log" 2>&1 || true
grep -q RESET_RECOVERY_FINAL_CONFIRMATION_REACHED "$OUTPUT/confirm-reset.log"
grep -qi 'Process crashed' "$OUTPUT/confirm-reset.log"
"$ADB" -s "$SERIAL" shell "find '$EXTERNAL/$BACKUP' -type f -exec sha256sum {} \\;" \
  | tr -d '\r' | sort > "$OUTPUT/backup-after.sha256"
cmp "$OUTPUT/backup-before.sha256" "$OUTPUT/backup-after.sha256"
"$ADB" -s "$SERIAL" shell cmd uimode night no
run_stage restoreExternalBackupAndVerifyContents light -e backupFolder "$BACKUP"
"$ADB" -s "$SERIAL" pull /sdcard/Pictures/ChromVoidResetRecovery/. "$OUTPUT/screenshots/"
"$ADB" -s "$SERIAL" pull "$EXTERNAL/$BACKUP" "$OUTPUT/backup"
"$ADB" -s "$SERIAL" logcat -d -v threadtime > "$OUTPUT/logcat.txt"
printf 'PASS app reset killed its process; welcome returned; external backup survived byte-for-byte; restore reopened the record and exact document bytes.\n' \
  | tee "$OUTPUT/result.txt"
echo "Evidence: $OUTPUT"
