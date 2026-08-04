#!/bin/bash
# Build the signed macOS Credential Provider and its provisioning container.
# Tauri consumes the deterministic stage directory through bundle.macOS.files,
# so the extension and host profile are present before the final app/DMG signing.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$SCRIPT_DIR/.."
GEN_DIR="$APP_DIR/src-tauri/gen/apple"
SPEC="$GEN_DIR/macos-credential-provider.yml"
TEAM_ID="${APPLE_DEVELOPMENT_TEAM:-LHWC37D5KT}"
IDENTITY="${CODESIGN_IDENTITY:-Apple Development}"
DISTRIBUTION_MODE="${CHROMVOID_MACOS_DISTRIBUTION:-0}"
DISTRIBUTION_IDENTITY="${CHROMVOID_MACOS_DISTRIBUTION_IDENTITY:-}"
CONFIGURATION="release"
ARCHS="${CHROMVOID_MACOS_ARCHS:-$(uname -m)}"
BUILD_ROOT="$GEN_DIR/build/credential-provider"
PROJECT_DIR="$BUILD_ROOT/project"
PROJECT="$PROJECT_DIR/ChromVoidCredentialProvider.xcodeproj"
SCHEME="ChromVoidCredentialProvider"
ARCHIVE_PATH="$BUILD_ROOT/ChromVoidCredentialProvider.xcarchive"
EXPORT_DIR="$BUILD_ROOT/export"
EXPORT_OPTIONS="$BUILD_ROOT/DeveloperIDExportOptions.plist"
PRODUCTS_DIR="$BUILD_ROOT/Build/Products/$CONFIGURATION"
HOST_APP="$PRODUCTS_DIR/ChromVoidProvisioningHost.app"
HOST_APPEX="$HOST_APP/Contents/PlugIns/ChromVoidCredentialProvider.appex"
HOST_PROFILE="$HOST_APP/Contents/embedded.provisionprofile"
HOST_ENTITLEMENTS="$BUILD_ROOT/Build/Intermediates.noindex/ChromVoidCredentialProvider.build/$CONFIGURATION/ChromVoidProvisioningHost.build/ChromVoidProvisioningHost.app.xcent"
STAGE_DIR="$BUILD_ROOT/stage"
CERT_DIR="$BUILD_ROOT/signing-certificate"
APP_VERSION="$(plutil -extract version raw "$APP_DIR/src-tauri/tauri.conf.json")"

for arg in "$@"; do
  case "$arg" in
    --debug) CONFIGURATION="debug" ;;
    --release) CONFIGURATION="release" ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

PRODUCTS_DIR="$BUILD_ROOT/Build/Products/$CONFIGURATION"
HOST_APP="$PRODUCTS_DIR/ChromVoidProvisioningHost.app"
HOST_APPEX="$HOST_APP/Contents/PlugIns/ChromVoidCredentialProvider.appex"
HOST_PROFILE="$HOST_APP/Contents/embedded.provisionprofile"
HOST_ENTITLEMENTS="$BUILD_ROOT/Build/Intermediates.noindex/ChromVoidCredentialProvider.build/$CONFIGURATION/ChromVoidProvisioningHost.build/ChromVoidProvisioningHost.app.xcent"

echo "==> Generating Apple project"
rm -rf "$PROJECT_DIR"
mkdir -p "$PROJECT_DIR"
xcodegen generate --spec "$SPEC" --project "$PROJECT_DIR" --quiet

XCODEBUILD_ARGS=(
  -project "$PROJECT"
  -scheme "$SCHEME"
  -configuration "$CONFIGURATION"
  -derivedDataPath "$BUILD_ROOT"
  -allowProvisioningUpdates
  -allowProvisioningDeviceRegistration
  -quiet
  ARCHS="$ARCHS"
  ONLY_ACTIVE_ARCH=NO
  DEVELOPMENT_TEAM="$TEAM_ID"
  CHROMVOID_APP_VERSION="$APP_VERSION"
  CHROMVOID_APPLE_SOURCE_ROOT="$GEN_DIR"
  CHROMVOID_TAURI_ROOT="$APP_DIR/src-tauri"
)

if [ "$DISTRIBUTION_MODE" = "1" ]; then
  if [ -z "$DISTRIBUTION_IDENTITY" ]; then
    echo "Developer ID certificate fingerprint is required for distribution" >&2
    exit 1
  fi

  echo "==> Archiving macOS Credential Provider $APP_VERSION ($CONFIGURATION, $ARCHS, team $TEAM_ID)"
  rm -rf "$ARCHIVE_PATH" "$EXPORT_DIR"
  xcodebuild \
    "${XCODEBUILD_ARGS[@]}" \
    -destination "generic/platform=macOS" \
    -archivePath "$ARCHIVE_PATH" \
    clean archive

  rm -f "$EXPORT_OPTIONS"
  plutil -create xml1 "$EXPORT_OPTIONS"
  plutil -insert method -string developer-id "$EXPORT_OPTIONS"
  plutil -insert destination -string export "$EXPORT_OPTIONS"
  plutil -insert signingStyle -string manual "$EXPORT_OPTIONS"
  plutil -insert teamID -string "$TEAM_ID" "$EXPORT_OPTIONS"
  plutil -insert signingCertificate -string "$DISTRIBUTION_IDENTITY" "$EXPORT_OPTIONS"
  plutil -insert provisioningProfiles -xml '<dict><key>com.chromvoid.app</key><string>ChromVoid Developer ID 2026</string><key>com.chromvoid.app.credential-provider</key><string>ChromVoid Credential Provider Developer ID 2026</string></dict>' "$EXPORT_OPTIONS"

  echo "==> Exporting Developer ID Credential Provider"
  xcodebuild \
    -exportArchive \
    -archivePath "$ARCHIVE_PATH" \
    -exportPath "$EXPORT_DIR" \
    -exportOptionsPlist "$EXPORT_OPTIONS" \
    -quiet

  HOST_APP="$EXPORT_DIR/ChromVoidProvisioningHost.app"
  HOST_APPEX="$HOST_APP/Contents/PlugIns/ChromVoidCredentialProvider.appex"
  HOST_PROFILE="$HOST_APP/Contents/embedded.provisionprofile"
  HOST_ENTITLEMENTS="$BUILD_ROOT/exported-host-entitlements.plist"
  codesign --display --xml --entitlements "$HOST_ENTITLEMENTS" "$HOST_APP"
else
  echo "==> Building macOS Credential Provider $APP_VERSION ($CONFIGURATION, $ARCHS, team $TEAM_ID)"
  xcodebuild \
    "${XCODEBUILD_ARGS[@]}" \
    -destination "platform=macOS" \
    CODE_SIGN_STYLE=Automatic \
    CODE_SIGN_IDENTITY="$IDENTITY" \
    clean build
fi

if [ ! -d "$HOST_APPEX" ]; then
  echo "Credential Provider product not found: $HOST_APPEX" >&2
  exit 1
fi
if [ ! -f "$HOST_PROFILE" ]; then
  echo "Host provisioning profile not found: $HOST_PROFILE" >&2
  exit 1
fi
if [ ! -f "$HOST_ENTITLEMENTS" ]; then
  echo "Host signing entitlements not found: $HOST_ENTITLEMENTS" >&2
  exit 1
fi

codesign --verify --strict --verbose=2 "$HOST_APPEX"
codesign --verify --strict --verbose=2 "$HOST_APP"

rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"
cp -R "$HOST_APPEX" "$STAGE_DIR/ChromVoidCredentialProvider.appex"
cp "$HOST_PROFILE" "$STAGE_DIR/embedded.provisionprofile"
cp "$HOST_ENTITLEMENTS" "$STAGE_DIR/host-entitlements.plist"
plutil -lint "$STAGE_DIR/host-entitlements.plist" >/dev/null

rm -rf "$CERT_DIR"
mkdir -p "$CERT_DIR"
(
  cd "$CERT_DIR"
  codesign --display --extract-certificates "$HOST_APP"
)
CERT_SHA1="$(openssl x509 -inform DER -in "$CERT_DIR/codesign0" -noout -fingerprint -sha1 | cut -d= -f2 | tr -d ':')"
if [ -z "$CERT_SHA1" ]; then
  echo "Failed to determine the Xcode signing certificate fingerprint" >&2
  exit 1
fi
SIGNING_CERTIFICATE_NAME="$(openssl x509 -inform DER -in "$CERT_DIR/codesign0" -noout -subject -nameopt multiline | sed -n 's/^[[:space:]]*commonName[[:space:]]*=[[:space:]]*//p' | head -n 1)"
if [ -z "$SIGNING_CERTIFICATE_NAME" ]; then
  echo "Failed to determine the Xcode signing certificate name" >&2
  exit 1
fi
printf '%s\n' "$CERT_SHA1" > "$STAGE_DIR/signing-identity"
printf '%s\n' "$SIGNING_CERTIFICATE_NAME" > "$STAGE_DIR/signing-certificate-name"

echo "==> Staged signed Credential Provider for Tauri: $STAGE_DIR"
