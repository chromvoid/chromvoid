#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
cd "$REPO_ROOT"
MODE="${1:?usage: build-rust.sh fixture|release}"
CARGO_FLAGS=()
SIGNING_FLAGS=()
if [[ -n "${AIR_SIGNING_IDENTITY:-}" || -n "${AIR_SIGNING_TEAM:-}" ]]; then
  SIGNING_FLAGS+=(--signing-identity "${AIR_SIGNING_IDENTITY:-}" --signing-team "${AIR_SIGNING_TEAM:-}")
fi
case "$MODE" in
  fixture) CARGO_FLAGS+=(--features fixture); PROFILE=debug ;;
  release) CARGO_FLAGS+=(--release); PROFILE=release ;;
  *) echo "Expected fixture or release" >&2; exit 2 ;;
esac
# Default host is Apple Silicon. Do not claim an Intel simulator slice that was not built.
# The fixture feature is forbidden in --release, so fixture builds use the dev profile. Keep
# codegen optimized there: unoptimized ChaCha20/BLAKE3 make every 64 KiB vault read cost ~12 ms
# and turn simulator timings into noise. Override with AIR_FIXTURE_OPT_LEVEL=0 when debugging Rust.
if [[ "$MODE" == fixture ]]; then
  export CARGO_PROFILE_DEV_OPT_LEVEL="${AIR_FIXTURE_OPT_LEVEL:-3}"
fi
for TARGET in aarch64-apple-ios aarch64-apple-ios-sim; do
  IPHONEOS_DEPLOYMENT_TARGET=17.0 cargo build --locked -p chromvoid-air-ffi --lib --target "$TARGET" "${CARGO_FLAGS[@]}"
done
unset CARGO_PROFILE_DEV_OPT_LEVEL
BINDINGS="$AIR_ROOT/.build/bindings/$MODE"
mkdir -p "$BINDINGS"
cargo run --locked -p chromvoid-air-ffi --features bindgen --bin air-bindgen -- \
  generate --library "$REPO_ROOT/target/aarch64-apple-ios-sim/$PROFILE/libchromvoid_air_ffi.a" \
  --language swift --config crates/air-ffi/uniffi.toml --out-dir "$BINDINGS"
# UniFFI emits whitespace-only lines; keep checked-in output deterministic and diff-clean.
sed 's/[[:blank:]]*$//' "$BINDINGS/AirFFI.swift" > "$AIR_ROOT/Packages/ChromVoidBridge/Sources/ChromVoidBridge/Generated/AirFFI.swift"
ARTIFACTS="$AIR_ROOT/Packages/ChromVoidBridge/.artifacts"
python3 "$AIR_ROOT/scripts/package-rust-framework.py" \
  --device-library "$REPO_ROOT/target/aarch64-apple-ios/$PROFILE/libchromvoid_air_ffi.a" \
  --simulator-library "$REPO_ROOT/target/aarch64-apple-ios-sim/$PROFILE/libchromvoid_air_ffi.a" \
  --bindings "$BINDINGS" \
  --manifest "$AIR_ROOT/Packages/ChromVoidBridge/Resources/AirFFIFFI/PrivacyInfo.xcprivacy" \
  --output "$ARTIFACTS/AirFFIFFI.xcframework" ${SIGNING_FLAGS[@]+"${SIGNING_FLAGS[@]}"}
printf '%s\n' "$MODE" > "$ARTIFACTS/mode"
"$AIR_ROOT/scripts/generate-contracts.sh"
