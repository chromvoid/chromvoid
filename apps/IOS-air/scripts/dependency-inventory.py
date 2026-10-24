#!/usr/bin/env python3
"""Record the ordinary iOS Rust dependency graph and its declared license sources."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tomllib


REPO_ROOT = Path(__file__).resolve().parents[3]
OUTPUT = REPO_ROOT / "apps/IOS-air/docs/dependency-inventory.json"
TARGET = "aarch64-apple-ios"


def license_file(name, version, package_path):
    cargo_cache = Path(os.environ.get("CARGO_HOME", Path.home() / ".cargo"))
    manifests = (
        [Path(package_path) / "Cargo.toml"]
        if package_path
        else list(cargo_cache.glob(f"registry/src/*/{name}-{version}/Cargo.toml"))
    )
    matches = []
    for manifest in manifests:
        package = tomllib.loads(manifest.read_text())["package"]
        relative = package.get("license-file")
        if not relative:
            continue
        source = (manifest.parent / relative).resolve()
        if not source.is_relative_to(manifest.parent.resolve()):
            raise ValueError(f"License file leaves the package directory: {name}")
        contents = source.read_bytes()
        matches.append({
            "license_file": str(Path(relative)),
            "license_file_sha256": hashlib.sha256(contents).hexdigest(),
            "license_file_heading": next(
                line.strip() for line in contents.decode("utf-8").splitlines() if line.strip()
            ),
        })
    if not matches or any(item != matches[0] for item in matches):
        raise ValueError(f"Missing or conflicting license-file evidence: {name} {version}")
    return matches[0]


def inventory():
    tree = subprocess.run(
        ["cargo", "tree", "--locked", "--offline", "-p", "chromvoid-air-ffi",
         "--target", TARGET, "--edges", "normal,no-proc-macro", "--prefix", "none",
         "--format", "{p}|{l}"],
        cwd=REPO_ROOT, check=True, stdout=subprocess.PIPE, text=True,
    ).stdout
    entries = {}
    for line in tree.splitlines():
        package, declared = line.removesuffix(" (*)").split("|", 1)
        match = re.fullmatch(r"(\S+) v(\S+)(?: \((.+)\))?", package)
        if not match:
            raise ValueError(f"Unrecognized Cargo package: {package}")
        name, version, path = match.groups()
        entry = {"name": name, "version": version, "declared_license": declared or None}
        if path:
            entry["repository_path"] = str(Path(path).relative_to(REPO_ROOT))
        if not declared:
            entry.update(license_file(name, version, path))
        key = (name, version)
        if key in entries and entries[key] != entry:
            raise ValueError(f"Ambiguous package source: {name} {version}")
        entries[key] = entry
    return {
        "root_package": "chromvoid-air-ffi",
        "target": TARGET,
        "extra_features": [],
        "edges": "normal,no-proc-macro",
        "cargo_lock_sha256": hashlib.sha256((REPO_ROOT / "Cargo.lock").read_bytes()).hexdigest(),
        "scope": "Resolved dependency inventory; build/dev/proc-macro dependencies excluded. "
                 "Does not claim every package survives final linking or provide complete "
                 "redistribution notices.",
        "packages": sorted(entries.values(), key=lambda item: (item["name"], item["version"])),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    result = inventory()
    rendered = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    if args.write:
        OUTPUT.write_text(rendered)
    elif not OUTPUT.exists() or OUTPUT.read_text() != rendered:
        parser.exit(1, "iOS dependency inventory is stale. Regenerate with --write and review it.\n")
    print(f"iOS dependency inventory: {len(result['packages'])} packages")
