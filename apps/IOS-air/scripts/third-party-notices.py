#!/usr/bin/env python3
"""Collect versioned license evidence without inferring license compatibility."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import subprocess
import tomllib


AIR_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = AIR_ROOT.parents[1]
DOCS = AIR_ROOT / "docs"
LICENSE_NAME = re.compile(r"^(licen[cs]e|notice|copying|copyright|unlicense|patents|authors)(?:$|[-_.])", re.I)
LICENSE_DIRECTORIES = {"licenses", "licences", "license", "licence"}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def standard_license_ids(expression):
    """Recognize single identifiers and flat alternatives; never select a license."""
    identifier = r"[A-Za-z0-9][A-Za-z0-9.-]*"
    if not isinstance(expression, str) or not re.fullmatch(rf"{identifier}(?:(?: OR |/){identifier})*", expression):
        return []
    # Slash is Cargo's legacy alternative spelling. AND/WITH/parentheses need separate review.
    return list(dict.fromkeys(re.split(r" OR |/", expression)))


def validate_standard_license(license_id, document):
    source_pattern = rf"https://raw\.githubusercontent\.com/spdx/license-list-data/[0-9a-f]{{40}}/text/{re.escape(license_id)}\.txt"
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]*", license_id) or not re.fullmatch(source_pattern, document["source_url"]):
        raise ValueError(f"Standard license must use a pinned SPDX source: {license_id}")
    if digest(document["text"].encode()) != document["sha256"]:
        raise ValueError(f"Standard license digest mismatch: {license_id}")


def package_directory(package):
    if "repository_path" in package:
        return REPO_ROOT / package["repository_path"]
    cache = Path(os.environ.get("CARGO_HOME", Path.home() / ".cargo"))
    matches = list(cache.glob(f"registry/src/*/{package['name']}-{package['version']}"))
    if len(matches) != 1:
        raise ValueError(f"Expected one cached source for {package['name']} {package['version']}")
    return matches[0]


def standard_library_documents(texts):
    version = subprocess.check_output(["rustc", "--version", "--verbose"], text=True)
    fields = dict(line.split(": ", 1) for line in version.splitlines() if ": " in line)
    pinned = tomllib.loads((REPO_ROOT / "rust-toolchain.toml").read_text())["toolchain"]["channel"]
    if fields["release"] != pinned:
        raise ValueError(f"Use the pinned Rust {pinned} toolchain to collect its notices")
    sysroot = Path(subprocess.check_output(["rustc", "--print", "sysroot"], text=True).strip())
    documents = []
    # The distributed library report names Apache/MIT for its root and Unicode for generated data.
    for name in ["COPYRIGHT-library.html", "licenses/Apache-2.0.txt", "licenses/MIT.txt", "licenses/Unicode-3.0.txt"]:
        path = sysroot / "share/doc/rust" / name
        if not path.is_file():
            raise ValueError(f"Missing Rust documentation input {name}; install rust-docs for {pinned}")
        data = path.read_bytes()
        checksum = digest(data)
        texts[checksum] = data.decode("utf-8")
        documents.append({"source": f"share/doc/rust/{name}", "sha256": checksum,
                          "format": "text/html" if path.suffix == ".html" else "text/plain"})
    return {
        "release": fields["release"], "commit_hash": fields["commit-hash"],
        "host": fields["host"],
        "scope": "Official installed standard-library report and its root license texts. "
                 "Includes multiple targets; not proof of the exact linked compiler/runtime subset.",
        "documents": documents,
    }


def runtime_documents(standard_library, texts):
    supplements = json.loads((DOCS / "runtime-license-supplements.json").read_text())
    if (supplements["rust_release"], supplements["rust_commit"]) != (
            standard_library["release"], standard_library["commit_hash"]):
        raise ValueError("Runtime notices differ from the selected Rust toolchain; review them again")
    if not re.fullmatch(r"[0-9a-f]{40}", supplements["llvm_commit"]):
        raise ValueError("Runtime notices need the pinned Rust LLVM submodule revision")
    rust_prefix = f"https://raw.githubusercontent.com/rust-lang/rust/{supplements['rust_commit']}/"
    llvm_prefix = f"https://raw.githubusercontent.com/rust-lang/llvm-project/{supplements['llvm_commit']}/"

    def validate(document, prefixes):
        if not document["source_url"].startswith(prefixes):
            raise ValueError("Runtime notice source differs from the reviewed toolchain revisions")
        if digest(document["text"].encode()) != document["sha256"]:
            raise ValueError("Runtime notice digest mismatch")

    components = []
    for component in supplements["components"]:
        manifest = component["manifest"]
        validate(manifest, rust_prefix)
        package = tomllib.loads(manifest["text"])["package"]
        documents = []
        for document in component["documents"]:
            validate(document, (rust_prefix, llvm_prefix))
            texts[document["sha256"]] = document["text"]
            documents.append({"source": document["source_url"], "sha256": document["sha256"],
                              "displayName": document["displayName"]})
        components.append({"name": package["name"], "version": package["version"],
                           "declared_license": package["license"], "manifest_source": manifest["source_url"],
                           "manifest_sha256": manifest["sha256"], "documents": documents})
    return components


def validate_supplement_revision(supplement, repository, package_revision):
    prefix = repository.replace("https://github.com/", "https://raw.githubusercontent.com/")
    if "license_addition" not in supplement:
        if not supplement["source_url"].startswith(f"{prefix}/{package_revision}/"):
            raise ValueError("Supplement revision differs from packaged VCS metadata")
        return

    # This is reviewed upstream evidence, not permission to accept an arbitrary later branch.
    addition = supplement["license_addition"]
    revision = addition.get("revision", "")
    paths = addition.get("added_paths", [])
    comparison = repository.replace("https://github.com/", "https://api.github.com/repos/")
    if (addition.get("package_revision") != package_revision
            or addition.get("parent_revision") != package_revision
            or not re.fullmatch(r"[0-9a-f]{40}", revision) or revision == package_revision
            or addition.get("comparison_url") != f"{comparison}/compare/{package_revision}...{revision}"
            or not paths or len(set(paths)) != len(paths)):
        raise ValueError("License addition must identify a reviewed direct child of the packaged revision")
    for name in paths:
        path = Path(name)
        if (path.is_absolute() or ".." in path.parts or str(path) != name
                or not LICENSE_NAME.match(path.name)
                or path.suffix.lower() not in {"", ".txt", ".md", ".rst", ".html"}):
            raise ValueError("License addition must contain only added license documents")
    if supplement["source_url"] not in [f"{prefix}/{revision}/{name}" for name in paths]:
        raise ValueError("License addition source differs from its reviewed repository and commit")


def collect():
    dependency_module = runpy.run_path(str(AIR_ROOT / "scripts/dependency-inventory.py"))
    dependencies = dependency_module["inventory"]()
    if dependencies != json.loads((DOCS / "dependency-inventory.json").read_text()):
        raise ValueError("Dependency inventory is stale; regenerate and review it first")
    supplements = json.loads((DOCS / "license-supplements.json").read_text())
    license_terms = json.loads((DOCS / "license-terms.json").read_text())
    embedded_notices = json.loads((DOCS / "embedded-license-notices.json").read_text())
    declared_licenses = {license_id for p in dependencies["packages"]
                         for license_id in standard_license_ids(p["declared_license"])}
    for license_id, document in license_terms.items():
        # Source keys remain individual identifiers, even when declarations offer alternatives.
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]*", license_id) or license_id not in declared_licenses:
            raise ValueError(f"Standard license has no matching package declaration: {license_id}")
        validate_standard_license(license_id, document)
    known = {(p["name"], p["version"]) for p in dependencies["packages"]}
    for notice in embedded_notices:
        if (notice["name"], notice["version"]) not in known:
            raise ValueError(f"Embedded notice references an absent package: {notice['name']}")
        validate_standard_license(notice["license"]["id"], notice["license"])
    for supplement in supplements:
        if digest(supplement["text"].encode()) != supplement["sha256"]:
            raise ValueError(f"Supplement digest mismatch: {supplement['source_url']}")
        if any((p["name"], p["version"]) not in known for p in supplement["packages"]):
            raise ValueError(f"Supplement references an absent package: {supplement['source_url']}")

    texts, packages = {}, []
    for package in dependencies["packages"]:
        # Workspace product crates use the project's own license, not third-party notices.
        if package.get("repository_path", "").startswith("crates/"):
            continue
        root = package_directory(package)
        manifest = tomllib.loads((root / "Cargo.toml").read_text())["package"]
        sources = []
        declared_file = root / manifest["license-file"] if "license-file" in manifest else None
        if declared_file and (not declared_file.is_file() or not declared_file.resolve().is_relative_to(root.resolve())):
            raise ValueError(f"Invalid declared license file: {package['name']}")

        def add(text, source, scope, component=None):
            checksum = digest(text.encode())
            texts[checksum] = text
            sources.append({"source": source, "scope": scope, "sha256": checksum})
            if component is not None:
                sources[-1]["component_source"] = component

        for path in sorted(root.rglob("*")):
            relative = path.relative_to(root)
            in_license_directory = any(part.lower() in LICENSE_DIRECTORIES for part in relative.parts[:-1])
            if not path.is_file() or not (LICENSE_NAME.match(path.name) or in_license_directory or path == declared_file):
                continue
            # Source methods named copying.rs/license.rs are not license documents.
            if path.suffix.lower() in {".rs", ".c", ".h", ".cpp", ".py", ".sh"}:
                continue
            if not path.resolve().is_relative_to(root.resolve()):
                raise ValueError(f"License source leaves package: {path}")
            package_document = path.parent == root or relative.parts[0].lower() in LICENSE_DIRECTORIES or path == declared_file
            scope = "package" if package_document else "nested"
            if path.name.lower().startswith(("patents", "authors")):
                scope = "attribution"
            add(path.read_bytes().decode("utf-8"), str(relative), scope)

        for supplement in supplements:
            if {"name": package["name"], "version": package["version"]} in supplement["packages"]:
                vcs = json.loads((root / ".cargo_vcs_info.json").read_text())
                repository = manifest["repository"].removesuffix(".git").rstrip("/")
                validate_supplement_revision(supplement, repository, vcs["git"]["sha1"])
                add(supplement["text"], supplement["source_url"], "upstream")
                if "license_addition" in supplement:
                    sources[-1]["license_addition"] = supplement["license_addition"]
        license_ids = standard_license_ids(package["declared_license"])
        if license_ids and all(license_id in license_terms for license_id in license_ids):
            # Preserve every alternative; standard terms do not supply package attribution.
            for license_id in license_ids:
                document = license_terms[license_id]
                add(document["text"], document["source_url"], "declared-license")
        for notice in embedded_notices:
            if (notice["name"], notice["version"]) != (package["name"], package["version"]):
                continue
            path = root / notice["source"]
            if Path(notice["source"]).is_absolute() or not path.resolve().is_relative_to(root.resolve()):
                raise ValueError(f"Embedded notice leaves package: {notice['source']}")
            data = path.read_bytes()
            if digest(data) != notice["source_sha256"]:
                raise ValueError(f"Embedded notice source changed; review again: {notice['source']}")
            lines = data.decode("utf-8").splitlines(keepends=True)
            first, last = notice["first_line"], notice["last_line"]
            if type(first) is not int or type(last) is not int or not 1 <= first <= last <= len(lines):
                raise ValueError(f"Invalid embedded notice line range: {notice['source']}")
            add("".join(lines[first - 1:last]), f"{notice['source']}#L{first}-L{last}",
                "embedded-attribution", notice["source"])
            document = notice["license"]
            add(document["text"], document["source_url"], "embedded-license", notice["source"])
        packages.append({
            "name": package["name"], "version": package["version"],
            "declared_license": package["declared_license"],
            "repository": manifest.get("repository"),
            "sources": sources,
            "has_package_or_upstream_document": any(s["scope"] in {"package", "upstream"} for s in sources),
        })
    standard_library = standard_library_documents(texts)
    runtimes = runtime_documents(standard_library, texts)
    coverage = {
        "scope": "License evidence, not approval. Documents may refer to additional terms; "
                 "presence does not prove complete notices or compatibility. "
                 "All resolved normal third-party packages included, even if removed by linking.",
        "cargo_lock_sha256": dependencies["cargo_lock_sha256"],
        "supplements_sha256": digest((DOCS / "license-supplements.json").read_bytes()),
        "rust_standard_library": standard_library,
        "rust_runtime": runtimes,
        "packages": packages,
    }
    return coverage, {
        "package_index": "third-party-notice-coverage.json",
        "scope": coverage["scope"],
        "texts_by_sha256": dict(sorted(texts.items())),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--write", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    try:
        coverage, texts = collect()
        outputs = {
            "third-party-notice-coverage.json": json.dumps(coverage, ensure_ascii=False, indent=2) + "\n",
            "third-party-license-texts.json": json.dumps(texts, ensure_ascii=False, indent=2) + "\n",
        }
        presentation = runpy.run_path(str(AIR_ROOT / "scripts/acknowledgments.py"))
        resource = AIR_ROOT / "Packages/AirPresentation/Sources/AirPresentation/Resources/ThirdPartyAcknowledgments.json"
        outputs[str(resource)] = json.dumps(presentation["presentation_catalog"](coverage, texts),
                                           ensure_ascii=False, indent=2) + "\n"
        for name, contents in outputs.items():
            path = DOCS / name
            if args.write:
                path.write_bytes(contents.encode())
            elif not path.exists() or path.read_bytes() != contents.encode():
                raise ValueError(f"Stale {name}; regenerate with --write and review")
        missing = [p for p in coverage["packages"] if not p["has_package_or_upstream_document"]]
        with_terms = sum(any(s["scope"] == "declared-license" for s in p["sources"]) for p in missing)
        print(f"License evidence: {len(coverage['packages'])} packages; {len(missing)} without package-level documents "
              f"({with_terms} have standard license terms). Review remains required.")
    except (OSError, ValueError, KeyError) as error:
        parser.exit(1, f"License evidence failed: {error}\n")
