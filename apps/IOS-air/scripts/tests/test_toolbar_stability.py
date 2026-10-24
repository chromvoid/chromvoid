"""A toolbar item may not come and go with its screen's loading state.

An item added once a screen has loaded pushes the title, or its neighbours, sideways as it
appears; the whole bar relays out and blinks. The rule: every `ToolbarItem` is declared
unconditionally and made `.disabled(...)` until it can be used. The few items that belong to a
mode the person switches on themselves (selection, an open draft) are allowed, and each such
`if` carries a `// toolbar-mode: <reason>` comment on the line above so the exception is a
decision and not an oversight.
"""

from pathlib import Path
import re
import unittest

AIR_ROOT = Path(__file__).resolve().parents[2]
SOURCES = AIR_ROOT / "Packages/AirPresentation/Sources/AirPresentation"
MARKER = "// toolbar-mode:"


def toolbar_blocks(text):
    """Every `.toolbar { … }` body with the line its opening brace sits on."""
    for match in re.finditer(r"\.toolbar\s*(?:\([^)]*\)\s*)?\{", text):
        index, depth = match.end(), 1
        while depth and index < len(text):
            depth += {"{": 1, "}": -1}.get(text[index], 0)
            index += 1
        yield text[: match.end()].count("\n") + 1, text[match.end() : index - 1]


def conditional_items(body, first_line):
    """`if`/`else if` lines that decide whether a toolbar item exists at all."""
    for match in re.finditer(r"^[ \t]*(?:\}\s*else\s+)?if\b[^\n]*\{[ \t]*$", body, re.M):
        rest = body[match.end() :]
        # Only a condition wrapping an item matters; one inside a button's action does not.
        if not re.match(r"\s*Toolbar(Item|ItemGroup)?\b", rest) and not re.match(
            r"\s*(Button|Menu)\b", rest
        ):
            continue
        before = body[: match.start()].rstrip("\n").rsplit("\n", 1)[-1]
        if MARKER in before:
            continue
        yield first_line + body[: match.start()].count("\n"), match.group(0).strip()


class ToolbarStabilityTests(unittest.TestCase):
    def test_toolbar_items_do_not_appear_with_their_screen(self):
        offenders = []
        for path in sorted(SOURCES.rglob("*.swift")):
            text = path.read_text()
            for line, body in toolbar_blocks(text):
                if "Toolbar" not in body:
                    continue
                for number, condition in conditional_items(body, line):
                    offenders.append(
                        f"{path.relative_to(AIR_ROOT)}:{number}: {condition}"
                    )
        self.assertEqual(
            offenders,
            [],
            "A toolbar item must be declared unconditionally and disabled until it can be "
            "used, or carry a `%s <reason>` comment when it belongs to a mode the person "
            "switches on:\n%s" % (MARKER, "\n".join(offenders)),
        )


if __name__ == "__main__":
    unittest.main()
