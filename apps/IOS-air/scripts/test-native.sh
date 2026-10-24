#!/usr/bin/env bash
# Lint, build once, then run the native tests as memory-friendly batches with one report.
#
#   scripts/test-native.sh [SIMULATOR_UDID] [fixture|release] [--ui | --only-ui]
#                          [--batches N] [--ui-batch-size M] [--resume-from K]
#                          [--filter SUBSTRING] [--logs DIR]
#
# The UDID may also come from AIR_SIMULATOR_UDID. By default only the BridgeTests batches
# run; --ui adds the AirUITests batches, --only-ui runs just those. Batches are numbered
# across the whole run (unit first, then UI) and each writes LOGS/xctest-<NN>-<kind>.log;
# --resume-from K keeps earlier logs and starts at batch K after a killed run.
# --filter keeps only suites/tests whose name contains SUBSTRING (case-insensitive).
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
PLANNER="$AIR_ROOT/scripts/test-batches.py"

DEVICE="${AIR_SIMULATOR_UDID:-}"
MODE=fixture
RUN_UNIT=1
RUN_UI=0
BATCHES=4
UI_BATCH_SIZE=4
RESUME_FROM=1
FILTER=""
LOGS="${TMPDIR:-/tmp}/chromvoid-ios-air-tests"
POSITIONAL=0

usage() { sed -n '2,12p' "$0"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ui) RUN_UI=1; shift ;;
    --only-ui) RUN_UI=1; RUN_UNIT=0; shift ;;
    --batches) BATCHES="${2:?--batches needs a number}"; shift 2 ;;
    --ui-batch-size) UI_BATCH_SIZE="${2:?--ui-batch-size needs a number}"; shift 2 ;;
    --resume-from) RESUME_FROM="${2:?--resume-from needs a batch number}"; shift 2 ;;
    --filter) FILTER="${2:?--filter needs a substring}"; shift 2 ;;
    --logs) LOGS="${2:?--logs needs a directory}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    --*) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
    *)
      case "$POSITIONAL" in
        0) DEVICE="$1" ;;
        1) MODE="$1" ;;
        *) echo "Unexpected argument: $1" >&2; usage >&2; exit 2 ;;
      esac
      POSITIONAL=$((POSITIONAL + 1)); shift ;;
  esac
done
[[ -n "$DEVICE" ]] || { echo "Pass SIMULATOR_UDID or set AIR_SIMULATOR_UDID" >&2; usage >&2; exit 2; }
case "$MODE" in fixture) CONFIG=Fixture ;; release) CONFIG=Release ;; *) echo "Expected fixture or release" >&2; exit 2 ;; esac
for number in "$BATCHES" "$UI_BATCH_SIZE" "$RESUME_FROM"; do
  [[ "$number" =~ ^[1-9][0-9]*$ ]] || { echo "Expected a positive number, got: $number" >&2; exit 2; }
done

# `${FILTER_ARGS[@]+"${FILTER_ARGS[@]}"}` keeps `set -u` happy on bash 3.2 when the array is empty.
FILTER_ARGS=()
[[ -n "$FILTER" ]] && FILTER_ARGS=(--filter "$FILTER")
plan() { python3 "$PLANNER" plan --batches "$BATCHES" --ui-batch-size "$UI_BATCH_SIZE" ${FILTER_ARGS[@]+"${FILTER_ARGS[@]}"} "$@"; }

UNIT_COUNT=0
UI_COUNT=0
[[ "$RUN_UNIT" == 1 ]] && UNIT_COUNT="$(plan --kind unit --format count)"
[[ "$RUN_UI" == 1 ]] && UI_COUNT="$(plan --kind ui --format count)"
TOTAL=$((UNIT_COUNT + UI_COUNT))
[[ "$TOTAL" -gt 0 ]] || { echo "The plan is empty (filter: '${FILTER}')" >&2; exit 2; }
[[ "$RESUME_FROM" -le "$TOTAL" ]] || { echo "--resume-from $RESUME_FROM exceeds the $TOTAL planned batches" >&2; exit 2; }
echo "Planned $UNIT_COUNT unit batches and $UI_COUNT UI batches; logs in $LOGS"

"$AIR_ROOT/scripts/swift-style.sh" check
python3 "$AIR_ROOT/scripts/third-party-notices.py" --check
python3 "$AIR_ROOT/scripts/xcstrings.py" check
python3 -m unittest discover -s "$AIR_ROOT/scripts/tests" -q
cd "$REPO_ROOT"
cargo test --locked -p chromvoid-air-ffi --lib
cargo test --locked -p chromvoid-air-ffi --features fixture --lib
"$AIR_ROOT/scripts/build-rust.sh" "$MODE"
xcodegen generate --spec "$AIR_ROOT/project.yml"

XCODEBUILD=(xcodebuild -project "$AIR_ROOT/ChromVoidAir.xcodeproj" -scheme ChromVoidAir
  -configuration "$CONFIG" -destination "platform=iOS Simulator,id=$DEVICE"
  -derivedDataPath "$AIR_DERIVED_ROOT/$MODE"
  -parallel-testing-enabled NO ARCHS=arm64 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- ENABLE_TESTABILITY=YES)
"${XCODEBUILD[@]}" build-for-testing

# A cold simulator makes the first batch pay the boot inside the xcodebuild timeout.
if ! BOOT_OUTPUT="$(xcrun simctl boot "$DEVICE" 2>&1)"; then
  case "$BOOT_OUTPUT" in
    *"current state: Booted"*) ;;
    *) echo "$BOOT_OUTPUT" >&2; exit 1 ;;
  esac
fi
xcrun simctl bootstatus "$DEVICE" >/dev/null
[[ "$RUN_UI" == 1 ]] && "$AIR_ROOT/scripts/prepare-ui-fixtures.sh" "$DEVICE" "$MODE"

mkdir -p "$LOGS"
# A fresh run discards old batch logs; a resume keeps the ones already finished.
[[ "$RESUME_FROM" == 1 ]] && rm -f "$LOGS"/xctest-*.log

# run_batch NAME -only-testing:... ; a failing batch is reported at the end, not fatal here.
run_batch() {
  local name="$1"; shift
  local log="$LOGS/xctest-$name.log"
  echo "== batch $name ($# suites) -> $log"
  if ! "${XCODEBUILD[@]}" test-without-building "$@" 2>&1 | tee "$log"; then
    echo "== batch $name failed; continuing with the next batch" >&2
  fi
}

INDEX=0
run_kind() {
  local kind="$1" count="$2" k line
  local only=()
  for ((k = 1; k <= count; k++)); do
    INDEX=$((INDEX + 1))
    if [[ "$INDEX" -lt "$RESUME_FROM" ]]; then
      echo "== skipping batch $(printf '%02d' "$INDEX")-$kind (resume from $RESUME_FROM)"
      continue
    fi
    only=()
    while IFS= read -r line; do
      [[ -n "$line" ]] && only+=("$line")
    done < <(plan --kind "$kind" --batch "$k" --format args)
    [[ "${#only[@]}" -gt 0 ]] || { echo "Planner returned an empty $kind batch $k" >&2; exit 2; }
    run_batch "$(printf '%02d' "$INDEX")-$kind" "${only[@]}"
  done
}
[[ "$RUN_UNIT" == 1 ]] && run_kind unit "$UNIT_COUNT"
[[ "$RUN_UI" == 1 ]] && run_kind ui "$UI_COUNT"

echo "== combined report ($LOGS)"
python3 "$PLANNER" report "$LOGS"
