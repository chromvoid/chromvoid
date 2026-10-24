#!/usr/bin/env bash
# Build the shared mobile ABI for Android and regenerate the Kotlin bindings.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
cd "$REPO_ROOT"

MODE="${1:?usage: build-rust.sh fixture|release}"
CARGO_FLAGS=()
case "$MODE" in
  fixture) CARGO_FLAGS+=(--features fixture); PROFILE=debug ;;
  release) CARGO_FLAGS+=(--release); PROFILE=release ;;
  *) echo "Expected fixture or release" >&2; exit 2 ;;
esac

REQUESTED_ABIS="${AIR_ANDROID_ABIS-arm64-v8a x86_64}"
IFS=$' \t\n' read -r -d '' -a ANDROID_ABIS < <(printf '%s\0' "${REQUESTED_ABIS//,/ }")
if [[ -z "${ANDROID_ABIS[*]:-}" ]]; then
  echo "AIR_ANDROID_ABIS must contain at least one ABI: arm64-v8a or x86_64." >&2
  exit 2
fi
NDK_TARGETS=()
BINDGEN_TARGET=aarch64-linux-android
for ABI in "${ANDROID_ABIS[@]}"; do
  case "$ABI" in
    arm64-v8a) ;;
    x86_64) BINDGEN_TARGET=x86_64-linux-android ;;
    *) echo "Unknown ABI in AIR_ANDROID_ABIS: $ABI. Expected arm64-v8a or x86_64." >&2; exit 2 ;;
  esac
  if [[ " ${NDK_TARGETS[*]:-} " == *" $ABI "* ]]; then
    echo "Duplicate ABI in AIR_ANDROID_ABIS: $ABI." >&2
    exit 2
  fi
  NDK_TARGETS+=(--target "$ABI")
done
air_export_android_env

# The fixture feature is forbidden in --release, so fixture builds use the dev
# profile. Keep codegen optimized there: unoptimized ChaCha20/BLAKE3 make every
# 64 KiB vault read cost ~12 ms and turn emulator timings into noise. Override
# with AIR_FIXTURE_OPT_LEVEL=0 when debugging Rust itself.
if [[ "$MODE" == fixture ]]; then
  export CARGO_PROFILE_DEV_OPT_LEVEL="${AIR_FIXTURE_OPT_LEVEL:-3}"
  # DWARF alone is ~20 MB per ABI and overflows an ordinary emulator image.
  # Symbols stay: UniFFI reads the contract out of them.
  export CARGO_PROFILE_DEV_STRIP="${AIR_FIXTURE_STRIP:-debuginfo}"
fi

rm -rf "$AIR_JNI_LIBS"
mkdir -p "$AIR_JNI_LIBS"

# AIR_ANDROID_ABIS selects the device slice (arm64-v8a) and/or emulator slice
# (x86_64), separated by spaces or commas; both are built by default.
# The shipping client is 64-bit only, so 32-bit ABIs are deliberately absent.
cargo ndk \
  "${NDK_TARGETS[@]}" \
  --platform 29 \
  --output-dir "$AIR_JNI_LIBS" \
  -- build --locked -p chromvoid-air-ffi --lib "${CARGO_FLAGS[@]}"
unset CARGO_PROFILE_DEV_OPT_LEVEL CARGO_PROFILE_DEV_STRIP

BINDINGS="$AIR_ROOT/.build/bindings/$MODE"
rm -rf "$BINDINGS"
mkdir -p "$BINDINGS"
# cargo-ndk strips what it copies, and stripped libraries carry no UniFFI
# metadata. Read the contract from the unstripped build output; the packaged
# libraries stay stripped.
cargo run --locked -p chromvoid-air-ffi --features "$AIR_HOST_TOOL_FEATURES" --bin air-bindgen -- \
  generate --library "$REPO_ROOT/target/$BINDGEN_TARGET/$PROFILE/libchromvoid_air_ffi.so" \
  --language kotlin --config crates/air-ffi/uniffi.toml --out-dir "$BINDINGS"

mkdir -p "$AIR_FFI_KOTLIN_DIR"
# UniFFI emits whitespace-only lines; keep the checked-in output diff-clean.
find "$BINDINGS" -name '*.kt' -print0 | while IFS= read -r -d '' generated; do
  sed 's/[[:blank:]]*$//' "$generated" > "$AIR_FFI_KOTLIN_DIR/$(basename "$generated")"
done

"$AIR_ROOT/scripts/generate-contracts.sh"
# The fingerprint these libraries were built with, so a later edit to any
# fingerprinted source is caught before an install rather than on the device.
FINGERPRINT="$(sed -n 's/.*EXPECTED: String = "\([0-9a-f]*\)".*/\1/p' \
  "$AIR_BRIDGE_KOTLIN_DIR/BuildFingerprint.kt")"
printf 'ndk=%s\nprofile=%s\nmode=%s\nfingerprint=%s\n' "$NDK_HOME" "$PROFILE" "$MODE" "$FINGERPRINT" \
  > "$AIR_JNI_LIBS/.build-provenance"
printf 'abis=%s\n' "${ANDROID_ABIS[*]}" >> "$AIR_JNI_LIBS/.build-provenance"
echo "Built $MODE libraries into $AIR_JNI_LIBS and bindings into $AIR_FFI_KOTLIN_DIR"
