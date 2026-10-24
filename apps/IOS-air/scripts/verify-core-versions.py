#!/usr/bin/env python3
"""Verify two committed Core revisions using one disposable synthetic storage root."""

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile


REPO = Path(__file__).resolve().parents[3]
PROBE = Path(__file__).resolve().parent / "fixtures/core-version-probe.rs"


def git(*args):
    return subprocess.check_output(["git", "-C", str(REPO), *args]).decode().strip()


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(revision, label, workspace, target, probe):
    source = workspace / label
    source.mkdir()
    available = git("ls-tree", "--name-only", revision).splitlines()
    paths = [p for p in ["Cargo.toml", "Cargo.lock", "rust-toolchain.toml", "crates", "vendor"] if p in available]
    archive = subprocess.check_output(["git", "-C", str(REPO), "archive", revision, "--", *paths])
    with tarfile.open(fileobj=io.BytesIO(archive)) as contents:
        contents.extractall(source, filter="data")
    example = source / "crates/core/examples/air_core_version_probe.rs"
    example.parent.mkdir(exist_ok=True)
    if example.exists():
        raise ValueError("Fixture example would replace a committed source")
    example.write_bytes(probe)
    lock_hash = sha(source / "Cargo.lock")
    print(f"Building {label} Core {revision}", file=sys.stderr, flush=True)
    log = workspace / f"{label}-build.log"
    with log.open("w") as errors:
        completed = subprocess.run([
            "cargo", "build", "--locked", "--offline", "-p", "chromvoid-core",
            "--example", "air_core_version_probe", "--target-dir", str(target), "--message-format=json",
        ], cwd=source, text=True, stdout=subprocess.PIPE, stderr=errors)
    messages = [json.loads(line) for line in completed.stdout.splitlines()]
    if completed.returncode:
        print(log.read_text()[-12000:], file=sys.stderr)
        for message in messages:
            if message.get("reason") == "compiler-message":
                print(message["message"].get("rendered", ""), file=sys.stderr)
        raise RuntimeError(f"{label} Core build failed")
    executables = [message["executable"] for message in messages
                   if message.get("reason") == "compiler-artifact"
                   and message.get("target", {}).get("name") == "air_core_version_probe"
                   and message.get("executable")]
    if len(executables) != 1 or sha(source / "Cargo.lock") != lock_hash:
        raise ValueError("Expected one built probe and unchanged locked dependencies")
    # Cargo may reuse the example output path for the second source revision.
    binary = workspace / f"{label}-probe"
    shutil.copy2(executables[0], binary)
    return binary, {"commit": revision, "core_tree": git("rev-parse", f"{revision}:crates/core"),
                    "cargo_lock_sha256": lock_hash, "binary_sha256": sha(binary),
                    "rustc": subprocess.check_output(["rustc", "--version", "--verbose"], cwd=source, text=True).strip()}


def verify(old_ref, new_ref):
    revisions = [git("rev-parse", "--verify", "--end-of-options", f"{ref}^{{commit}}") for ref in [old_ref, new_ref]]
    different = subprocess.run(["git", "-C", str(REPO), "diff", "--quiet", *revisions, "--", "crates/core/src"])
    if different.returncode != 1:
        raise ValueError("Select two revisions with different Core source")
    # Reuse only compiler artifacts; sources, binaries and storage belong to this unique run.
    target = Path(os.environ.get("CARGO_TARGET_DIR", REPO / "target")).resolve()
    probe = PROBE.read_bytes()
    with tempfile.TemporaryDirectory(prefix="air-core-versions-") as temporary:
        workspace = Path(temporary)
        old, old_identity = build(revisions[0], "old", workspace, target, probe)
        new, new_identity = build(revisions[1], "new", workspace, target, probe)
        fixture = workspace / "fixture"
        fixture.mkdir()
        (fixture / ".air-core-version-fixture").write_text("disposable synthetic compatibility fixture\n")
        environment = os.environ | {"CHROMVOID_TEST_FAST_KDF": "1"}
        results, file_id, format_bytes = [], None, None
        for binary, phase in [(old, "create"), (new, "update"), (old, "rollback"), (new, "verify")]:
            args = [str(binary), str(fixture), phase] + ([str(file_id)] if file_id is not None else [])
            result = json.loads(subprocess.check_output(args, env=environment, text=True))
            if file_id is not None and result["file_id"] != file_id:
                raise ValueError("File identity changed between binaries")
            file_id = result["file_id"]
            current_format = (fixture / "storage/format.version").read_bytes()
            if format_bytes is not None and current_format != format_bytes:
                raise ValueError("Storage format changed across same-schema compatibility phases")
            format_bytes = current_format
            results.append(result)
            print(f"Passed {phase}", file=sys.stderr, flush=True)
        if len({r["protocol_version"] for r in results}) != 1:
            raise ValueError("RPC protocol versions differ")
        return {"old": old_identity, "new": new_identity, "probe_sha256": hashlib.sha256(probe).hexdigest(),
                "format_version": json.loads(format_bytes), "phases": results,
                "scope": "Host Core credential and binary-file read/write compatibility with a public synthetic fixture key. "
                         "Not iOS install, Keychain, provider, or production replacement evidence."}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("old_revision")
    parser.add_argument("new_revision")
    args = parser.parse_args()
    try:
        print(json.dumps(verify(args.old_revision, args.new_revision), ensure_ascii=False, indent=2))
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError) as error:
        parser.exit(1, f"Core compatibility verification failed: {error}\n")
