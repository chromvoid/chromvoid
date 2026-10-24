#!/usr/bin/env python3
"""Describe an actual Xcode archive; this is not signing or privacy approval."""

import argparse
import hashlib
import json
from pathlib import Path
import plistlib
import subprocess


def command(*args: str) -> str:
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()


def binary_inventory(path: Path, root: Path) -> dict:
    relative_path = str(path.relative_to(root))

    def inspect(tool: str, option: str) -> str:
        return command("xcrun", tool, option, str(path)).replace(str(path), relative_path)

    return {
        "path": relative_path,
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "architectures": inspect("lipo", "-archs"),
        "build_version": inspect("vtool", "-show-build"),
        "linked_libraries": inspect("otool", "-L"),
        "imports": inspect("dyld_info", "-imports"),
    }


def inventory(archive: Path) -> dict:
    applications = archive / "Products/Applications"
    apps = list(applications.glob("*.app"))
    if len(apps) != 1:
        raise ValueError("Expected exactly one archived application")
    app = apps[0]
    bundles = []
    for bundle in [app, *sorted(app.rglob("*.appex")), *sorted(app.rglob("*.framework"))]:
        with (bundle / "Info.plist").open("rb") as source:
            info = plistlib.load(source)
        executable = bundle / info["CFBundleExecutable"]
        bundles.append({
            "path": str(bundle.relative_to(applications)),
            "identifier": info["CFBundleIdentifier"],
            "version": info.get("CFBundleShortVersionString"),
            "build": info.get("CFBundleVersion"),
            "minimum_os": info.get("MinimumOSVersion"),
            "sdk": info.get("DTSDKName"),
            "executable": binary_inventory(executable, applications),
            "has_embedded_provisioning": (bundle / "embedded.mobileprovision").exists(),
            "has_code_signature_directory": (bundle / "_CodeSignature").exists(),
        })
    manifests = []
    for path in sorted(app.rglob("PrivacyInfo.xcprivacy")):
        manifests.append({
            "path": str(path.relative_to(applications)),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "declarations": plistlib.loads(path.read_bytes()),
        })
    return {
        "schema_version": 1,
        "scope": "Archived bundle metadata and linked executables; not a privacy or signing verdict",
        "bundles": bundles,
        "dylibs": [binary_inventory(path, applications) for path in sorted(app.rglob("*.dylib"))],
        "privacy_manifests": manifests,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(inventory(args.archive.resolve()), indent=2))
    except (OSError, ValueError, KeyError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Archive inspection failed: {error}\n")
