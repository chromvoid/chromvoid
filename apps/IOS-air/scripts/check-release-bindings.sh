#!/usr/bin/env bash
# The committed AirFFI.swift is the release ABI. A fixture build adds test-only exports and overwrites it,
# so check it against bindings generated from a host library built without the fixture feature.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
cd "$REPO_ROOT"
OUT="$AIR_ROOT/.build/bindings/release-check"
COMMITTED="$AIR_ROOT/Packages/ChromVoidBridge/Sources/ChromVoidBridge/Generated/AirFFI.swift"
# The generator first: building it relinks the library with the bindgen feature at the same path.
cargo build --locked -p chromvoid-air-ffi --features bindgen --bin air-bindgen
cargo build --locked -p chromvoid-air-ffi --lib
rm -rf "$OUT"
mkdir -p "$OUT"
"$REPO_ROOT/target/debug/air-bindgen" generate --library "$REPO_ROOT/target/debug/libchromvoid_air_ffi.a" \
  --language swift --config crates/air-ffi/uniffi.toml --out-dir "$OUT"
# build-rust.sh strips the whitespace-only lines UniFFI emits; compare the same form.
if ! sed 's/[[:blank:]]*$//' "$OUT/AirFFI.swift" | diff -u "$COMMITTED" -; then
  echo "AirFFI.swift is not the current release ABI; run apps/IOS-air/scripts/build-rust.sh release and commit it." >&2
  exit 1
fi
echo "AirFFI.swift matches the release ABI"
