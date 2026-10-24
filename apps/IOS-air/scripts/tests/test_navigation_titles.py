"""Inline navigation titles must fit next to a leading bar button on a 390 pt iPhone.

An inline title has roughly 220 pt beside a "Done"/"Cancel" button; at 17 pt semibold that is
about 22 Cyrillic or 26 Latin characters. Longer titles are truncated with an ellipsis, so every
catalog string used in `.navigationTitle(copy.text(...))` is checked in both languages.
"""

import json
from pathlib import Path
import re
import unittest


AIR_ROOT = Path(__file__).resolve().parents[2]
SOURCES = AIR_ROOT / "Packages/AirPresentation/Sources/AirPresentation"
CATALOG = SOURCES / "Resources/Localizable.xcstrings"
LIMITS = {"en": 26, "ru": 22}


def navigation_title_keys():
    keys = set()
    for path in SOURCES.rglob("*.swift"):
        text = path.read_text()
        for match in re.finditer(r"\.navigationTitle\(([^;]*?)\)\s*\n", text):
            for key in re.findall(r'copy\.text\(\s*"([^"]+)"', match.group(1)):
                keys.add(key)
            for key in re.findall(r'\?\s*"([^"]+)"\s*:\s*"([^"]+)"', match.group(1)):
                keys.update(key)
    return sorted(keys)


class NavigationTitleTests(unittest.TestCase):
    def test_titles_fit_beside_a_bar_button(self):
        catalog = json.loads(CATALOG.read_text())["strings"]
        keys = navigation_title_keys()
        self.assertTrue(keys, "expected navigation titles to be found")
        too_long = []
        for key in keys:
            localizations = catalog.get(key, {}).get("localizations", {})
            values = {"en": key}
            for language, unit in localizations.items():
                values[language] = unit.get("stringUnit", {}).get("value", key)
            for language, limit in LIMITS.items():
                value = values.get(language, key)
                if len(value) > limit:
                    too_long.append(f"{language}: {value!r} ({len(value)} > {limit}) for {key!r}")
        self.assertEqual(too_long, [], "\n".join(too_long))


if __name__ == "__main__":
    unittest.main()
