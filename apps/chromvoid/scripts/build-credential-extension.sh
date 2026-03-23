#!/bin/bash
# Build the ChromVoid Credential Provider Extension for macOS
# and embed it into the Tauri app bundle.
#
# Usage:
#   ./scripts/build-credential-extension.sh [--release]
#
# The script compiles the Swift extension sources, creates the .appex bundle,
# signs it, and copies it into the Tauri-built .app bundle (Contents/PlugIns/).
#
# Environment variables:
#   CODESIGN_IDENTITY  — code signing identity (default: "ChromVoid Dev")
#   APP_BUNDLE_PATH    — explicit path to the .app bundle (auto-detected if unset)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/.."
GEN_DIR="$APP_DIR/src-tauri/gen/apple"
EXT_SRC_DIR="$GEN_DIR/chromvoid_CredentialProviderExtension"
BRIDGE_SRC="$GEN_DIR/Sources/chromvoid/CredentialIPCBridge.swift"
ENTITLEMENTS_EXT="$EXT_SRC_DIR/chromvoid_CredentialProviderExtension_macos.entitlements"
ENTITLEMENTS_APP="$APP_DIR/src-tauri/Entitlements.plist"

# Build settings
SDK_PATH=$(xcrun --show-sdk-path --sdk macosx)
ARCH=$(uname -m)
DEPLOYMENT_TARGET="13.0"
TARGET="${ARCH}-apple-macos${DEPLOYMENT_TARGET}"
PRODUCT_NAME="ChromVoidCredentialProvider"
BUNDLE_ID="com.chromvoid.app.credential-provider"

# Parse arguments
CONFIGURATION="debug"
for arg in "$@"; do
  case "$arg" in
    --release) CONFIGURATION="release" ;;
  esac
done

# Signing identity
IDENTITY="${CODESIGN_IDENTITY:-ChromVoid Dev}"

# Build output
BUILD_DIR="$APP_DIR/target/credential-extension/$CONFIGURATION"
APPEX_DIR="$BUILD_DIR/$PRODUCT_NAME.appex"

echo "==> Building Credential Provider Extension ($CONFIGURATION, $ARCH)"

mkdir -p "$BUILD_DIR"

# Swift compiler flags
# Extension is a Mach-O executable with _NSExtensionMain as entry point
# (provided by Foundation framework). -parse-as-library because there's no
# top-level Swift code — the system calls _NSExtensionMain to bootstrap.
SWIFT_FLAGS=(
  -target "$TARGET"
  -sdk "$SDK_PATH"
  -parse-as-library
  -framework AuthenticationServices
  -framework Foundation
  -framework AppKit
  -module-name "$PRODUCT_NAME"
  -Xlinker -e -Xlinker _NSExtensionMain
  -Xlinker -rpath -Xlinker "@executable_path/../Frameworks"
  -o "$BUILD_DIR/$PRODUCT_NAME"
)

if [ "$CONFIGURATION" = "release" ]; then
  SWIFT_FLAGS+=(-O -whole-module-optimization)
else
  SWIFT_FLAGS+=(-Onone -g)
fi

# Compile
swiftc "${SWIFT_FLAGS[@]}" \
  "$EXT_SRC_DIR/CredentialProviderViewController.swift" \
  "$BRIDGE_SRC"

echo "    Compiled Swift sources"

# Create .appex bundle structure
rm -rf "$APPEX_DIR"
mkdir -p "$APPEX_DIR/Contents/MacOS"
cp "$BUILD_DIR/$PRODUCT_NAME" "$APPEX_DIR/Contents/MacOS/"

# Process Info.plist: substitute Xcode build variables with actual values
sed \
  -e "s|\$(PRODUCT_BUNDLE_IDENTIFIER)|${BUNDLE_ID}|g" \
  -e "s|\$(PRODUCT_NAME)|${PRODUCT_NAME}|g" \
  -e "s|\$(PRODUCT_MODULE_NAME)|${PRODUCT_NAME}|g" \
  -e "s|\$(EXECUTABLE_NAME)|${PRODUCT_NAME}|g" \
  -e "s|\$(DEVELOPMENT_LANGUAGE)|en|g" \
  "$EXT_SRC_DIR/Info.plist" > "$APPEX_DIR/Contents/Info.plist"

echo "    Created .appex bundle"

# Code sign the extension
codesign -fs "$IDENTITY" \
  --entitlements "$ENTITLEMENTS_EXT" \
  "$APPEX_DIR" 2>/dev/null || {
  echo "    WARNING: Code signing failed (identity '$IDENTITY' not found?)"
  echo "    The extension will be built but unsigned."
  echo "    Set CODESIGN_IDENTITY or create the certificate with:"
  echo "      ./scripts/setup-dev-codesign.sh"
}

echo "    Signed .appex"

# Find the Tauri app bundle (Tauri places it under src-tauri/target/)
TAURI_TARGET="$APP_DIR/src-tauri/target"
if [ -n "${APP_BUNDLE_PATH:-}" ]; then
  APP_BUNDLE="$APP_BUNDLE_PATH"
elif [ -d "$TAURI_TARGET/release/bundle/macos/ChromVoid.app" ] && [ "$CONFIGURATION" = "release" ]; then
  APP_BUNDLE="$TAURI_TARGET/release/bundle/macos/ChromVoid.app"
elif [ -d "$TAURI_TARGET/debug/bundle/macos/ChromVoid.app" ]; then
  APP_BUNDLE="$TAURI_TARGET/debug/bundle/macos/ChromVoid.app"
elif [ -d "$TAURI_TARGET/release/bundle/macos/ChromVoid.app" ]; then
  APP_BUNDLE="$TAURI_TARGET/release/bundle/macos/ChromVoid.app"
else
  echo ""
  echo "==> Extension built at: $APPEX_DIR"
  echo "    No app bundle found. Run 'tauri build' first, then re-run this script."
  echo "    Or set APP_BUNDLE_PATH explicitly."
  exit 0
fi

# Embed in the app bundle
PLUGINS_DIR="$APP_BUNDLE/Contents/PlugIns"
mkdir -p "$PLUGINS_DIR"
rm -rf "$PLUGINS_DIR/$PRODUCT_NAME.appex"
cp -R "$APPEX_DIR" "$PLUGINS_DIR/"

echo "    Embedded in: $APP_BUNDLE"

# Re-sign the outer app bundle (required after modifying bundle contents).
# IMPORTANT: do NOT use --deep — it would overwrite the extension's
# entitlements with the app's entitlements (losing app-sandbox).
# Sign the extension first (already done above), then sign the app only.
codesign -fs "$IDENTITY" \
  --entitlements "$ENTITLEMENTS_APP" \
  "$APP_BUNDLE" 2>/dev/null || {
  echo "    WARNING: Failed to re-sign the app bundle."
}

echo ""
echo "==> Done. Extension embedded in $APP_BUNDLE/Contents/PlugIns/"
echo "    To test: open the app, then check System Settings > Passwords > AutoFill"
