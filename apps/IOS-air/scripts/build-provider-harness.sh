#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
PLATFORM="${1:?usage: build-provider-harness.sh simulator|device UDID [DEVELOPMENT_TEAM]}"
DEVICE="${2:?explicit device identifier required}"
SIGNING=()
case "$PLATFORM" in
  simulator) DESTINATION="platform=iOS Simulator,id=$DEVICE"; SIGNING+=(CODE_SIGNING_ALLOWED=NO) ;;
  device) DESTINATION="platform=iOS,id=$DEVICE"; SIGNING+=("DEVELOPMENT_TEAM=${3:?development team required}") ;;
  *) echo "Expected simulator or device" >&2; exit 2 ;;
esac
"$AIR_ROOT/scripts/build-rust.sh" fixture
xcodegen generate --spec "$AIR_ROOT/project.yml"
xcodebuild -project "$AIR_ROOT/ChromVoidAir.xcodeproj" -scheme ProviderFeasibility \
  -configuration Fixture -destination "$DESTINATION" \
  -derivedDataPath "$AIR_DERIVED_ROOT/provider" ARCHS=arm64 "${SIGNING[@]}" build
