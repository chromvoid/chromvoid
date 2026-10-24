# Shared path and toolchain resolution for the native Android client.
# Every script resolves the repository from its own location, so a script can
# be run from anywhere and never depends on another task's shell state.
AIR_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$AIR_ROOT/../.." && pwd)"
export AIR_ROOT REPO_ROOT

# Both host tools use the same features; otherwise shared crates compile twice.
AIR_HOST_TOOL_FEATURES=bindgen,schema

AIR_JNI_LIBS="$AIR_ROOT/bridge/src/main/jniLibs"
AIR_FFI_KOTLIN_DIR="$AIR_ROOT/bridge/src/main/kotlin/com/chromvoid/air/ffi"
# generate-contracts.sh keeps its literals because build.rs fingerprints it.
# These paths and document names must match those literals.
AIR_BRIDGE_KOTLIN_DIR="$AIR_ROOT/bridge/src/main/kotlin/com/chromvoid/air/bridge"
AIR_WIRE_KOTLIN_DIR="$AIR_BRIDGE_KOTLIN_DIR/wire"
AIR_CONTRACT_DOCS=(capability-baseline.json wire-schema.json wire-fixtures.json provider-wire-schema.json)

# Cache only generated Kotlin files, never the whole tracked ffi directory.
air_native_outputs() {
  local mode="${1:?usage: air_native_outputs fixture|release}" generated files doc
  printf '%s\n' "${AIR_JNI_LIBS#"$REPO_ROOT"/}" \
    "${AIR_ROOT#"$REPO_ROOT"/}/.build/bindings/$mode" \
    "${AIR_ROOT#"$REPO_ROOT"/}/.build/contracts"
  files="$(find "$AIR_ROOT/.build/bindings/$mode" -name '*.kt' -print | sort)" || return 1
  if [[ -z "$files" ]]; then
    echo "No generated UniFFI Kotlin files for $mode." >&2
    return 1
  fi
  while IFS= read -r generated; do
    printf '%s/%s\n' "${AIR_FFI_KOTLIN_DIR#"$REPO_ROOT"/}" "$(basename "$generated")"
  done <<< "$files"
  printf '%s\n' "${AIR_BRIDGE_KOTLIN_DIR#"$REPO_ROOT"/}/BuildFingerprint.kt" \
    "${AIR_WIRE_KOTLIN_DIR#"$REPO_ROOT"/}/CoreWire.kt"
  for doc in "${AIR_CONTRACT_DOCS[@]}"; do
    printf '%s/docs/%s\n' "${AIR_ROOT#"$REPO_ROOT"/}" "$doc"
  done
}

air_resolve_java_home() {
  if [[ -n "${JAVA_HOME:-}" && -x "$JAVA_HOME/bin/java" ]]; then
    printf '%s\n' "$JAVA_HOME"
    return 0
  fi
  local candidate
  for candidate in \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" \
    "$HOME/android-studio/jbr" \
    "/opt/android-studio/jbr" \
    "/usr/lib/jvm/java-17-openjdk-amd64"; do
    if [[ -x "$candidate/bin/java" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  echo "Compatible JDK 17 not found. Set JAVA_HOME." >&2
  return 1
}

air_resolve_android_home() {
  local candidate
  for candidate in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" \
    "$HOME/Library/Android/sdk" "$HOME/Library/Android/Sdk" "$HOME/Android/Sdk"; do
    if [[ -n "$candidate" && -d "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done
  echo "Android SDK not found. Set ANDROID_HOME or ANDROID_SDK_ROOT." >&2
  return 1
}

# The newest installed NDK wins unless NDK_HOME pins one. build-rust.sh records
# the resolved version beside the libraries so an artifact can be traced back.
air_resolve_ndk_home() {
  if [[ -n "${NDK_HOME:-}" && -d "$NDK_HOME" ]]; then
    printf '%s\n' "$NDK_HOME"
    return 0
  fi
  local sdk ndk_root newest
  sdk="$(air_resolve_android_home)" || return 1
  ndk_root="$sdk/ndk"
  if [[ ! -d "$ndk_root" ]]; then
    echo "Android NDK not found under $ndk_root. Install it or set NDK_HOME." >&2
    return 1
  fi
  newest="$(ls -1 "$ndk_root" | sort -V | tail -1)"
  if [[ -z "$newest" ]]; then
    echo "Android NDK not found under $ndk_root. Install it or set NDK_HOME." >&2
    return 1
  fi
  printf '%s\n' "$ndk_root/$newest"
}

air_export_android_env() {
  JAVA_HOME="$(air_resolve_java_home)"
  ANDROID_HOME="$(air_resolve_android_home)"
  ANDROID_SDK_ROOT="$ANDROID_HOME"
  NDK_HOME="$(air_resolve_ndk_home)"
  ANDROID_NDK_HOME="$NDK_HOME"
  export JAVA_HOME ANDROID_HOME ANDROID_SDK_ROOT NDK_HOME ANDROID_NDK_HOME
  PATH="$JAVA_HOME/bin:$PATH"
  export PATH
}
