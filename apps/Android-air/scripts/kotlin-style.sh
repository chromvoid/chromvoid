#!/usr/bin/env bash
# Handwritten Kotlin style gate. Generated bindings stay generator-owned and
# are excluded; they are regenerated, never hand-edited.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
MODE="${1:-check}"
if [[ "$MODE" != check ]]; then
  echo "usage: kotlin-style.sh check" >&2
  exit 2
fi
cd "$AIR_ROOT"
status=0
while IFS= read -r file; do
  # Everything UniFFI writes lands in the ffi package; AirNative is the one
  # handwritten file there and is checked like any other source.
  case "$file" in
    */com/chromvoid/air/ffi/AirNative.kt) ;;
    */com/chromvoid/air/ffi/*) continue ;;
    */com/chromvoid/air/bridge/BuildFingerprint.kt) continue ;;
    # quicktype owns the wire DTOs generated from the Rust schema.
    */com/chromvoid/air/bridge/wire/*) continue ;;
  esac
  if grep -n $'\t' "$file" >/dev/null; then
    echo "$file: tabs are not allowed; use four spaces" >&2
    status=1
  fi
  if grep -nE ' +$' "$file" >/dev/null; then
    echo "$file: trailing whitespace" >&2
    status=1
  fi
  if [[ -n "$(tail -c 1 "$file")" ]]; then
    echo "$file: missing trailing newline" >&2
    status=1
  fi
  if awk 'length > 120 { print FILENAME ":" NR ": line longer than 120 columns"; found = 1 } END { exit found ? 1 : 0 }' "$file" >&2; then
    :
  else
    status=1
  fi
done < <(find app bridge presentation -name '*.kt' -type f | sort)
exit "$status"
