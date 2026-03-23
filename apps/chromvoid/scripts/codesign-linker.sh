#!/bin/bash
# Linker wrapper that calls the real linker, then signs the output binary
# with "ChromVoid Dev" certificate so macOS Keychain doesn't prompt on every recompile.
#
# Activated via env var in package.json "dev:signed" script:
#   CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER=$(pwd)/scripts/codesign-linker.sh

IDENTITY="${CODESIGN_IDENTITY:-ChromVoid Dev}"

# Call the real linker with all arguments
cc "$@"
EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    exit $EXIT_CODE
fi

# Find the output file (-o <path>)
OUTPUT=""
while [ $# -gt 0 ]; do
    if [ "$1" = "-o" ]; then
        OUTPUT="$2"
        break
    fi
    shift
done

# Only sign the chromvoid binary, not build-scripts or proc-macros
if [ -n "$OUTPUT" ] && echo "$OUTPUT" | grep -q "/chromvoid" && [ -f "$OUTPUT" ]; then
    codesign -fs "$IDENTITY" "$OUTPUT" 2>/dev/null
fi

exit 0
