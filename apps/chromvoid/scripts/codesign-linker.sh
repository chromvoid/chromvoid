#!/bin/bash
# Rust linker wrapper for the main macOS development executable. It signs the
# final `chromvoid` binary with a stable identifier so Keychain ACLs survive a
# rebuild, and fails closed if signing or designated-requirement verification
# regresses.

set -euo pipefail

IDENTITY="${CODESIGN_IDENTITY:-ChromVoid Dev}"
IDENTIFIER="com.chromvoid.app.dev"
REAL_CC="${CHROMVOID_CODESIGN_CC:-cc}"
REAL_CODESIGN="${CHROMVOID_CODESIGN_TOOL:-codesign}"

"$REAL_CC" "$@"

OUTPUT=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ] && [ "$#" -ge 2 ]; then
    OUTPUT="$2"
    break
  fi
  shift
done

if [ -z "$OUTPUT" ] || [ ! -f "$OUTPUT" ] || [ "$(basename "$OUTPUT")" != "chromvoid" ]; then
  exit 0
fi

"$REAL_CODESIGN" \
  --force \
  --sign "$IDENTITY" \
  --identifier "$IDENTIFIER" \
  --timestamp=none \
  "$OUTPUT"
"$REAL_CODESIGN" --verify --strict --verbose=2 "$OUTPUT"

DETAILS="$($REAL_CODESIGN -dv --verbose=4 "$OUTPUT" 2>&1)"
REQUIREMENT="$($REAL_CODESIGN -d -r- "$OUTPUT" 2>&1)"

if ! grep -Fq "Identifier=$IDENTIFIER" <<<"$DETAILS"; then
  echo "codesign linker: unexpected identifier for $OUTPUT" >&2
  exit 1
fi
if grep -Fqi "Signature=adhoc" <<<"$DETAILS"; then
  echo "codesign linker: ad-hoc signature is forbidden" >&2
  exit 1
fi
if [ -z "$REQUIREMENT" ] || grep -Eqi '(^|[^[:alnum:]_])cdhash([^[:alnum:]_]|$)' <<<"$REQUIREMENT"; then
  echo "codesign linker: designated requirement must be stable and must not use cdhash" >&2
  exit 1
fi
