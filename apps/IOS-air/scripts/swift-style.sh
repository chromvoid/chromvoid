#!/usr/bin/env bash
# Handwritten native sources only; generated bindings retain generator-owned formatting.
set -euo pipefail
AIR_STYLE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-check}"
if [[ $# -gt 1 || ( "$MODE" != check && "$MODE" != format ) ]]; then
  echo "Usage: swift-style.sh [check|format]" >&2
  exit 2
fi
cd "$AIR_STYLE_ROOT"
FILES=()
# Stock macOS tools only (the CI Mac has no ripgrep); ignored build dirs stay out of the list.
SOURCE_FILES="$(git ls-files --cached --others --exclude-standard --deduplicate \
  -- App Tests Packages Extensions | grep -E '\.swift$' | grep -Ev '(^|/)Generated/')"
while IFS= read -r FILE; do
  # A tracked file deleted in the working tree is still listed by --cached.
  if [[ -f "$FILE" ]]; then FILES+=("$FILE"); fi
done <<< "$SOURCE_FILES"
echo "swift-format $(xcrun swift-format --version): $MODE ${#FILES[@]} handwritten files"
if [[ "$MODE" == format ]]; then
  xcrun swift-format format --configuration "$AIR_STYLE_ROOT/.swift-format" --in-place "${FILES[@]}"
fi
xcrun swift-format lint --configuration "$AIR_STYLE_ROOT/.swift-format" --strict "${FILES[@]}"
