#!/bin/bash
# Produces landing-page material from the native iOS Air app running in the Simulator:
# named screenshots of the vault, a credential with its live code, Files and a note,
# plus a short screen recording of the same tour. Everything shown is synthetic
# (see Tests/UI/AirLandingCaptureTests.swift); nothing here is a verification step.
#
# Usage:
#   scripts/capture-landing-media.sh [--device UDID] [--locale en|ru] [--appearance light|dark]
#                                    [--out DIR] [--build] [--clean] [--fresh] [--no-video] [--pace SECONDS]
#
# Defaults: the booted "IOS-air" simulator, en, light, video on,
# output to backend/landings-next/design/sources/. Requires fixture products from
# `scripts/test-native.sh <udid> fixture` (or pass --build to build them here: this swaps the
# shared Rust artifacts to fixture mode; finish with `scripts/build-rust.sh release` afterwards).
# --clean wipes this script's derived data first: required after the artifacts were built in the
# other mode, otherwise Xcode reuses stale precompiled modules and the test build fails.
# The Xcode build lives in its own derived data (`landing`) so it never races the verification
# builds in `fixture`; the Rust artifacts are rebuilt only when they are not already in fixture mode
# (pass --rust to force it). --fresh uninstalls the test host first so the demo vault is seeded anew.
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
MODE=fixture
CONFIG=Fixture
DEVICE="${AIR_SIMULATOR_UDID:-}"
LOCALE=en
APPEARANCE=light
OUT="$REPO_ROOT/backend/landings-next/design/sources"
BUILD=0
CLEAN=0
RUST=0
FRESH=0
DERIVED="$AIR_DERIVED_ROOT/landing"
VIDEO=1
PACE=1.6
PASSWORD="${AIR_LANDING_PASSWORD:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --device) DEVICE="$2"; shift 2 ;;
    --locale) LOCALE="$2"; shift 2 ;;
    --appearance) APPEARANCE="$2"; shift 2 ;;
    --out) OUT="$2"; shift 2 ;;
    --pace) PACE="$2"; shift 2 ;;
    --build) BUILD=1; shift ;;
    --clean) BUILD=1; CLEAN=1; shift ;;
    --rust) BUILD=1; RUST=1; shift ;;
    --fresh) FRESH=1; shift ;;
    --no-video) VIDEO=0; shift ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
case "$LOCALE" in en|ru) ;; *) echo "--locale must be en or ru" >&2; exit 2 ;; esac
# One demo vault per locale: the vault is keyed by its password, not by the UI language.
[[ -n "$PASSWORD" ]] || PASSWORD="air-landing-demo-$LOCALE"
case "$APPEARANCE" in light|dark) ;; *) echo "--appearance must be light or dark" >&2; exit 2 ;; esac

if [[ -z "$DEVICE" ]]; then
  DEVICE="$(xcrun simctl list devices booted | grep -o '[0-9A-F-]\{36\}' | head -1 || true)"
fi
[[ -n "$DEVICE" ]] || { echo "No booted simulator; pass --device UDID" >&2; exit 2; }
xcrun simctl bootstatus "$DEVICE" -b >/dev/null

PRODUCTS="$DERIVED/Build/Products"
XCTESTRUN="$(ls "$PRODUCTS"/ChromVoidAir_iphonesimulator*.xctestrun 2>/dev/null | head -1 || true)"
if [[ $BUILD -eq 1 || -z "$XCTESTRUN" ]]; then
  echo "== Building fixture test products"
  [[ $CLEAN -eq 1 ]] && rm -rf "$DERIVED"
  if [[ $RUST -eq 1 || "$(cat "$AIR_ROOT/Packages/ChromVoidBridge/.artifacts/mode" 2>/dev/null)" != "$MODE" ]]; then
    "$AIR_ROOT/scripts/build-rust.sh" "$MODE"
  fi
  xcodegen generate --spec "$AIR_ROOT/project.yml"
  xcodebuild -project "$AIR_ROOT/ChromVoidAir.xcodeproj" -scheme ChromVoidAir \
    -configuration "$CONFIG" -destination "platform=iOS Simulator,id=$DEVICE" \
    -derivedDataPath "$DERIVED" -quiet \
    ARCHS=arm64 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- ENABLE_TESTABILITY=YES build-for-testing
  XCTESTRUN="$(ls "$PRODUCTS"/ChromVoidAir_iphonesimulator*.xctestrun | head -1)"
fi
# Same seeding as prepare-ui-fixtures.sh, but from this script's products.
[[ $FRESH -eq 1 ]] && xcrun simctl uninstall "$DEVICE" com.chromvoid.iosair.dev.tests.fixture >/dev/null 2>&1 || true
xcrun simctl install "$DEVICE" "$PRODUCTS/$CONFIG-iphonesimulator/ChromVoidAir.app"
xcrun simctl install "$DEVICE" "$PRODUCTS/$CONFIG-iphonesimulator/ChromVoidAirTestHost.app"

# A copy of the xctestrun next to the original keeps its __TESTROOT__ paths valid.
RUN="$PRODUCTS/ChromVoidAir_landing.xctestrun"
cp "$XCTESTRUN" "$RUN"
for pair in "AIR_LANDING_CAPTURE=1" "AIR_LANDING_LOCALE=$LOCALE" "AIR_LANDING_PACE=$PACE" "AIR_LANDING_PASSWORD=$PASSWORD"; do
  plutil -replace "AirUITests.EnvironmentVariables.${pair%%=*}" -string "${pair#*=}" "$RUN"
done

WORK="$(mktemp -d "${TMPDIR:-/tmp}/air-landing-XXXXXX")"
PREVIOUS_APPEARANCE="$(xcrun simctl ui "$DEVICE" appearance 2>/dev/null || echo light)"
RECORDER=""
cleanup() {
  if [[ -n "$RECORDER" ]]; then
    pkill -INT -P "$RECORDER" 2>/dev/null || true
    kill "$RECORDER" 2>/dev/null || true
    wait "$RECORDER" 2>/dev/null || true
  fi
  xcrun simctl status_bar "$DEVICE" clear >/dev/null 2>&1 || true
  xcrun simctl ui "$DEVICE" appearance "$PREVIOUS_APPEARANCE" >/dev/null 2>&1 || true
  rm -f "$RUN"
}
trap cleanup EXIT

xcrun simctl ui "$DEVICE" appearance "$APPEARANCE"
xcrun simctl status_bar "$DEVICE" override --time 9:41 --dataNetwork wifi --wifiMode active --wifiBars 3 \
  --cellularMode active --cellularBars 4 --operatorName '' --batteryState charged --batteryLevel 100

run_tour() {
  local result="$1"
  xcodebuild test-without-building -xctestrun "$RUN" \
    -destination "platform=iOS Simulator,id=$DEVICE" -parallel-testing-enabled NO \
    -only-testing:AirUITests/AirLandingCaptureTests/testLandingTour \
    -resultBundlePath "$result" -quiet
}

# First pass seeds the synthetic vault when it is empty (skipped when it already exists);
# the recorded pass then contains only unlock and the tour.
echo "== Preparing the synthetic vault"
run_tour "$WORK/seed.xcresult"

HOST_BUNDLE=com.chromvoid.iosair.dev.tests.fixture
host_running() {
  xcrun simctl spawn "$DEVICE" launchctl list 2>/dev/null | grep -q "$HOST_BUNDLE"
}
# The recording starts when the test host appears and stops when xcodebuild returns. It is not
# bound to the host process: XCTest may launch and kill the host before the tour starts (seen on a
# fresh simulator, minutes before the test ran), which used to end the recording on the lock screen.
# Encoding cuts the file down to the tour using this run's vault screenshot.
# xcodebuild stays in the foreground; only the watcher runs in the background.
TOUR_DONE="$WORK/tour.done"
record_watcher() {
  local waited=0
  while ! host_running; do
    [[ ! -f "$TOUR_DONE" ]] || { echo "Test host never appeared; no recording" >&2; return 1; }
    sleep 0.5; waited=$((waited + 1))
    [[ $waited -lt 3600 ]] || { echo "Test host did not start" >&2; return 1; }
  done
  xcrun simctl io "$DEVICE" recordVideo --codec h264 --mask black --force "$WORK/tour.mov" &
  local recorder=$!
  while [[ ! -f "$TOUR_DONE" ]]; do sleep 0.5; done
  kill -INT "$recorder"
  wait "$recorder" || true
}

if [[ $VIDEO -eq 1 ]]; then
  echo "== Recording the tour"
  record_watcher &
  RECORDER=$!
  run_tour "$WORK/tour.xcresult" || { touch "$TOUR_DONE"; exit 1; }
  touch "$TOUR_DONE"
  wait "$RECORDER" || true
  RECORDER=""
else
  run_tour "$WORK/tour.xcresult"
fi

echo "== Exporting screenshots"
xcrun xcresulttool export attachments --path "$WORK/tour.xcresult" --output-path "$WORK/attachments" >/dev/null
mkdir -p "$OUT"
SUFFIX="-$LOCALE-$APPEARANCE"
python3 - "$WORK/attachments/manifest.json" "$WORK/attachments" "$OUT" "$SUFFIX" <<'EOF'
import json, shutil, sys
from pathlib import Path
manifest, source, out, suffix = sys.argv[1], Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4]
seen = set()
for test in json.load(open(manifest)):
    for item in test["attachments"]:
        name = item["suggestedHumanReadableName"].split("_")[0]
        if not name.startswith("landing-") or name in seen:
            continue
        seen.add(name)
        target = out / f"ios-air-{name[len('landing-'):]}{suffix}.png"
        shutil.copyfile(source / item["exportedFileName"], target)
        print(f"  {target}")
        if name == "landing-vault" and suffix == "-en-light":
            shutil.copyfile(source / item["exportedFileName"], out / "ios-air-vault.png")
            print(f"  {out / 'ios-air-vault.png'} (used by landings-next/scripts/prepare-assets.ts)")
if not seen:
    sys.exit("No landing-* attachments were exported; the tour did not reach its screens")
EOF

if [[ $VIDEO -eq 1 ]]; then
  echo "== Encoding the recording"
  if command -v ffmpeg >/dev/null; then
    # Trim by scene changes: XCTest attaches for several seconds before the first tap, and the app
    # is torn down a few seconds after the last one. Keep 1.5 s before the first change and 2 s after
    # the last one, ignoring the recorder's first frame and the termination flash at the very end.
    DURATION="$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$WORK/tour.mov")"
    CHANGES="$(ffmpeg -loglevel info -i "$WORK/tour.mov" -vf "select='gt(scene,0.015)',showinfo" -f null - 2>&1 \
      | grep -o 'pts_time:[0-9.]*' | cut -d: -f2 | tr '\n' ' ' || true)"
    read -r TRIM_START TRIM_END <<< "$(printf '%s' "$CHANGES" | python3 -c '
import sys
duration = float(sys.argv[1])
changes = [float(t) for t in sys.stdin.read().split() if 1.0 <= float(t) <= duration - 1.0]
start = max(0.0, changes[0] - 1.5) if changes else 0.0
end = min(duration - 0.3, changes[-1] + 2.0) if changes else duration
print(f"{start:.2f} {end:.2f}")
' "$DURATION")"
    # The site loops the tour from the vault, never from the lock screen: it starts at the first frame
    # that matches this run's vault screenshot and ends at the last one (the tour returns to the vault),
    # which drops the unlock, any idle launch before it and the teardown after it. Grey SSIM at
    # thumbnail size: the vault scores ~0.96, the lock screen and other screens stay below ~0.9.
    # Scene trimming stays the fallback.
    VAULT_SHOT="$OUT/ios-air-vault$SUFFIX.png"
    if [[ -f "$VAULT_SHOT" ]]; then
      VAULT_SPAN="$(ffmpeg -loglevel error -i "$WORK/tour.mov" -loop 1 -i "$VAULT_SHOT" -lavfi \
        "[0:v]scale=180:390,format=gray[a];[1:v]scale=180:390,format=gray[b];[a][b]ssim=shortest=1,metadata=print:key=lavfi.ssim.All:file=-" \
        -f null - 2>/dev/null | python3 -c '
import re, sys
# Frames arrive only when the screen changes, so the final vault frame is held until the next one:
# keep up to one second of that hold, stopping short of whatever frame replaces it.
time, frames = None, []
for line in sys.stdin:
    found = re.search(r"pts_time:([0-9.]+)", line)
    if found:
        time = float(found.group(1))
    score = re.search(r"lavfi.ssim.All=([0-9.]+)", line)
    if score and time is not None and time >= 1.0:
        frames.append((time, float(score.group(1)) >= 0.93))
matches = [t for t, vault in frames if vault]
if len(matches) > 1 and matches[-1] - matches[0] > 5:
    after = [t for t, vault in frames if t > matches[-1] and not vault]
    end = min(matches[-1] + 1.0, after[0] - 0.05 if after else float(sys.argv[1]))
    print(f"{matches[0]:.2f} {end:.2f}")
' "$DURATION" || true)"
      if [[ -n "$VAULT_SPAN" ]]; then
        read -r TRIM_START TRIM_END <<< "$VAULT_SPAN"
      else
        echo "  the vault screenshot matched no span of the recording; trimming by scene changes" >&2
      fi
    fi
    echo "  keeping ${TRIM_START}s..${TRIM_END}s of the ${DURATION%.*}s recording"
    # 1080 px tall, even dimensions, faststart for progressive playback; the vault screenshot is the poster.
    ffmpeg -loglevel error -y -ss "$TRIM_START" -to "$TRIM_END" -i "$WORK/tour.mov" -vf "scale=-2:1080" \
      -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p -an -movflags +faststart "$OUT/ios-air-tour$SUFFIX.mp4"
    ffmpeg -loglevel error -y -ss "$TRIM_START" -to "$TRIM_END" -i "$WORK/tour.mov" -vf "scale=-2:1080" \
      -c:v libvpx-vp9 -crf 34 -b:v 0 -row-mt 1 -an "$OUT/ios-air-tour$SUFFIX.webm"
    echo "  $OUT/ios-air-tour$SUFFIX.mp4"
    echo "  $OUT/ios-air-tour$SUFFIX.webm"
  else
    cp "$WORK/tour.mov" "$OUT/ios-air-tour$SUFFIX.mov"
    echo "  ffmpeg not found; kept $OUT/ios-air-tour$SUFFIX.mov"
  fi
fi
echo "== Done. Raw results: $WORK"
