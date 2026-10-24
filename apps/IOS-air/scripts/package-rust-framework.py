#!/usr/bin/env python3
"""Package locally built Rust archives and their privacy manifest as an XCFramework."""

import argparse
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import tempfile


MODULE = "AirFFIFFI"


def package_framework(
    device_library: Path, simulator_library: Path | None, bindings: Path,
    manifest: Path, output: Path, *,
    signing_identity: str | None = None, signing_team: str | None = None,
) -> None:
    if signing_identity is not None or signing_team is not None:
        if (not signing_identity or signing_identity.strip() == "-"
                or not re.fullmatch(r"[A-Z0-9]{10}", signing_team or "")):
            raise ValueError("Signing requires a certificate identity and a ten-character Apple team ID")
    if output.name != f"{MODULE}.xcframework" or output.is_symlink():
        raise ValueError(f"Output must be a regular {MODULE}.xcframework directory")
    output = output.absolute()
    # Validate inputs before replacing any previously working artifact.
    plistlib.loads(manifest.read_bytes())
    header = (bindings / f"{MODULE}.h").read_bytes()
    module_map = (bindings / f"{MODULE}.modulemap").read_text()
    declaration = f"module {MODULE} {{"
    if module_map.count(declaration) != 1:
        raise ValueError("Unexpected UniFFI module declaration; regenerate bindings")
    module_map = module_map.replace(declaration, f"framework {declaration}", 1)
    variants = [("ios-arm64", "iPhoneOS", device_library)]
    if simulator_library is not None:
        variants.append(("ios-arm64-simulator", "iPhoneSimulator", simulator_library))
    for _, _, library in variants:
        if not library.is_file():
            raise ValueError(f"Missing Rust library: {library}")

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="rust-framework.", dir=output.parent) as temporary:
        root = Path(temporary)
        command = ["xcodebuild", "-create-xcframework"]
        for variant, platform, library in variants:
            framework = root / variant / f"{MODULE}.framework"
            (framework / "Headers").mkdir(parents=True)
            (framework / "Modules").mkdir()
            shutil.copy2(library, framework / MODULE)
            (framework / "Headers" / f"{MODULE}.h").write_bytes(header)
            (framework / "Modules/module.modulemap").write_text(module_map)
            shutil.copy2(manifest, framework / "PrivacyInfo.xcprivacy")
            # These are the native package identity and deployment contract, not an app ID.
            info = {
                "CFBundleIdentifier": "com.chromvoid.iosair.ffi",
                "CFBundleName": MODULE,
                "CFBundleExecutable": MODULE,
                "CFBundlePackageType": "FMWK",
                "CFBundleShortVersionString": "0.1.0",
                "CFBundleVersion": "1",
                "MinimumOSVersion": "16.0",
                "CFBundleSupportedPlatforms": [platform],
            }
            (framework / "Info.plist").write_bytes(plistlib.dumps(info))
            command.extend(["-framework", str(framework)])
        packaged = root / f"{MODULE}.xcframework"
        subprocess.run([*command, "-output", str(packaged)], check=True)
        if signing_identity is not None:
            subprocess.run(["codesign", "--sign", signing_identity, "--timestamp",
                            str(packaged)], check=True)
            # Apple's verifier checks both sealed resources and the expected developer team.
            requirement = f'=anchor apple generic and certificate leaf[subject.OU] = "{signing_team}"'
            subprocess.run(["codesign", "--verify", "--strict", "--test-requirement",
                            requirement, str(packaged)], check=True)
        if output.exists():
            shutil.rmtree(output)
        packaged.rename(output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device-library", type=Path, required=True)
    parser.add_argument("--simulator-library", type=Path)
    parser.add_argument("--bindings", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--signing-identity", help="Existing Apple certificate name or SHA-1")
    parser.add_argument("--signing-team", help="Expected Apple developer team ID")
    args = parser.parse_args()
    try:
        package_framework(args.device_library, args.simulator_library, args.bindings,
                          args.manifest, args.output,
                          signing_identity=args.signing_identity, signing_team=args.signing_team)
    except (OSError, ValueError, plistlib.InvalidFileException, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Rust framework packaging failed: {error}\n")
