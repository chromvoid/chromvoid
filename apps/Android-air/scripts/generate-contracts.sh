#!/usr/bin/env bash
# Export the Rust-owned contract artifacts for the Android client: the build
# fingerprint, the recorded baselines, and the typed wire DTOs generated from
# the same schema iOS decodes. No wire type is written by hand.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
cd "$REPO_ROOT"
MODE="${1:-write}"
if [[ "$MODE" != write && "$MODE" != --check ]]; then
  echo "usage: generate-contracts.sh [--check]" >&2
  exit 2
fi
OUT="$AIR_ROOT/.build/contracts"
mkdir -p "$OUT"
cargo run --locked -p chromvoid-air-ffi --features "$AIR_HOST_TOOL_FEATURES" --bin air-schema -- "$OUT" android
GENERATED="$AIR_ROOT/bridge/src/main/kotlin/com/chromvoid/air/bridge"
mkdir -p "$GENERATED"
if [[ "$MODE" == --check ]]; then
  diff -u "$GENERATED/BuildFingerprint.kt" "$OUT/BuildFingerprint.kt"
else
  cp "$OUT/BuildFingerprint.kt" "$GENERATED/BuildFingerprint.kt"
fi
# The same quicktype release iOS pins, so both clients read one schema the
# same way. Trailing blanks are stripped to keep the checked-in output
# diff-clean, as the UniFFI bindings are.
bun install --cwd "$AIR_ROOT/tools" --frozen-lockfile >/dev/null
bun run --bun --cwd "$AIR_ROOT/tools" quicktype --src-lang schema --lang kotlin --framework kotlinx \
  --package com.chromvoid.air.bridge.wire --out "$OUT/CoreWire.raw.kt" "$OUT/wire-schema.json"
sed 's/[[:blank:]]*$//' "$OUT/CoreWire.raw.kt" > "$OUT/CoreWire.kt"
WIRE="$AIR_ROOT/bridge/src/main/kotlin/com/chromvoid/air/bridge/wire"
mkdir -p "$WIRE"
if [[ "$MODE" == --check ]]; then
  diff -u "$WIRE/CoreWire.kt" "$OUT/CoreWire.kt"
else
  cp "$OUT/CoreWire.kt" "$WIRE/CoreWire.kt"
fi
for FILE in capability-baseline.json wire-schema.json wire-fixtures.json provider-wire-schema.json; do
  if [[ "$MODE" == --check ]]; then
    diff -u "$AIR_ROOT/docs/$FILE" "$OUT/$FILE"
  else
    cp "$OUT/$FILE" "$AIR_ROOT/docs/$FILE"
  fi
done
