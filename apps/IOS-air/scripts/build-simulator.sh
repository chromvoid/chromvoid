#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
DEVICE="${1:?usage: build-simulator.sh SIMULATOR_UDID [fixture|release]}"
MODE="${2:-fixture}"
python3 "$AIR_ROOT/scripts/third-party-notices.py" --check
"$AIR_ROOT/scripts/build-rust.sh" "$MODE"
xcodegen generate --spec "$AIR_ROOT/project.yml"
case "$MODE" in fixture) CONFIG=Fixture ;; release) CONFIG=Release ;; esac
xcodebuild -project "$AIR_ROOT/ChromVoidAir.xcodeproj" -scheme ChromVoidAir \
  -configuration "$CONFIG" -destination "platform=iOS Simulator,id=$DEVICE" \
  -derivedDataPath "$AIR_DERIVED_ROOT/$MODE" ARCHS=arm64 CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- build
