"""`xcstrings.py` keeps the string catalog and the `copy.text` / `copy.format` call sites aligned."""

import contextlib
import io
import json
from pathlib import Path
import runpy
import tempfile
import unittest


AIR_ROOT = Path(__file__).resolve().parents[2]
CATALOG = AIR_ROOT / "Packages/AirPresentation/Sources/AirPresentation/Resources/Localizable.xcstrings"
tool = runpy.run_path(str(AIR_ROOT / "scripts/xcstrings.py"))


def catalog_json(*entries, en=False):
    """Catalog text in the repository layout; `entries` are (key, ru) pairs."""
    strings = {}
    for key, ru in entries:
        localizations = {}
        if en:
            localizations["en"] = {"stringUnit": {"state": "translated", "value": key}}
        localizations["ru"] = {"stringUnit": {"state": "translated", "value": ru}}
        strings[key] = {"localizations": localizations}
    return json.dumps({"sourceLanguage": "en", "strings": strings, "version": "1.0"}, indent=2, ensure_ascii=False) + "\n"


def keys_in(swift):
    scan = tool["extract_usages"](swift, Path("Sample.swift"))
    return sorted(usage.key for usage in scan.usages)


def run(*argv):
    out = io.StringIO()
    err = io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = tool["main"](list(argv))
    return code, out.getvalue(), err.getvalue()


class ExtractionTests(unittest.TestCase):
    def test_single_line_calls(self):
        swift = '''
          Text(copy.text("Passwords")).font(.headline)
          .accessibilityLabel(copy.format("Collapse: %@", title))
          Button(copy.text("Done"), action: dismiss)
        '''
        self.assertEqual(keys_in(swift), ["Collapse: %@", "Done", "Passwords"])

    def test_multi_line_calls(self):
        swift = '''
          Text(
            copy.text(
              "Leave the group empty to save at the vault root."
            )
          )
          .font(.footnote)
          Text(
            copy.format(
              "Last updated %@",
              copy.date(Date(timeIntervalSince1970: Double(balance.fetchedAt) / 1_000)))
        '''
        self.assertEqual(keys_in(swift), ["Last updated %@", "Leave the group empty to save at the vault root."])
        scan = tool["extract_usages"](swift, Path("Sample.swift"))
        self.assertEqual([usage.line for usage in scan.usages], [4, 10])

    def test_escaped_quotes_and_escapes_are_decoded(self):
        swift = r'''
          Text(copy.text("Say \"hello\" to \\ everyone"))
          Text(copy.text("Everything yours.\nClose at hand."))
          Text(copy.text("Caf\u{E9}"))
        '''
        self.assertEqual(
            keys_in(swift),
            ["Café", "Everything yours.\nClose at hand.", 'Say "hello" to \\ everyone'],
        )

    def test_ternary_fallback_and_nested_groups(self):
        swift = '''
          Button(copy.text(model.state == .uncertain ? "Close" : "Cancel"))
          Text(copy.text(model.issue?.rawValue ?? "Connections could not be loaded."))
          Label(
            copy.text(
              (model.isSearching || model.hasFilters)
                ? "No matching credentials"
                : (isRoot ? "This vault is empty" : "This group is empty")),
            systemImage: "tray")
        '''
        self.assertEqual(
            keys_in(swift),
            [
                "Cancel",
                "Close",
                "Connections could not be loaded.",
                "No matching credentials",
                "This group is empty",
                "This vault is empty",
            ],
        )
        scan = tool["extract_usages"](swift, Path("Sample.swift"))
        self.assertEqual(scan.unparsed, [])

    def test_air_text_key_and_dynamic_arguments(self):
        swift = '''
          case "otp": return .key("With one-time codes")
          let title = AirText.key("In nested groups")
          case .key(let key): text(key)
          Text(copy.text(issue))
          Text(copy.text(model.issue ?? ""))
          Text(copy.text("Count: \\(count)"))
          other.text("Not a catalog key")
          // Text(copy.text("Commented out"))
          /* copy.text("Block comment") */
          Text(copy.text("Path is https://example.com//x"))
        '''
        scan = tool["extract_usages"](swift, Path("Sample.swift"))
        self.assertEqual(
            sorted(usage.key for usage in scan.usages),
            ["In nested groups", "Path is https://example.com//x", "With one-time codes"],
        )
        self.assertEqual(len(scan.dynamic), 3)  # `.key(let key)`, `issue`, `model.issue ?? ""`
        self.assertEqual(len(scan.unparsed), 1)  # the interpolated literal
        self.assertIn("Not a catalog key", scan.literals)


class CatalogTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.sources = self.root / "Sources"
        self.sources.mkdir()
        self.catalog = self.root / "Localizable.xcstrings"

    def write_swift(self, text, name="View.swift"):
        (self.sources / name).write_text(text)

    def test_missing_untranslated_and_unused(self):
        self.write_swift('Text(copy.text("Passwords"))\nText(copy.text("Groups"))\nlet other = "Only a literal"\n')
        catalog = json.loads(catalog_json(("Passwords", "Пароли"), ("Spare", "Запас"), ("Only a literal", "Литерал")))
        catalog["strings"]["Needs review"] = {
            "localizations": {"ru": {"stringUnit": {"state": "needs_review", "value": "Проверить"}}}
        }
        catalog["strings"]["English only"] = {
            "localizations": {"en": {"stringUnit": {"state": "translated", "value": "English only"}}}
        }
        self.catalog.write_text(tool["render"](catalog))
        code, out, _ = run("check", "--sources", str(self.sources), "--catalog", str(self.catalog))
        self.assertEqual(code, 1)
        self.assertIn("Missing from catalog (1):\n  'Groups'  ", out)
        self.assertIn("'Needs review'  state 'needs_review'", out)
        self.assertIn("'English only'  no ru localization", out)
        self.assertIn("Unused catalog keys (3):", out)
        self.assertNotIn("'Only a literal'\n", out.split("Unused catalog keys")[1])
        code, out, _ = run("list-unused", "--sources", str(self.sources), "--catalog", str(self.catalog))
        self.assertEqual((code, out), (0, "Spare\nNeeds review\nEnglish only\n"))

    def test_strict_unused_fails_only_when_unused_exist(self):
        self.write_swift('Text(copy.text("Passwords"))\n')
        self.catalog.write_text(catalog_json(("Passwords", "Пароли"), ("Spare", "Запас")))
        args = ("--sources", str(self.sources), "--catalog", str(self.catalog))
        self.assertEqual(run("check", *args)[0], 0)
        self.assertEqual(run("check", "--strict-unused", *args)[0], 1)
        self.catalog.write_text(catalog_json(("Passwords", "Пароли")))
        self.assertEqual(run("check", "--strict-unused", *args)[0], 0)

    def test_placeholder_mismatch(self):
        self.write_swift('copy.format("Collapse: %@", title)\ncopy.format("%lld of %lld", a, b)\ncopy.format("100%% done %@", x)\n')
        self.catalog.write_text(
            catalog_json(("Collapse: %@", "Свернуть"), ("%lld of %lld", "%2$lld из %1$lld"), ("100%% done %@", "%@ готово на 100%%"))
        )
        code, out, _ = run("check", "--sources", str(self.sources), "--catalog", str(self.catalog))
        self.assertEqual(code, 1)
        self.assertIn("Placeholder mismatch (1):\n  'Collapse: %@'  key ['%@'] vs ru []", out)
        self.assertEqual(tool["placeholders"]("%1$@ and %2$lld, %d%%"), ["%@", "%d", "%lld"])

    def test_add_and_remove_round_trip(self):
        original = catalog_json(("Passwords", "Пароли"), ("Amount (%@)", "Сумма (%@)"))
        self.catalog.write_text(original)
        code, out, _ = run("add", "Expand: %@", "--ru", "Развернуть: %@", "--catalog", str(self.catalog))
        self.assertEqual((code, out), (0, "Added 'Expand: %@'\n"))
        self.assertEqual(
            self.catalog.read_text(),
            catalog_json(("Passwords", "Пароли"), ("Amount (%@)", "Сумма (%@)"), ("Expand: %@", "Развернуть: %@")),
        )
        self.assertTrue(self.catalog.read_text().endswith("      }\n    }\n  },\n  \"version\": \"1.0\"\n}\n"))
        code, _, err = run("add", "Expand: %@", "--ru", "Другое", "--catalog", str(self.catalog))
        self.assertEqual(code, 1)
        self.assertIn("Placeholder mismatch", err)
        code, _, err = run("add", "Expand: %@", "--ru", "Раскрыть: %@", "--catalog", str(self.catalog))
        self.assertEqual(code, 1)
        self.assertIn("already exists", err)
        code, out, _ = run("add", "Expand: %@", "--ru", "Раскрыть: %@", "--force", "--catalog", str(self.catalog))
        self.assertEqual((code, out), (0, "Replaced 'Expand: %@'\n"))
        self.assertEqual(tool["translation"](json.loads(self.catalog.read_text())["strings"]["Expand: %@"])["value"], "Раскрыть: %@")
        code, _, err = run("remove", "Expand: %@", "Nope", "--catalog", str(self.catalog))
        self.assertEqual(code, 1)
        self.assertIn("Key not in catalog: 'Nope'", err)
        self.assertIn("Expand: %@", json.loads(self.catalog.read_text())["strings"])
        code, out, _ = run("remove", "Expand: %@", "--catalog", str(self.catalog))
        self.assertEqual((code, out), (0, "Removed 'Expand: %@'\n"))
        self.assertEqual(self.catalog.read_text(), original)

    def test_force_keeps_other_localizations_and_extraction_state(self):
        catalog = json.loads(catalog_json(("Passwords", "Пароли"), en=True))
        catalog["strings"]["Passwords"]["extractionState"] = "manual"
        self.catalog.write_text(tool["render"](catalog))
        self.assertEqual(run("add", "Passwords", "--ru", "Пароли!", "--force", "--catalog", str(self.catalog))[0], 0)
        entry = json.loads(self.catalog.read_text())["strings"]["Passwords"]
        self.assertEqual(entry["extractionState"], "manual")
        self.assertEqual(entry["localizations"]["en"]["stringUnit"]["value"], "Passwords")
        self.assertEqual(entry["localizations"]["ru"]["stringUnit"]["value"], "Пароли!")

    def test_writer_refuses_a_foreign_layout(self):
        self.catalog.write_text(json.dumps({"sourceLanguage": "en", "strings": {}, "version": "1.0"}, indent=4) + "\n")
        with self.assertRaises(SystemExit):
            run("add", "Key", "--ru", "Ключ", "--catalog", str(self.catalog))


class RepositoryCatalogTests(unittest.TestCase):
    def test_repository_catalog_round_trips_byte_for_byte(self):
        raw = CATALOG.read_text()
        self.assertEqual(tool["render"](json.loads(raw)), raw)


if __name__ == "__main__":
    unittest.main()
