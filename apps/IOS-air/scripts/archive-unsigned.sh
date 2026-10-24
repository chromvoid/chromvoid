#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"

# Review-only archive. All Xcode/FFI outputs stay separate from working Fixture artifacts.
python3 "$AIR_ROOT/scripts/dependency-inventory.py" --check
python3 "$AIR_ROOT/scripts/third-party-notices.py" --check
bash "$AIR_ROOT/scripts/generate-contracts.sh" --check
mkdir -p "$AIR_DERIVED_ROOT"
AIR_UNSIGNED_ROOT="$(mktemp -d "$AIR_DERIVED_ROOT/unsigned-release.XXXXXX")"
AIR_RELEASE_STAGE="$AIR_UNSIGNED_ROOT/source/apps/IOS-air"
AIR_RELEASE_BINDINGS="$AIR_UNSIGNED_ROOT/bindings"
printf 'Unsigned archive workspace: %s\n' "$AIR_UNSIGNED_ROOT"

python3 - "$AIR_ROOT" "$AIR_RELEASE_STAGE" <<'PY'
from pathlib import Path
import shutil
import sys

source, destination = map(Path, sys.argv[1:])
destination.mkdir(parents=True)
for name in ("App", "Configuration", "Extensions", "Packages", "Tests"):
    shutil.copytree(
        source / name, destination / name,
        ignore=shutil.ignore_patterns(".build", ".artifacts", ".swiftpm"),
    )
# Keep repository-relative XcodeGen test references valid without staging unrelated code.
(destination / "docs").mkdir()
shutil.copy2(source / "docs/wire-fixtures.json", destination / "docs/wire-fixtures.json")
fixtures = Path("crates/core/tests/passmanager_domain_rpc/fixtures")
fixture_destination = destination.parents[1] / fixtures
fixture_destination.mkdir(parents=True)
for name in ("1password-credentials.1pux", "keepass-4.kdbx"):
    shutil.copy2(source.parents[1] / fixtures / name, fixture_destination / name)
shutil.copy2(source / "project.yml", destination / "project.yml")
(destination / "scripts").mkdir()
shutil.copy2(source / "scripts/verify-artifacts.sh", destination / "scripts/verify-artifacts.sh")
PY

cd "$REPO_ROOT"
IPHONEOS_DEPLOYMENT_TARGET=17.0 cargo build --locked -p chromvoid-air-ffi \
  --lib --release --target aarch64-apple-ios
mkdir -p "$AIR_RELEASE_BINDINGS"
cargo run --locked -p chromvoid-air-ffi --features bindgen --bin air-bindgen -- \
  generate --library "$REPO_ROOT/target/aarch64-apple-ios/release/libchromvoid_air_ffi.a" \
  --language swift --config crates/air-ffi/uniffi.toml --out-dir "$AIR_RELEASE_BINDINGS"
sed 's/[[:blank:]]*$//' "$AIR_RELEASE_BINDINGS/AirFFI.swift" \
  > "$AIR_RELEASE_STAGE/Packages/ChromVoidBridge/Sources/ChromVoidBridge/Generated/AirFFI.swift"
python3 "$AIR_ROOT/scripts/package-rust-framework.py" \
  --device-library "$REPO_ROOT/target/aarch64-apple-ios/release/libchromvoid_air_ffi.a" \
  --bindings "$AIR_RELEASE_BINDINGS" \
  --manifest "$AIR_RELEASE_STAGE/Packages/ChromVoidBridge/Resources/AirFFIFFI/PrivacyInfo.xcprivacy" \
  --output "$AIR_RELEASE_STAGE/Packages/ChromVoidBridge/.artifacts/AirFFIFFI.xcframework"
printf 'release\n' > "$AIR_RELEASE_STAGE/Packages/ChromVoidBridge/.artifacts/mode"
xcodegen generate --spec "$AIR_RELEASE_STAGE/project.yml"
xcodebuild -project "$AIR_RELEASE_STAGE/ChromVoidAir.xcodeproj" -scheme ChromVoidAir \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath "$AIR_UNSIGNED_ROOT/DerivedData" \
  -archivePath "$AIR_UNSIGNED_ROOT/ChromVoidAir.xcarchive" \
  ARCHS=arm64 CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY= archive
python3 "$AIR_ROOT/scripts/archive-inventory.py" "$AIR_UNSIGNED_ROOT/ChromVoidAir.xcarchive" \
  > "$AIR_UNSIGNED_ROOT/archive-inventory.json"
printf 'Unsigned review archive: %s/ChromVoidAir.xcarchive\n' "$AIR_UNSIGNED_ROOT"
printf 'Archive inventory: %s/archive-inventory.json\n' "$AIR_UNSIGNED_ROOT"
