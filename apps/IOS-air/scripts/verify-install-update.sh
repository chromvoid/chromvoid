#!/usr/bin/env bash
# Sequential headless XCTest host updates. Never uninstall the host or copy its key/data.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
DEVICE="${1:?usage: verify-install-update.sh OWNED_BOOTED_SIMULATOR_UDID}"
"$AIR_ROOT/scripts/verify-artifacts.sh" Fixture
"$AIR_ROOT/scripts/swift-style.sh" check
mkdir -p "$AIR_DERIVED_ROOT"
RUN_DIR="$(mktemp -d "$AIR_DERIVED_ROOT/install-update.XXXXXX")"
printf 'Installation verification evidence: %s\n' "$RUN_DIR"
for PHASE in prepare update rollback; do
  case "$PHASE" in
    prepare) VERSION=1; TEST=testPrepareForUpdate ;;
    update) VERSION=2; TEST=testReadAndWriteAfterUpdate ;;
    rollback) VERSION=1; TEST=testReadAfterRollbackAndRemoveFixture ;;
  esac
  printf 'Running %s with build %s\n' "$PHASE" "$VERSION"
  xcodebuild -project "$AIR_ROOT/ChromVoidAir.xcodeproj" -scheme AirUpdateVerification \
    -configuration Fixture -destination "platform=iOS Simulator,id=$DEVICE" \
    -derivedDataPath "$RUN_DIR/derived" -resultBundlePath "$RUN_DIR/$PHASE.xcresult" \
    -parallel-testing-enabled NO ARCHS=arm64 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- \
    CURRENT_PROJECT_VERSION="$VERSION" ENABLE_TESTABILITY=YES \
    "-only-testing:UpdateTests/InstallationContinuityTests/$TEST" test > "$RUN_DIR/$PHASE.log" 2>&1 || {
      tail -n 60 "$RUN_DIR/$PHASE.log"
      exit 1
    }
  xcrun xcresulttool get test-results summary --path "$RUN_DIR/$PHASE.xcresult" > "$RUN_DIR/$PHASE-summary.json"
  python3 - "$RUN_DIR/$PHASE-summary.json" "$DEVICE" <<'PY'
import json
import sys

with open(sys.argv[1]) as source:
    result = json.load(source)
if (result["result"] != "Passed" or result["totalTestCount"] != 1
        or result["passedTests"] != 1 or result["failedTests"] != 0
        or result["skippedTests"] != 0 or result["expectedFailures"] != 0):
    raise SystemExit("Expected exactly one executed, passing installation test")
devices = result["devicesAndConfigurations"]
if len(devices) != 1 or devices[0]["device"]["deviceId"] != sys.argv[2]:
    raise SystemExit("Installation test ran on an unexpected simulator")
PY
  grep -E '^AIR_INSTALL_EVIDENCE |Executed [0-9]+ test|\*\* TEST ' "$RUN_DIR/$PHASE.log"
done
printf 'All three installation phases passed. Evidence retained at %s\n' "$RUN_DIR"
