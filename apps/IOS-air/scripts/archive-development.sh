#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
TEAM_ID="${1:?usage: archive-development.sh DEVELOPMENT_TEAM_ID}"
: "${AIR_SIGNING_IDENTITY:?Set AIR_SIGNING_IDENTITY to an existing Apple Development certificate name or SHA-1}"
python3 "$AIR_ROOT/scripts/third-party-notices.py" --check
AIR_SIGNING_TEAM="$TEAM_ID" "$AIR_ROOT/scripts/build-rust.sh" release
xcodegen generate --spec "$AIR_ROOT/project.yml"
# Existing development signing only. This command does not register IDs or update provisioning.
xcodebuild -project "$AIR_ROOT/ChromVoidAir.xcodeproj" -scheme ChromVoidAir \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath "$AIR_DERIVED_ROOT/release" \
  -archivePath "$AIR_ROOT/.build/ChromVoidAir.xcarchive" ARCHS=arm64 DEVELOPMENT_TEAM="$TEAM_ID" \
  CODE_SIGN_IDENTITY="Apple Development" archive
