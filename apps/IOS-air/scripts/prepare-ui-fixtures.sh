#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
DEVICE="${1:?usage: prepare-ui-fixtures.sh SIMULATOR_UDID [fixture|release]}"
MODE="${2:-fixture}"
case "$MODE" in
  fixture) CONFIG=Fixture; BUNDLE=com.chromvoid.iosair.dev.tests.fixture ;;
  release) CONFIG=Release; BUNDLE=com.chromvoid.iosair.dev.tests ;;
  *) echo "Expected fixture or release" >&2; exit 2 ;;
esac
# The system-settings smoke uses only the isolated fixture containing app and its extension.
if [[ "$MODE" == fixture ]]; then
  xcrun simctl install "$DEVICE" "$AIR_DERIVED_ROOT/$MODE/Build/Products/$CONFIG-iphonesimulator/ChromVoidAir.app"
fi
# Import fixture files go only to the dedicated UI test host, never to vault storage.
xcrun simctl install "$DEVICE" "$AIR_DERIVED_ROOT/$MODE/Build/Products/$CONFIG-iphonesimulator/ChromVoidAirTestHost.app"
CONTAINER="$(xcrun simctl get_app_container "$DEVICE" "$BUNDLE" data)"
mkdir -p "$CONTAINER/Documents"
cp "$AIR_ROOT/Tests/Fixtures/credential-import.json" "$CONTAINER/Documents/Air Import Fixture.json"
cp "$REPO_ROOT/crates/core/tests/passmanager_domain_rpc/fixtures/bitwarden-credentials.json" "$CONTAINER/Documents/Air Bitwarden Fixture.json"
cp "$REPO_ROOT/crates/core/tests/passmanager_domain_rpc/fixtures/credentials.csv" "$CONTAINER/Documents/Air CSV Fixture.csv"
cp "$REPO_ROOT/crates/core/tests/passmanager_domain_rpc/fixtures/1password-credentials.1pux" "$CONTAINER/Documents/Air 1Password Fixture.1pux"
cp "$REPO_ROOT/crates/core/tests/passmanager_domain_rpc/fixtures/keepass-4.kdbx" "$CONTAINER/Documents/Air KeePass Fixture.kdbx"
cp "$AIR_ROOT/Tests/Fixtures/file-export.png" "$CONTAINER/Documents/Air Export Fixture.png"
cp "$AIR_ROOT/Tests/Fixtures/file-export.png" "$CONTAINER/Documents/Air Gallery Second.png"
cp "$AIR_ROOT/Tests/Fixtures/file-export.mp4" "$CONTAINER/Documents/Air Video Fixture.mp4"
# A geotagged photo in the simulator library exercises the Photo Library import path.
xcrun simctl addmedia "$DEVICE" "$AIR_ROOT/Tests/Fixtures/geo-photo.jpg" || true
