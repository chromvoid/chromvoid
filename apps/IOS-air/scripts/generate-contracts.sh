#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
cd "$REPO_ROOT"
OUT="$AIR_ROOT/.build/contracts"
MODE="${1:-write}"
if [[ "$MODE" != write && "$MODE" != --check ]]; then echo "Expected --check or no argument" >&2; exit 2; fi
cargo run --locked -p chromvoid-air-ffi --features schema --bin air-schema -- "$OUT"
GENERATED="$AIR_ROOT/Packages/ChromVoidBridge/Sources/ChromVoidBridge/Generated"
mkdir -p "$GENERATED"
bun install --cwd "$AIR_ROOT/tools" --frozen-lockfile
bun run --bun --cwd "$AIR_ROOT/tools" quicktype --src-lang schema --lang swift \
  --final-classes --access-level public --out "$OUT/CoreWire.swift" "$OUT/wire-schema.json"
for FILE in BuildFingerprint.swift CoreWire.swift; do
  if [[ "$MODE" == --check ]]; then diff -u "$GENERATED/$FILE" "$OUT/$FILE";
  else cp "$OUT/$FILE" "$GENERATED/$FILE"; fi
done
PROVIDER_GENERATED="$AIR_ROOT/Packages/ChromVoidBridge/Sources/AirCredentialProvider/Generated"
mkdir -p "$PROVIDER_GENERATED"
bun run --bun --cwd "$AIR_ROOT/tools" quicktype --src-lang schema --lang swift \
  --final-classes --access-level public --out "$OUT/ProviderWire.swift" "$OUT/provider-wire-schema.json"
if [[ "$MODE" == --check ]]; then diff -u "$PROVIDER_GENERATED/ProviderWire.swift" "$OUT/ProviderWire.swift";
else cp "$OUT/ProviderWire.swift" "$PROVIDER_GENERATED/ProviderWire.swift"; fi
for FILE in capability-baseline.json wire-schema.json wire-fixtures.json provider-wire-schema.json; do
  if [[ "$MODE" == --check ]]; then diff -u "$AIR_ROOT/docs/$FILE" "$OUT/$FILE";
  else cp "$OUT/$FILE" "$AIR_ROOT/docs/$FILE"; fi
done
