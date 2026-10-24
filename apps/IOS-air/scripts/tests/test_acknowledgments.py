"""Verify complete offline packaging, including the standard-library HTML report."""

import json
from pathlib import Path
import runpy
import unittest


AIR_ROOT = Path(__file__).resolve().parents[2]
builder = runpy.run_path(str(AIR_ROOT / "scripts/acknowledgments.py"))


class AcknowledgmentsTests(unittest.TestCase):
    def test_every_collected_document_reaches_its_native_entry(self):
        coverage = json.loads((AIR_ROOT / "docs/third-party-notice-coverage.json").read_text())
        corpus = json.loads((AIR_ROOT / "docs/third-party-license-texts.json").read_text())
        catalog = builder["presentation_catalog"](coverage, corpus)
        entries = {p["id"]: p for p in catalog["entries"]}
        self.assertEqual(len(entries), len(coverage["packages"]) + 2)
        for package in coverage["packages"]:
            entry = entries[f"{package['name']}@{package['version']}"]
            self.assertEqual(entry["license"], package["declared_license"])
            self.assertEqual(entry["documents"], [{"source": s["source"], "textID": s["sha256"]}
                                                 for s in package["sources"]])
            for source in package["sources"]:
                checksum = source["sha256"]
                self.assertEqual(catalog["texts"][checksum], corpus["texts_by_sha256"][checksum])
        library = entries["rust-standard-library"]
        self.assertEqual(len(library["documents"]), 4)
        report = catalog["texts"][library["documents"][0]["textID"]]
        self.assertIn("2014 Alex Crichton", report)
        self.assertIn("1991-2024 Unicode, Inc", report)
        self.assertIn("TERMS AND CONDITIONS", report)
        self.assertNotIn("<pre>", report)
        self.assertNotIn("&#34;", report)
        runtime = entries["rust-runtime:compiler_builtins@0.1.160"]
        self.assertEqual([d["displayName"] for d in runtime["documents"]],
                         ["compiler-builtins/LICENSE.txt", "libm/LICENSE.txt", "compiler-rt/CREDITS.TXT"])
        for source, document in zip(coverage["rust_runtime"][0]["documents"], runtime["documents"], strict=True):
            self.assertEqual(catalog["texts"][document["textID"]], corpus["texts_by_sha256"][source["sha256"]])

    def test_html_keeps_collapsed_notices_entities_and_link_destinations(self):
        parser = builder["NoticeText"]()
        parser.feed('<html><head><title>Browser title</title></head><body><h1>Notices</h1>'
                    '<details><summary>License</summary><pre>Copyright A &amp; B\n  Indented clause</pre>'
                    '</details><p>Terms at <a href="https://example.org/license">original source</a>.</p>'
                    '</body></html>')
        text = "".join(parser.parts)
        self.assertIn("Copyright A & B\n  Indented clause", text)
        self.assertIn("https://example.org/license", text)
        self.assertIn("original source", text)
        self.assertNotIn("Browser title", text)
        with self.assertRaisesRegex(ValueError, "Unexpected executable"):
            parser.feed("<body><script>fetch('https://example.org')</script></body>")

    def test_missing_source_text_stops_packaging(self):
        coverage = json.loads((AIR_ROOT / "docs/third-party-notice-coverage.json").read_text())
        corpus = json.loads((AIR_ROOT / "docs/third-party-license-texts.json").read_text())
        del corpus["texts_by_sha256"][coverage["packages"][0]["sources"][0]["sha256"]]
        with self.assertRaisesRegex(ValueError, "Missing acknowledgment text"):
            builder["presentation_catalog"](coverage, corpus)
