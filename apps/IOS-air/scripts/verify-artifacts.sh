#!/usr/bin/env bash
set -euo pipefail
AIR_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
case "${1:?expected Xcode configuration}" in
  Fixture) EXPECTED=fixture ;;
  Release) EXPECTED=release ;;
  *) echo "Unsupported native configuration" >&2; exit 2 ;;
esac
MODE_FILE="$AIR_ROOT/Packages/ChromVoidBridge/.artifacts/mode"
if [[ ! -f "$MODE_FILE" ]] || [[ "$(cat "$MODE_FILE")" != "$EXPECTED" ]]; then
  echo "error: Rust artifacts do not match this configuration. Run apps/IOS-air/scripts/build-rust.sh $EXPECTED" >&2
  exit 1
fi
ARTIFACTS="$AIR_ROOT/Packages/ChromVoidBridge/.artifacts/AirFFIFFI.xcframework"
MANIFEST="$AIR_ROOT/Packages/ChromVoidBridge/Resources/AirFFIFFI/PrivacyInfo.xcprivacy"
VARIANT="${AIR_RUST_VARIANT:-ios-arm64}"
case "$VARIANT" in
  ios-arm64|ios-arm64-simulator) ;;
  *) echo "error: Unsupported Rust framework variant" >&2; exit 2 ;;
esac
PACKAGED_MANIFEST="$ARTIFACTS/$VARIANT/AirFFIFFI.framework/PrivacyInfo.xcprivacy"
if [[ ! -f "$PACKAGED_MANIFEST" ]]; then
  echo "error: Rust framework privacy resources are missing. Run apps/IOS-air/scripts/build-rust.sh $EXPECTED" >&2
  exit 1
fi
if ! cmp -s "$MANIFEST" "$PACKAGED_MANIFEST"; then
  echo "error: Rust framework privacy declaration is stale or unreadable. Run apps/IOS-air/scripts/build-rust.sh $EXPECTED" >&2
  exit 1
fi
