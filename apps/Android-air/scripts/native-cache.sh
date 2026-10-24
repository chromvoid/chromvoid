#!/usr/bin/env bash
# Content-addressed native outputs for the Linux Android Air CI runner.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
cd "$REPO_ROOT"
export LC_ALL=C

CACHE_FORMAT=1
CACHE_ROOT="${AIR_NATIVE_CACHE_DIR:-$HOME/.cache/chromvoid-ci/air-native}"
STARTED_MARKER="$AIR_ROOT/.build/native-cache.started"
COMMAND="${1:?usage: native-cache.sh key|restore|save fixture|release [KEY]}"
MODE="${2:?usage: native-cache.sh key|restore|save fixture|release [KEY]}"
case "$COMMAND" in
  key|restore|save) ;;
  *) echo "Expected key, restore or save." >&2; exit 2 ;;
esac
case "$MODE" in
  fixture|release) ;;
  *) echo "Expected fixture or release." >&2; exit 2 ;;
esac
if [[ "$COMMAND" == save && -z "${3:-}" ]]; then
  echo "Cannot save native outputs with an empty KEY; restore refused dirty inputs or was not run." >&2
  exit 2
fi

INPUT_PATHS=(
  crates vendor Cargo.toml Cargo.lock rust-toolchain.toml .cargo
  apps/Android-air/scripts/build-rust.sh
  apps/Android-air/scripts/generate-contracts.sh
  apps/Android-air/scripts/paths.sh
  apps/Android-air/scripts/native-cache.sh
  apps/Android-air/tools
)
# Read the generators' literal paths instead of maintaining another source list.
EXTERNAL_INPUTS="$(grep -hoE '"(\.\./\.\./)?(apps|packages|docs|scripts)/[^"]+"' \
  crates/air-ffi/build.rs crates/air-ffi/src/bin/*.rs \
  | sed -E 's/^"(\.\.\/\.\.\/)?//; s/"$//' | sort -u)"
mapfile -t EXTERNAL_PATHS <<< "$EXTERNAL_INPUTS"
EVIDENCE_INPUTS="$(grep -oE '"(apps|packages)/[^"]+"' crates/air-ffi/native-evidence.json \
  | sed 's/^"//; s/"$//' | sort -u)"
mapfile -t EVIDENCE_PATHS <<< "$EVIDENCE_INPUTS"

air_export_android_env
native_manifest() {
  printf 'format %s\nmode %s\n' "$CACHE_FORMAT" "$MODE"
  git ls-tree HEAD -- "${INPUT_PATHS[@]}"
  git ls-tree HEAD -- "${EXTERNAL_PATHS[@]}"
  # air-schema checks existence, not evidence contents. Kotlin-only edits can hit.
  git ls-tree --name-only HEAD -- "${EVIDENCE_PATHS[@]}"
  rustc -vV
  cargo ndk --version
  printf 'ndk %s\n' "$(basename "$NDK_HOME")"
  sed -n '/^Pkg\.Revision[[:space:]]*=/p' "$NDK_HOME/source.properties"
  bun --version
  local name digest config
  while IFS= read -r name; do
    if [[ "$name" =~ ^(CHROMVOID_[A-Z0-9_]+|AIR_FIXTURE_[A-Z0-9_]+|AIR_ANDROID_[A-Z0-9_]+|RUSTFLAGS|RUSTDOCFLAGS|CARGO_ENCODED_RUSTFLAGS|CARGO_PROFILE_[A-Z0-9_]+|CARGO_BUILD_[A-Z0-9_]+)$ ]]; then
      digest="$(printf '%s' "${!name}" | sha256sum | cut -d ' ' -f 1)"
      printf 'env %s sha256:%s\n' "$name" "$digest"
    fi
  done < <(compgen -e | sort -u)
  for config in config.toml config; do
    if [[ -f "${CARGO_HOME:-$HOME/.cargo}/$config" ]]; then
      digest="$(sha256sum "${CARGO_HOME:-$HOME/.cargo}/$config" | cut -d ' ' -f 1)"
      printf 'cargo-config %s sha256:%s\n' "$config" "$digest"
    fi
  done
}

# Keep errexit active inside the substitution: a failed toolchain probe must fail.
MANIFEST="$(set -e; native_manifest)"
KEY="$(printf '%s\n' "$MANIFEST" | sha256sum | cut -d ' ' -f 1)"

case "$COMMAND" in
  key)
    printf '%s\nnative cache key %s\n' "$MANIFEST" "$KEY"
    ;;
  restore)
    printf '%s\n' "$MANIFEST"
    OUTPUT_KEY="$KEY"
    HIT=false
    DIRTY_INPUTS="$(git status --porcelain -- "${INPUT_PATHS[@]}" "${EXTERNAL_PATHS[@]}" "${EVIDENCE_PATHS[@]}")"
    if [[ -n "$DIRTY_INPUTS" ]]; then
      OUTPUT_KEY=
      REASON="dirty inputs"
    elif [[ "${AIR_NATIVE_CACHE_REBUILD:-false}" == true ]]; then
      REASON="AIR_NATIVE_CACHE_REBUILD=true"
    else
      mkdir -p "$CACHE_ROOT"
      exec 9>"$CACHE_ROOT/.lock"
      flock -s 9
      ENTRY="$CACHE_ROOT/$KEY"
      if [[ -d "$ENTRY" ]]; then
        rm -rf "$AIR_JNI_LIBS" "$AIR_ROOT/.build/bindings/$MODE" "$AIR_ROOT/.build/contracts"
        cp -a "$ENTRY/files/." "$REPO_ROOT/"
        touch "$ENTRY"
        printf 'native cache hit %s\n' "$KEY"
        cat "$ENTRY/origin.txt"
        HIT=true
      else
        REASON="no entry"
      fi
    fi
    if [[ "$HIT" == false ]]; then
      mkdir -p "$AIR_ROOT/.build"
      touch "$STARTED_MARKER"
      printf 'native cache miss %s (%s)\n' "$KEY" "$REASON"
    fi
    if [[ -n "${GITHUB_OUTPUT:-}" ]]; then
      printf 'key=%s\nhit=%s\n' "$OUTPUT_KEY" "$HIT" >> "$GITHUB_OUTPUT"
    fi
    ;;
  save)
    DIRTY_INPUTS="$(git status --porcelain -- "${INPUT_PATHS[@]}" "${EXTERNAL_PATHS[@]}" "${EVIDENCE_PATHS[@]}")"
    if [[ -n "$DIRTY_INPUTS" ]]; then
      echo "Cannot save native outputs: dirty inputs." >&2
      exit 1
    fi
    if [[ ! -f "$STARTED_MARKER" ]]; then
      echo "Cannot save native outputs: missing native-cache.started marker; run restore before building." >&2
      exit 1
    fi
    if [[ "$3" != "$KEY" ]]; then
      echo "Cannot save native outputs: KEY does not match the current input manifest." >&2
      exit 1
    fi
    KEEP="${AIR_NATIVE_CACHE_KEEP:-10}"
    if [[ ! "$KEEP" =~ ^[0-9]+$ ]]; then
      echo "AIR_NATIVE_CACHE_KEEP must be a non-negative integer." >&2
      exit 2
    fi
    KEEP=$((10#$KEEP))
    mkdir -p "$CACHE_ROOT"
    exec 9>"$CACHE_ROOT/.lock"
    flock -x 9
    OUTPUT_LIST="$(air_native_outputs "$MODE")"
    mapfile -t OUTPUTS <<< "$OUTPUT_LIST"
    for output in "${OUTPUTS[@]}" "${AIR_JNI_LIBS#"$REPO_ROOT"/}/.build-provenance"; do
      if [[ ! -e "$REPO_ROOT/$output" ]]; then
        printf 'Cannot save native outputs: missing %s\n' "$output" >&2
        exit 1
      fi
    done
    find "$AIR_ROOT" \
      \( -type d \( -path "$AIR_ROOT/tools/node_modules" -o -name build -o -name .gradle \) -prune \) -o \
      \( -type f ! -path "$STARTED_MARKER" -newer "$STARTED_MARKER" -print0 \) \
      | while IFS= read -r -d '' file; do
        MATCHED=false
        for output in "${OUTPUTS[@]}"; do
          if [[ "$file" == "$REPO_ROOT/$output" || \
            ( -d "$REPO_ROOT/$output" && "$file" == "$REPO_ROOT/$output/"* ) ]]; then
            MATCHED=true
            break
          fi
        done
        if [[ "$MATCHED" == false ]]; then
          printf 'Cannot save native outputs: %s is not declared; add it to air_native_outputs in paths.sh.\n' \
            "${file#"$REPO_ROOT"/}" >&2
          exit 1
        fi
      done
    TEMP_ENTRY="$(mktemp -d "$CACHE_ROOT/.tmp.XXXXXXXX")"
    trap 'rm -rf -- "$TEMP_ENTRY"' EXIT
    mkdir -p "$TEMP_ENTRY/files"
    for output in "${OUTPUTS[@]}"; do
      cp -a --parents -- "$output" "$TEMP_ENTRY/files/"
    done
    printf '%s\n' "$MANIFEST" > "$TEMP_ENTRY/key.txt"
    printf 'GITHUB_SHA=%s\nGITHUB_RUN_NUMBER=%s\nGITHUB_RUN_ID=%s\nUTC=%s\n' \
      "${GITHUB_SHA:-}" "${GITHUB_RUN_NUMBER:-}" "${GITHUB_RUN_ID:-}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      > "$TEMP_ENTRY/origin.txt"
    rm -rf -- "$CACHE_ROOT/$KEY"
    mv -T -- "$TEMP_ENTRY" "$CACHE_ROOT/$KEY"
    trap - EXIT
    printf 'native cache saved %s\n' "$KEY"
    find "$CACHE_ROOT" -regextype posix-extended -mindepth 1 -maxdepth 1 -type d \
      -regex '.*/[0-9a-f]{64}' -printf '%T@ %f\n' \
      | sort -k1,1nr -k2,2 | tail -n "+$((KEEP + 1))" \
      | while read -r mtime entry; do rm -rf -- "$CACHE_ROOT/$entry"; done
    find "$CACHE_ROOT" -mindepth 1 -maxdepth 1 -type d -name '.tmp.*' -mtime +0 \
      -exec rm -rf -- {} +
    ;;
esac
