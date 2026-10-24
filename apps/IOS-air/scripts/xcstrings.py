#!/usr/bin/env python3
"""Keep `Localizable.xcstrings` in step with the `copy.text(...)` / `copy.format(...)` call sites.

English is the catalog key; every key needs a translated `ru` value. The catalog is Xcode String
Catalog JSON whose layout equals `json.dumps(indent=2, ensure_ascii=False)` plus a trailing
newline, so structural edits reproduce the file byte for byte for untouched entries (the writer
refuses to save when that stops being true).

    xcstrings.py check [--sources DIR] [--catalog FILE] [--strict-unused] [--verbose]
    xcstrings.py add KEY --ru VALUE [--force] [--catalog FILE]
    xcstrings.py remove KEY... [--catalog FILE]
    xcstrings.py list-unused [--sources DIR] [--catalog FILE]

Extraction understands the first argument of `copy.text(` / `copy.format(` and of
`AirText.key(` / `.key(`: a plain literal, a ternary whose branches are literals
(`flag ? "A" : "B"`) and a `??` fallback literal. Comments are skipped, escapes (`\\"`, `\\n`,
`\\u{...}`) are decoded, and multi-line calls are followed across lines. Arguments without a
literal (`copy.text(issue)`) are dynamic and cannot be checked here.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass, field
import json
from pathlib import Path
import re
import sys

AIR_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCES = AIR_ROOT / "Packages/AirPresentation/Sources/AirPresentation"
DEFAULT_CATALOG = DEFAULT_SOURCES / "Resources/Localizable.xcstrings"
LANGUAGE = "ru"

# `copy.text(` / `copy.format(` on a receiver literally named `copy`, and `AirText.key(` / `.key(`.
CALL_PATTERN = re.compile(
    r"(?<![A-Za-z0-9_])copy\s*\.\s*(?:text|format)\s*\(|(?<![A-Za-z0-9_])(?:AirText\s*)?\.key\s*\("
)
# printf-style placeholders as Foundation `String(format:)` accepts them; `%%` is a literal percent.
PLACEHOLDER_PATTERN = re.compile(
    r"%(?:(\d+)\$)?[-+ 0#]*(?:\d+|\*)?(?:\.(?:\d+|\*))?(hh|h|ll|l|q|z|t|j|L)?([@dDiuUxXoOfeEgGaAcCsSp])|%%"
)
SIMPLE_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "0": "\0", "\\": "\\", '"': '"', "'": "'"}


# --- Swift scanning -----------------------------------------------------------------------------


@dataclass
class Token:
    """A run of code or one string literal. `text` is decoded for strings, raw for code."""

    kind: str  # "code" | "string" | "interpolated" | "multiline"
    text: str
    line: int


@dataclass
class Usage:
    key: str
    path: Path
    line: int


@dataclass
class Scan:
    usages: list[Usage] = field(default_factory=list)
    dynamic: list[tuple[Path, int, str]] = field(default_factory=list)
    unparsed: list[tuple[Path, int, str]] = field(default_factory=list)
    literals: set[str] = field(default_factory=set)  # every static literal in the sources

    @property
    def keys(self) -> set[str]:
        return {usage.key for usage in self.usages}


def tokenize(source: str) -> list[Token]:
    """Split Swift source into code and string tokens, dropping comments."""
    tokens: list[Token] = []
    code: list[str] = []
    code_line = 1
    line = 1
    i = 0
    n = len(source)

    def flush_code() -> None:
        nonlocal code, code_line
        if code:
            tokens.append(Token("code", "".join(code), code_line))
            code = []
        code_line = line

    def read_string(start: int, raw_hashes: int) -> tuple[int, Token]:
        """Read from the opening quote; returns (index after the literal, token)."""
        nonlocal line
        start_line = line
        multiline = source.startswith('"""', start)
        j = start + (3 if multiline else 1)
        close = ('"""' if multiline else '"') + "#" * raw_hashes
        parts: list[str] = []
        interpolated = False
        while j < n:
            if source.startswith(close, j):
                j += len(close)
                kind = "multiline" if multiline else ("interpolated" if interpolated else "string")
                return j, Token(kind, "".join(parts), start_line)
            char = source[j]
            if char == "\n":
                line += 1
                if not multiline:
                    break  # unterminated; give up on this literal
                parts.append(char)
                j += 1
                continue
            if char == "\\" and raw_hashes == 0 and j + 1 < n:
                escape = source[j + 1]
                if escape == "(":
                    interpolated = True
                    j = skip_interpolation(j + 2)
                    continue
                if escape == "u" and source.startswith("{", j + 2):
                    end = source.find("}", j + 3)
                    if end != -1:
                        try:
                            parts.append(chr(int(source[j + 3 : end], 16)))
                        except ValueError:
                            parts.append(source[j : end + 1])
                        j = end + 1
                        continue
                parts.append(SIMPLE_ESCAPES.get(escape, "\\" + escape))
                j += 2
                continue
            if char == "\\" and raw_hashes and source.startswith("#" * raw_hashes + "(", j + 1):
                interpolated = True
                j = skip_interpolation(j + 2 + raw_hashes)
                continue
            parts.append(char)
            j += 1
        return j, Token("interpolated", "".join(parts), start_line)

    def skip_interpolation(start: int) -> int:
        """`start` is just after `\\(`; return the index after the matching `)`."""
        nonlocal line
        depth = 1
        j = start
        while j < n and depth:
            char = source[j]
            if char == "\n":
                line += 1
            elif char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
            elif char == '"':
                j, _ = read_string(j, 0)
                continue
            j += 1
        return j

    while i < n:
        char = source[i]
        if source.startswith("//", i):
            end = source.find("\n", i)
            i = n if end == -1 else end
            continue
        if source.startswith("/*", i):
            depth = 1
            i += 2
            while i < n and depth:
                if source.startswith("/*", i):
                    depth += 1
                    i += 2
                elif source.startswith("*/", i):
                    depth -= 1
                    i += 2
                else:
                    if source[i] == "\n":
                        line += 1
                    i += 1
            continue
        hashes = 0
        while source.startswith("#", i + hashes):
            hashes += 1
        if source.startswith('"', i + hashes):
            flush_code()
            i, token = read_string(i + hashes, hashes)
            tokens.append(token)
            code_line = line
            continue
        if hashes:
            code.append(source[i : i + hashes])
            i += hashes
            continue
        if char == "\n":
            line += 1
        code.append(char)
        i += 1
    flush_code()
    return tokens


def _first_argument(tokens: list[Token], start: int, offset: int) -> tuple[list[Token], int] | None:
    """Tokens of the first argument of the call whose `(` sits at `tokens[start].text[offset]`.

    Returns the argument tokens (code tokens trimmed to the argument) and the index of the token
    holding the closing parenthesis or comma, or None when the call is unterminated.
    """
    argument: list[Token] = []
    depth = 0
    index = start
    position = offset + 1
    while index < len(tokens):
        token = tokens[index]
        if token.kind != "code":
            argument.append(token)
            index += 1
            position = 0
            continue
        text = token.text
        piece_start = position
        while position < len(text):
            char = text[position]
            if char in "([{":
                depth += 1
            elif char in ")]}":
                if depth == 0:
                    argument.append(Token("code", text[piece_start:position], token.line))
                    return argument, index
                depth -= 1
            elif char == "," and depth == 0:
                argument.append(Token("code", text[piece_start:position], token.line))
                return argument, index
            position += 1
        argument.append(Token("code", text[piece_start:], token.line))
        index += 1
        position = 0
    return None


def _split_operands(argument: list[Token]) -> list[list[Token]]:
    """Split at top-level `?`, `:` and `??` so ternary branches and fallbacks stand alone."""
    operands: list[list[Token]] = [[]]
    depth = 0
    for token in argument:
        if token.kind != "code":
            operands[-1].append(token)
            continue
        text = token.text
        piece = []
        k = 0
        while k < len(text):
            char = text[k]
            if char in "([{":
                depth += 1
            elif char in ")]}":
                depth -= 1
            if depth == 0 and char == "?":
                if text.startswith("??", k):
                    operands[-1].append(Token("code", "".join(piece), token.line))
                    operands.append([])
                    piece = []
                    k += 2
                    continue
                if not text.startswith("?.", k) and not (k > 0 and text[k - 1] == "?"):
                    operands[-1].append(Token("code", "".join(piece), token.line))
                    operands.append([])
                    piece = []
                    k += 1
                    continue
            if depth == 0 and char == ":":
                operands[-1].append(Token("code", "".join(piece), token.line))
                operands.append([])
                piece = []
                k += 1
                continue
            piece.append(char)
            k += 1
        operands[-1].append(Token("code", "".join(piece), token.line))
    return operands


def _strip_parens(operand: list[Token]) -> list[Token] | None:
    """`( ... )` wrapping the whole operand, with its parentheses removed; None otherwise."""
    code_chars = [
        (index, offset, char)
        for index, token in enumerate(operand)
        if token.kind == "code"
        for offset, char in enumerate(token.text)
        if not char.isspace()
    ]
    if not code_chars or code_chars[0][2] != "(" or code_chars[-1][2] != ")":
        return None
    depth = 0
    for position, (_, _, char) in enumerate(code_chars):
        if char in "([{":
            depth += 1
        elif char in ")]}":
            depth -= 1
            if depth == 0 and position != len(code_chars) - 1:
                return None  # the group closes before the operand ends: `(a) ? "x" : (b)`
    inner = list(operand)
    for index, offset, _ in (code_chars[-1], code_chars[0]):  # last first: offsets stay valid
        token = inner[index]
        inner[index] = Token("code", token.text[:offset] + token.text[offset + 1 :], token.line)
    return inner


def _collect(argument: list[Token], path: Path, call_line: int, call_text: str, scan: Scan) -> tuple[bool, bool]:
    """Record keys in `argument`; returns (found a literal key, found a dynamic operand)."""
    literal_found = dynamic_found = False
    for operand in _split_operands(argument):
        strings = [t for t in operand if t.kind != "code"]
        code = "".join(t.text for t in operand if t.kind == "code").strip()
        if len(strings) == 1 and not code and strings[0].kind == "string":
            if strings[0].text:
                scan.usages.append(Usage(strings[0].text, path, strings[0].line))
                literal_found = True
            continue
        inner = _strip_parens(operand)
        if inner is not None and inner != operand:
            found_literal, found_dynamic = _collect(inner, path, call_line, call_text, scan)
            literal_found |= found_literal
            dynamic_found |= found_dynamic
            continue
        if strings:
            detail = "; ".join(f"{t.kind} {t.text!r}" for t in strings)
            scan.unparsed.append((path, call_line, f"{call_text}…) literal in expression: {detail}"))
            literal_found = True
        elif code:
            dynamic_found = True
    return literal_found, dynamic_found


def extract_usages(source: str, path: Path, scan: Scan | None = None) -> Scan:
    """Collect catalog keys used by `copy.text` / `copy.format` / `.key` calls in one file."""
    scan = scan or Scan()
    tokens = tokenize(source)
    for token in tokens:
        if token.kind == "string" and token.text:
            scan.literals.add(token.text)
    for index, token in enumerate(tokens):
        if token.kind != "code":
            continue
        for match in CALL_PATTERN.finditer(token.text):
            call_line = token.line + token.text.count("\n", 0, match.start())
            call_text = match.group(0).replace("\n", " ")
            found = _first_argument(tokens, index, match.end() - 1)
            if found is None:
                scan.unparsed.append((path, call_line, f"{call_text}… unterminated call"))
                continue
            argument, _ = found
            literal_found, dynamic_found = _collect(argument, path, call_line, call_text, scan)
            if dynamic_found and not literal_found:
                summary = "".join(t.text for t in argument).strip()
                scan.dynamic.append((path, call_line, f"{call_text}{summary})"))
    return scan


def scan_sources(sources: Path) -> Scan:
    scan = Scan()
    for path in sorted(sources.rglob("*.swift")):
        extract_usages(path.read_text(encoding="utf-8"), path, scan)
    return scan


# --- Catalog ------------------------------------------------------------------------------------


def render(catalog: dict) -> str:
    return json.dumps(catalog, indent=2, ensure_ascii=False) + "\n"


def load_catalog(path: Path) -> tuple[dict, str]:
    raw = path.read_text(encoding="utf-8")
    return json.loads(raw), raw


def save_catalog(path: Path, catalog: dict, original: str) -> None:
    """Write the catalog; refuse when the original layout would not survive the round trip."""
    if render(json.loads(original)) != original:
        raise SystemExit(
            f"{path}: layout differs from json.dumps(indent=2, ensure_ascii=False); "
            "refusing to rewrite the whole file. Normalise it first or edit by hand."
        )
    path.write_text(render(catalog), encoding="utf-8")


def translation(entry: dict, language: str = LANGUAGE) -> dict | None:
    return entry.get("localizations", {}).get(language, {}).get("stringUnit")


def placeholders(text: str) -> list[str]:
    """Conversion specifiers in `text`, positional indices dropped (`%1$@` -> `%@`)."""
    found = []
    for match in PLACEHOLDER_PATTERN.finditer(text):
        if match.group(0) == "%%":
            continue
        found.append("%" + (match.group(2) or "") + match.group(3))
    return sorted(found)


@dataclass
class Report:
    missing: dict[str, list[Usage]]
    untranslated: dict[str, str]
    mismatched: dict[str, tuple[list[str], list[str]]]
    unused: list[str]
    indirect: list[str]  # catalog keys that only appear as literals outside checked calls
    scan: Scan
    catalog_size: int

    @property
    def failed(self) -> bool:
        return bool(self.missing or self.untranslated or self.mismatched)


def analyse(catalog: dict, scan: Scan, language: str = LANGUAGE) -> Report:
    strings: dict[str, dict] = catalog.get("strings", {})
    missing: dict[str, list[Usage]] = {}
    for usage in scan.usages:
        if usage.key not in strings:
            missing.setdefault(usage.key, []).append(usage)
    untranslated: dict[str, str] = {}
    mismatched: dict[str, tuple[list[str], list[str]]] = {}
    for key, entry in strings.items():
        unit = translation(entry, language)
        if unit is None:
            untranslated[key] = f"no {language} localization"
            continue
        state = unit.get("state")
        value = unit.get("value", "")
        if state != "translated":
            untranslated[key] = f"state {state!r}"
        elif not value:
            untranslated[key] = f"empty {language} value"
        elif placeholders(key) != placeholders(value):
            mismatched[key] = (placeholders(key), placeholders(value))
    used = scan.keys
    unused = [key for key in strings if key not in used and key not in scan.literals]
    indirect = [key for key in strings if key not in used and key in scan.literals]
    return Report(missing, untranslated, mismatched, unused, indirect, scan, len(strings))


def relative(path: Path) -> str:
    try:
        return str(path.relative_to(AIR_ROOT))
    except ValueError:
        return str(path)


def print_report(report: Report, verbose: bool, strict_unused: bool) -> None:
    scan = report.scan
    if report.missing:
        print(f"Missing from catalog ({len(report.missing)}):")
        for key, usages in sorted(report.missing.items()):
            where = ", ".join(f"{relative(u.path)}:{u.line}" for u in usages[:3])
            more = f" (+{len(usages) - 3})" if len(usages) > 3 else ""
            print(f"  {key!r}  {where}{more}")
    if report.untranslated:
        print(f"Untranslated ({len(report.untranslated)}):")
        for key, reason in sorted(report.untranslated.items()):
            print(f"  {key!r}  {reason}")
    if report.mismatched:
        print(f"Placeholder mismatch ({len(report.mismatched)}):")
        for key, (expected, actual) in sorted(report.mismatched.items()):
            print(f"  {key!r}  key {expected} vs {LANGUAGE} {actual}")
    if scan.unparsed:
        print(f"Literals in expressions the scanner does not follow ({len(scan.unparsed)}):")
        for path, line, detail in scan.unparsed:
            print(f"  {relative(path)}:{line}  {detail}")
    heading = "Unused catalog keys" if not strict_unused else "Unused catalog keys (strict)"
    if report.unused:
        print(f"{heading} ({len(report.unused)}):")
        for key in report.unused:
            print(f"  {key!r}")
    if verbose:
        if report.indirect:
            print(f"Catalog keys found only as literals outside copy calls ({len(report.indirect)}):")
            for key in report.indirect:
                print(f"  {key!r}")
        if scan.dynamic:
            print(f"Dynamic calls the scanner cannot check ({len(scan.dynamic)}):")
            for path, line, detail in scan.dynamic:
                print(f"  {relative(path)}:{line}  {detail}")
    print(
        f"Summary: {len(scan.usages)} literal usages of {len(scan.keys)} keys; "
        f"{len(scan.dynamic)} dynamic calls; catalog {report.catalog_size} keys; "
        f"missing {len(report.missing)}, untranslated {len(report.untranslated)}, "
        f"placeholder mismatch {len(report.mismatched)}, unused {len(report.unused)}, "
        f"indirect {len(report.indirect)}"
    )


# --- Commands -----------------------------------------------------------------------------------


def command_check(args: argparse.Namespace) -> int:
    catalog, _ = load_catalog(args.catalog)
    report = analyse(catalog, scan_sources(args.sources))
    print_report(report, verbose=args.verbose, strict_unused=args.strict_unused)
    if report.failed or (args.strict_unused and report.unused):
        return 1
    return 0


def command_list_unused(args: argparse.Namespace) -> int:
    catalog, _ = load_catalog(args.catalog)
    report = analyse(catalog, scan_sources(args.sources))
    for key in report.unused:
        print(key)
    return 0


def command_add(args: argparse.Namespace) -> int:
    catalog, original = load_catalog(args.catalog)
    strings = catalog.setdefault("strings", {})
    expected, actual = placeholders(args.key), placeholders(args.ru)
    if expected != actual:
        print(f"Placeholder mismatch: key {expected} vs {LANGUAGE} {actual}", file=sys.stderr)
        return 1
    if args.key in strings:
        if not args.force:
            print(f"Key already exists (use --force to replace the {LANGUAGE} value): {args.key!r}", file=sys.stderr)
            return 1
        localizations = strings[args.key].setdefault("localizations", {})
        localizations[LANGUAGE] = {"stringUnit": {"state": "translated", "value": args.ru}}
    else:
        strings[args.key] = {
            "localizations": {LANGUAGE: {"stringUnit": {"state": "translated", "value": args.ru}}}
        }
    save_catalog(args.catalog, catalog, original)
    print(f"{'Replaced' if args.force and args.key in strings else 'Added'} {args.key!r}")
    return 0


def command_remove(args: argparse.Namespace) -> int:
    catalog, original = load_catalog(args.catalog)
    strings = catalog.get("strings", {})
    absent = [key for key in args.keys if key not in strings]
    if absent:
        for key in absent:
            print(f"Key not in catalog: {key!r}", file=sys.stderr)
        return 1
    for key in args.keys:
        del strings[key]
    save_catalog(args.catalog, catalog, original)
    for key in args.keys:
        print(f"Removed {key!r}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)

    def catalog_option(sub: argparse.ArgumentParser) -> None:
        sub.add_argument("--catalog", type=Path, default=DEFAULT_CATALOG, help="Localizable.xcstrings path")

    def sources_option(sub: argparse.ArgumentParser) -> None:
        sub.add_argument("--sources", type=Path, default=DEFAULT_SOURCES, help="directory scanned for *.swift")

    check = commands.add_parser("check", help="report missing, untranslated, mismatched and unused keys")
    sources_option(check)
    catalog_option(check)
    check.add_argument("--strict-unused", action="store_true", help="unused catalog keys fail the check")
    check.add_argument("--verbose", action="store_true", help="also list dynamic calls and indirect keys")
    check.set_defaults(run=command_check)

    unused = commands.add_parser("list-unused", help="print catalog keys no Swift source references")
    sources_option(unused)
    catalog_option(unused)
    unused.set_defaults(run=command_list_unused)

    add = commands.add_parser("add", help="append a key with its Russian value")
    add.add_argument("key")
    add.add_argument("--ru", required=True, help="Russian value")
    add.add_argument("--force", action="store_true", help="replace the Russian value of an existing key")
    catalog_option(add)
    add.set_defaults(run=command_add)

    remove = commands.add_parser("remove", help="delete keys from the catalog")
    remove.add_argument("keys", nargs="+", metavar="KEY")
    catalog_option(remove)
    remove.set_defaults(run=command_remove)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.run(args)


if __name__ == "__main__":
    sys.exit(main())
