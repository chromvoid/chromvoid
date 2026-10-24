#!/usr/bin/env bash
# Thin wrapper so every Gradle invocation resolves the same JDK and SDK.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
air_export_android_env
cd "$AIR_ROOT"

# macOS occasionally interrupts a file-system call inside Gradle's build-state
# tracking ("Interrupted system call") under heavy load. The build did nothing
# wrong and the same invocation succeeds when repeated, so it is repeated -
# at most twice, and only for that error; every other failure stops at once.
LOG="$(mktemp "${TMPDIR:-/tmp}/air-gradle.XXXXXX")"
trap 'rm -f "$LOG"' EXIT
for attempt in 1 2 3; do
  set +e
  ./gradlew "$@" 2>&1 | tee "$LOG"
  status=${PIPESTATUS[0]}
  set -e
  if [[ $status -eq 0 ]] || ! grep -q "Interrupted system call" "$LOG" || [[ $attempt -eq 3 ]]; then
    exit "$status"
  fi
  echo "Gradle hit an interrupted system call; running it again ($attempt of 2)." >&2
done
