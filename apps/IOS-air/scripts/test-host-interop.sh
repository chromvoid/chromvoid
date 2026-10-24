#!/usr/bin/env bash
# Real relay + shipped desktop pairing/adapter + native Core host, using synthetic storage only.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
cd "$REPO_ROOT"
AIR_INTEROP_LOGS="$(mktemp -d "${TMPDIR:-/tmp}/chromvoid-host-interop.XXXXXX")"
AIR_RELAY_PID=""
cleanup() {
  if [[ -n "$AIR_RELAY_PID" ]]; then
    kill -TERM "$AIR_RELAY_PID" 2>/dev/null || true
    wait "$AIR_RELAY_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf 'Interoperability logs: %s\n' "$AIR_INTEROP_LOGS"
RELAY_PORT=0 METRICS_PORT=0 bun "$AIR_ROOT/tools/host-relay.ts" "$AIR_INTEROP_LOGS/ready.json" \
  > "$AIR_INTEROP_LOGS/relay.log" 2>&1 &
AIR_RELAY_PID=$!
for _ in {1..100}; do
  [[ -f "$AIR_INTEROP_LOGS/ready.json" ]] && break
  if ! kill -0 "$AIR_RELAY_PID" 2>/dev/null; then
    tail -30 "$AIR_INTEROP_LOGS/relay.log" >&2
    exit 1
  fi
  sleep 0.1
done
if [[ ! -f "$AIR_INTEROP_LOGS/ready.json" ]]; then
  echo 'Local relay did not become ready.' >&2
  exit 1
fi
AIR_INTEROP_RELAY="$(bun -e 'process.stdout.write((await Bun.file(process.argv[1]).json()).url)' "$AIR_INTEROP_LOGS/ready.json")"
CHROMVOID_TEST_FAST_KDF=1 CHROMVOID_NATIVE_TEST_RELAY_URL="$AIR_INTEROP_RELAY" \
  cargo test --locked --manifest-path apps/chromvoid/src-tauri/Cargo.toml --lib \
  desktop_pairs_reads_writes_and_detects_native_revoke_through_real_relay -- --ignored --nocapture \
  2>&1 | tee "$AIR_INTEROP_LOGS/test.log"
if ! grep -Eq '^test result: ok\. 1 passed; 0 failed; 0 ignored;' "$AIR_INTEROP_LOGS/test.log"; then
  echo 'The desktop/native interoperability case did not execute successfully.' >&2
  exit 1
fi
