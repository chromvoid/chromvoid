"""Exercise the offline collector against the locked, cached dependency sources."""

import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import patch


SCRIPT = Path(__file__).resolve().parents[1] / "third-party-notices.py"
SPEC = importlib.util.spec_from_file_location("third_party_notices", SCRIPT)
collector = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(collector)


class StandardLicenseTermsTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="air-license-terms-")
        self.addCleanup(temporary.cleanup)
        self.docs = Path(temporary.name)
        for name in ["dependency-inventory.json", "license-supplements.json", "license-terms.json",
                     "embedded-license-notices.json", "runtime-license-supplements.json"]:
            shutil.copyfile(collector.DOCS / name, self.docs / name)
        self.terms_path = self.docs / "license-terms.json"
        self.terms = json.loads(self.terms_path.read_text())
        override = patch.object(collector, "DOCS", self.docs)
        override.start()
        self.addCleanup(override.stop)

    def collect_with(self, terms):
        self.terms_path.write_text(json.dumps(terms))
        return collector.collect()

    def test_standard_terms_preserve_package_notice_gaps(self):
        coverage, corpus = collector.collect()
        expected_gaps = {
            "CC0-1.0": ["base58ck", "bitcoin", "bitcoin-io", "bitcoin-units", "bitcoin_hashes"],
            "MIT": ["adnl", "libwebp-sys"],
            "MITNFA": ["hex_lit"],
        }
        supplied = {license_id: [] for license_id in expected_gaps}
        for package in coverage["packages"]:
            sources = [s for s in package["sources"] if s["scope"] == "declared-license"]
            if canonical := self.terms.get(package["declared_license"]):
                self.assertEqual(corpus["texts_by_sha256"][canonical["sha256"]], canonical["text"])
                self.assertEqual(sources, [{"source": canonical["source_url"],
                                           "scope": "declared-license", "sha256": canonical["sha256"]}])
                if not package["has_package_or_upstream_document"]:
                    supplied[package["declared_license"]].append(package["name"])
        self.assertEqual(supplied, expected_gaps)
        for name in ["objc2", "objc2-foundation", "objc2-encode"]:
            package = next(p for p in coverage["packages"] if p["name"] == name)
            self.assertEqual(package["declared_license"], "MIT")
            self.assertTrue(any(s["scope"] == "declared-license" for s in package["sources"]))

    def test_reviewed_license_addition_reaches_corpus_and_native_catalog(self):
        coverage, corpus = collector.collect()
        package = next(p for p in coverage["packages"] if p["name"] == "fax")
        self.assertEqual((package["version"], package["declared_license"]), ("0.2.6", "MIT"))
        self.assertTrue(package["has_package_or_upstream_document"])
        source = next(s for s in package["sources"] if s["scope"] == "upstream")
        self.assertEqual(source["license_addition"]["package_revision"],
                         "40b226eb97b391355e971fd95a8dd532a4c127a0")
        expected = next(s for s in json.loads((self.docs / "license-supplements.json").read_text())
                        if {"name": "fax", "version": "0.2.6"} in s["packages"])
        self.assertEqual(source["source"], expected["source_url"])
        self.assertEqual(corpus["texts_by_sha256"][source["sha256"]], expected["text"])
        self.assertTrue(expected["text"].startswith("Copyright © 2021 The pdf-rs contributers."))
        presentation = collector.runpy.run_path(str(SCRIPT.with_name("acknowledgments.py")))
        native = presentation["presentation_catalog"](coverage, corpus)
        entry = next(p for p in native["entries"] if p["id"] == "fax@0.2.6")
        self.assertIn({"source": source["source"], "textID": source["sha256"]}, entry["documents"])
        self.assertEqual(native["texts"][source["sha256"]], expected["text"])

    def test_license_addition_rejects_unrelated_or_unpinned_provenance(self):
        path = self.docs / "license-supplements.json"
        original = path.read_text()
        mutations = [
            lambda s: s["license_addition"].update(package_revision="0" * 40),
            lambda s: s["license_addition"].update(parent_revision="0" * 40),
            lambda s: s["license_addition"].update(added_paths=["LICENSE", "src/lib.rs"]),
            lambda s: s["license_addition"].update(revision="master"),
            lambda s: s["license_addition"].update(comparison_url="https://example.invalid/compare"),
            lambda s: s.update(source_url=s["source_url"].replace("pdf-rs/fax", "other/repository")),
            lambda s: s.pop("license_addition"),
        ]
        for mutate in mutations:
            with self.subTest(mutation=mutate):
                supplements = json.loads(original)
                source = next(s for s in supplements
                              if {"name": "fax", "version": "0.2.6"} in s["packages"])
                mutate(source)
                path.write_text(json.dumps(supplements))
                with self.assertRaisesRegex(ValueError, "Supplement revision|License addition"):
                    collector.collect()

    def test_rejects_changed_text(self):
        self.terms["CC0-1.0"]["text"] += "changed"
        with self.assertRaisesRegex(ValueError, "Standard license digest mismatch"):
            self.collect_with(self.terms)

    def test_rejects_changing_branch_source(self):
        self.terms["CC0-1.0"]["source_url"] = (
            "https://raw.githubusercontent.com/spdx/license-list-data/main/text/CC0-1.0.txt")
        with self.assertRaisesRegex(ValueError, "pinned SPDX source"):
            self.collect_with(self.terms)

    def test_rejects_another_license_source(self):
        self.terms["CC0-1.0"]["source_url"] = self.terms["CC0-1.0"]["source_url"].replace("CC0-1.0.txt", "MIT.txt")
        with self.assertRaisesRegex(ValueError, "pinned SPDX source"):
            self.collect_with(self.terms)

    def test_rejects_expression_and_absent_declaration(self):
        for license_id in ["CC0-1.0 OR MIT", "Unlisted-1.0"]:
            with self.subTest(license_id=license_id):
                with self.assertRaisesRegex(ValueError, "no matching package declaration"):
                    self.collect_with({license_id: self.terms["CC0-1.0"]})

    def test_alternatives_include_both_terms_without_resolving_attribution(self):
        coverage, corpus = collector.collect()
        expected = {"block-modes": ("MIT OR Apache-2.0", ["MIT", "Apache-2.0"]),
                    "crc32c": ("Apache-2.0/MIT", ["Apache-2.0", "MIT"])}
        for name, (expression, licenses) in expected.items():
            package = next(p for p in coverage["packages"] if p["name"] == name)
            self.assertEqual(package["declared_license"], expression)
            self.assertFalse(package["has_package_or_upstream_document"])
            sources = [s for s in package["sources"] if s["scope"] == "declared-license"]
            self.assertEqual(sources, [{"source": self.terms[key]["source_url"],
                                       "scope": "declared-license", "sha256": self.terms[key]["sha256"]}
                                      for key in licenses])
            for key in licenses:
                self.assertEqual(corpus["texts_by_sha256"][self.terms[key]["sha256"]], self.terms[key]["text"])
        for name, expression in [("ring", "Apache-2.0 AND ISC"), ("tinyvec", "Zlib OR Apache-2.0 OR MIT")]:
            package = next(p for p in coverage["packages"] if p["name"] == name)
            self.assertEqual(package["declared_license"], expression)
            self.assertFalse(any(s["scope"] == "declared-license" for s in package["sources"]))
        # Missing one text must not silently select the available alternative.
        del self.terms["Apache-2.0"]
        coverage, _ = self.collect_with(self.terms)
        for name in expected:
            package = next(p for p in coverage["packages"] if p["name"] == name)
            self.assertFalse(any(s["scope"] == "declared-license" for s in package["sources"]))

    def test_expression_recognition_does_not_drop_obligations_or_exceptions(self):
        cases = {
            "MIT": ["MIT"],
            "MIT OR Apache-2.0": ["MIT", "Apache-2.0"],
            "Apache-2.0/MIT": ["Apache-2.0", "MIT"],
            "MIT OR Apache-2.0 OR Zlib": ["MIT", "Apache-2.0", "Zlib"],
            "MIT AND Apache-2.0": [],
            "Apache-2.0 WITH LLVM-exception": [],
            "MIT OR (Apache-2.0 AND BSD-3-Clause)": [],
            "MIT OR": [],
            "MIT/": [],
            None: [],
        }
        for expression, expected in cases.items():
            with self.subTest(expression=expression):
                self.assertEqual(collector.standard_license_ids(expression), expected)

    def test_embedded_notice_retains_attribution_and_component_terms(self):
        coverage, corpus = collector.collect()
        package = next(p for p in coverage["packages"] if p["name"] == "crc32c")
        sources = [s for s in package["sources"] if s["scope"].startswith("embedded-")]
        self.assertEqual([s["scope"] for s in sources], ["embedded-attribution", "embedded-license"])
        self.assertEqual([s["component_source"] for s in sources], ["src/combine.rs"] * 2)
        source = collector.package_directory(package) / "src/combine.rs"
        expected = b"".join(source.read_bytes().splitlines(keepends=True)[:22]).decode()
        self.assertEqual(corpus["texts_by_sha256"][sources[0]["sha256"]], expected)
        self.assertIn("Copyright (C) 1995-2006, 2010, 2011, 2012, 2016 Mark Adler", expected)
        self.assertIn("translation", expected)
        terms = corpus["texts_by_sha256"][sources[1]["sha256"]]
        self.assertIn("This notice may not be removed or altered", terms)
        self.assertFalse(package["has_package_or_upstream_document"])
        self.assertEqual(package["declared_license"], "Apache-2.0/MIT")

    def test_changed_embedded_source_requires_new_review(self):
        package = {"name": "crc32c", "version": "0.6.8"}
        original_directory = collector.package_directory
        copied = self.docs / "crc32c"
        shutil.copytree(original_directory(package), copied)
        with (copied / "src/combine.rs").open("a") as source:
            source.write("\n// changed implementation\n")
        with patch.object(collector, "package_directory", side_effect=lambda p:
                          copied if p["name"] == "crc32c" else original_directory(p)):
            with self.assertRaisesRegex(ValueError, "Embedded notice source changed"):
                collector.collect()

    def test_bitcoin_component_mit_notice_survives_package_cc0_declaration(self):
        coverage, corpus = collector.collect()
        package = next(p for p in coverage["packages"] if p["name"] == "bitcoin")
        self.assertEqual((package["version"], package["declared_license"]), ("0.32.101", "CC0-1.0"))
        sources = [s for s in package["sources"] if s["scope"].startswith("embedded-")]
        self.assertEqual([s["scope"] for s in sources], ["embedded-attribution", "embedded-license"])
        self.assertEqual([s["component_source"] for s in sources], ["src/merkle_tree/block.rs"] * 2)
        header = corpus["texts_by_sha256"][sources[0]["sha256"]]
        self.assertIn("Copyright (c) 2009-2010 Satoshi Nakamoto", header)
        self.assertIn("Copyright (c) 2009-2018 The Bitcoin Core developers", header)
        self.assertIn("SPDX-License-Identifier: MIT", header)
        self.assertEqual(corpus["texts_by_sha256"][sources[1]["sha256"]], self.terms["MIT"]["text"])
        presentation = collector.runpy.run_path(str(SCRIPT.with_name("acknowledgments.py")))
        native = presentation["presentation_catalog"](coverage, corpus)
        entry = next(p for p in native["entries"] if p["id"] == "bitcoin@0.32.101")
        for source in sources:
            self.assertIn({"source": source["source"], "textID": source["sha256"]}, entry["documents"])
            self.assertEqual(native["texts"][source["sha256"]], corpus["texts_by_sha256"][source["sha256"]])

    def test_rejects_invalid_embedded_evidence(self):
        path = self.docs / "embedded-license-notices.json"
        original = path.read_text()
        cases = [
            ({"version": "0.0.0"}, "absent package"),
            ({"source": "../outside.rs"}, "leaves package"),
            ({"first_line": 0}, "line range"),
            ({"last_line": 100000}, "line range"),
        ]
        for changes, message in cases:
            with self.subTest(changes=changes):
                notices = json.loads(original)
                notices[0].update(changes)
                path.write_text(json.dumps(notices))
                with self.assertRaisesRegex(ValueError, message):
                    collector.collect()
        notices = json.loads(original)
        notices[0]["license"]["text"] += "altered terms"
        path.write_text(json.dumps(notices))
        with self.assertRaisesRegex(ValueError, "Standard license digest mismatch"):
            collector.collect()

    def test_compiler_runtime_terms_preserve_conjunction_exception_and_attributions(self):
        coverage, corpus = collector.collect()
        self.assertEqual(len(coverage["rust_runtime"]), 1)
        runtime = coverage["rust_runtime"][0]
        self.assertEqual((runtime["name"], runtime["version"]), ("compiler_builtins", "0.1.160"))
        self.assertEqual(runtime["declared_license"],
                         "MIT AND Apache-2.0 WITH LLVM-exception AND (MIT OR Apache-2.0)")
        expected = json.loads((self.docs / "runtime-license-supplements.json").read_text())["components"][0]
        self.assertEqual(len(runtime["documents"]), 3)
        for source, document in zip(expected["documents"], runtime["documents"], strict=True):
            self.assertEqual(document["source"], source["source_url"])
            self.assertEqual(corpus["texts_by_sha256"][document["sha256"]], source["text"])
        self.assertIn("LLVM Exceptions", expected["documents"][0]["text"])
        self.assertIn("Copyright (c) 2018 Jorge Aparicio", expected["documents"][1]["text"])
        self.assertIn("Howard Hinnant", expected["documents"][2]["text"])

    def test_changed_runtime_sources_or_toolchain_require_review(self):
        path = self.docs / "runtime-license-supplements.json"
        original = path.read_text()
        mutations = [
            (lambda value: value.update(rust_commit="0" * 40), "selected Rust toolchain"),
            (lambda value: value.update(llvm_commit="main"), "pinned Rust LLVM"),
            (lambda value: value["components"][0]["manifest"].update(text="changed"), "digest mismatch"),
            (lambda value: value["components"][0]["documents"][0].update(text="changed"), "digest mismatch"),
            (lambda value: value["components"][0]["documents"][0].update(
                source_url="https://raw.githubusercontent.com/rust-lang/rust/main/LICENSE"), "reviewed toolchain"),
        ]
        for mutate, message in mutations:
            with self.subTest(message=message):
                value = json.loads(original)
                mutate(value)
                path.write_text(json.dumps(value))
                with self.assertRaisesRegex(ValueError, message):
                    collector.collect()


if __name__ == "__main__":
    unittest.main()
