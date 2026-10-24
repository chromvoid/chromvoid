#!/usr/bin/env python3
"""Plan batched `xcodebuild test-without-building` runs and merge their logs into one report.

The full BridgeTests run (XCTest plus Swift Testing, about twenty minutes) is regularly
killed by macOS memory pressure on a laptop, so `test-native.sh` runs it as several
smaller `-only-testing:` invocations. `plan` discovers the suites and splits them into
batches; `report` reads the per-batch logs back into a single summary.

  test-batches.py plan [--batches N] [--ui-batch-size M] [--filter S] [--kind unit|ui|all]
                       [--batch K] [--format json|args|count]
  test-batches.py report LOG_OR_DIR...

Unit suites are the test types declared at column zero in `Tests/{Access,Bridge,Credentials,
Files,Media,Wallet}/*.swift` (files without `@Test` / `func test` are helpers and skipped;
a file with several suites keeps them in one batch). UI tests are the `func test…()` names
in `Tests/UI/AirUITests.swift` and `Tests/UI/AirBrandMotionTests.swift`; opt-in marketing
captures remain outside the verification plan.
"""

import argparse
import json
from pathlib import Path
import re
import sys

AIR_ROOT = Path(__file__).resolve().parents[1]
UNIT_TARGET = "BridgeTests"
UNIT_DIRS = ("Access", "Bridge", "Credentials", "Files", "Media", "Wallet")
UI_TARGET = "AirUITests"
UI_FILES = (Path("UI/AirUITests.swift"), Path("UI/AirBrandMotionTests.swift"))
LOG_GLOB = "xctest-*.log"

TYPE_DECLARATION = re.compile(
    r"^(?P<prefix>(?:(?:@\w+(?:\([^)]*\))?|private|fileprivate|internal|public|final|open)\s+)*)"
    r"(?:class|struct|actor|enum)\s+(?P<name>[A-Za-z_]\w*)"
)
TEST_MARKER = re.compile(r"@Test\b|\bfunc\s+test(?:[A-Z0-9_]\w*)?\s*\(")
TEST_FUNCTION = re.compile(r"^\s*(?:(?:@\w+(?:\([^)]*\))?|override)\s+)*func\s+(test(?:[A-Z0-9_]\w*)?)\s*\(")
XCTEST_CLASS = re.compile(r"^\s*(?:final\s+)?class\s+(\w+)\s*:\s*XCTestCase")

XCTEST_SUMMARY = re.compile(r"Executed (\d+) tests?, with (\d+) failures?")
SWIFT_SUMMARY = re.compile(r"Test run with (\d+) tests? in \d+ suites? (passed|failed)")
XCTEST_ERROR = re.compile(r"error: -\[([\w.]+) (\w+)\]")
XCTEST_CASE_FAILED = re.compile(r"Test Case '-\[([\w.]+) (\w+)\]' failed")
SWIFT_FAILURE = re.compile(
    r"Test (?:\"(?P<display>[^\"]+)\"|(?P<function>[\w.]+\([^)]*\)))(?: in \S+)? (?:recorded an issue|failed after)"
)
RESULT_MARKER = re.compile(r"\*\* TEST (?:EXECUTE )?(SUCCEEDED|FAILED) \*\*")


class UnitFile:
    """One Swift file of the unit-test target: the suites it declares and its weight."""

    def __init__(self, path, suites, weight):
        self.path = path
        self.suites = suites
        self.weight = weight


def unit_suites(source):
    """Names of the column-zero types in `source` that contain test cases."""
    regions = []  # (name, private, body lines)
    for line in source.splitlines():
        match = TYPE_DECLARATION.match(line)
        if match:
            private = re.search(r"\b(?:private|fileprivate)\b", match.group("prefix")) is not None
            regions.append((match.group("name"), private, []))
        elif regions:
            regions[-1][2].append(line)
    return [name for name, private, body in regions if not private and any(TEST_MARKER.search(l) for l in body)]


def discover_unit_files(tests_dir):
    files = []
    for directory in UNIT_DIRS:
        for path in sorted((tests_dir / directory).glob("*.swift")):
            suites = unit_suites(path.read_text(encoding="utf-8"))
            if suites:
                files.append(UnitFile(path, suites, path.stat().st_size))
    return files


def discover_ui_tests(tests_dir):
    """`AirUITests/<Class>/<test>` identifiers in the configured file order."""
    identifiers = []
    for relative in UI_FILES:
        path = tests_dir / relative
        if not path.is_file():
            continue
        test_class = path.stem
        for line in path.read_text(encoding="utf-8").splitlines():
            class_match = XCTEST_CLASS.match(line)
            if class_match:
                test_class = class_match.group(1)
                continue
            function_match = TEST_FUNCTION.match(line)
            if function_match:
                identifiers.append(f"{UI_TARGET}/{test_class}/{function_match.group(1)}")
    return identifiers


def matches(name, needle):
    return not needle or needle.casefold() in name.casefold()


def balance(files, batches):
    """Longest-processing-time greedy split: heaviest file first into the lightest batch."""
    count = max(1, min(batches, len(files)))
    groups = [[] for _ in range(count)]
    weights = [0] * count
    for unit_file in sorted(files, key=lambda f: (-f.weight, f.path.name)):
        index = min(range(count), key=lambda i: (weights[i], i))
        groups[index].append(unit_file)
        weights[index] += unit_file.weight
    return [group for group in groups if group]


def plan_unit(tests_dir, batches, needle=""):
    files = []
    for unit_file in discover_unit_files(tests_dir):
        suites = [suite for suite in unit_file.suites if matches(suite, needle)]
        if suites:
            files.append(UnitFile(unit_file.path, suites, unit_file.weight))
    return [
        sorted(f"{UNIT_TARGET}/{suite}" for unit_file in group for suite in unit_file.suites)
        for group in balance(files, batches)
    ]


def plan_ui(tests_dir, batch_size, needle=""):
    tests = [test for test in discover_ui_tests(tests_dir) if matches(test.rsplit("/", 1)[-1], needle)]
    size = max(1, batch_size)
    return [tests[i : i + size] for i in range(0, len(tests), size)]


def only_testing_lines(batch):
    return [f"-only-testing:{identifier}" for identifier in batch]


def command_plan(args):
    plan = {}
    if args.kind in ("unit", "all"):
        plan["unit"] = plan_unit(args.tests_dir, args.batches, args.filter)
    if args.kind in ("ui", "all"):
        plan["ui"] = plan_ui(args.tests_dir, args.ui_batch_size, args.filter)
    if args.batch is not None:
        if args.kind == "all":
            print("--batch needs --kind unit or --kind ui", file=sys.stderr)
            return 2
        batches = plan[args.kind]
        if not 1 <= args.batch <= len(batches):
            print(f"--batch {args.batch} is out of range: {len(batches)} {args.kind} batches", file=sys.stderr)
            return 2
        plan = {args.kind: [batches[args.batch - 1]]}

    if args.format == "count":
        print(sum(len(batches) for batches in plan.values()))
    elif args.format == "args":
        chunks = ["\n".join(only_testing_lines(batch)) for batches in plan.values() for batch in batches]
        if chunks:
            print("\n\n".join(chunks))
    else:
        print(json.dumps(plan, indent=2))
    return 0


class BatchResult:
    def __init__(self, name):
        self.name = name
        self.xctest_executed = None
        self.xctest_failed = None
        self.swift_tests = None
        self.swift_status = None
        self.marker = None
        self.failures = []

    @property
    def status(self):
        if self.marker is None:
            return "incomplete"
        if self.marker == "FAILED" or self.failures or (self.xctest_failed or 0) > 0 or self.swift_status == "failed":
            return "failed"
        return "passed"

    def note_failure(self, name):
        if name not in self.failures:
            self.failures.append(name)


def parse_log(name, text):
    result = BatchResult(name)
    for line in text.splitlines():
        summary = XCTEST_SUMMARY.search(line)
        if summary:  # the last one is the cumulative "All tests" line
            result.xctest_executed, result.xctest_failed = int(summary.group(1)), int(summary.group(2))
        swift = SWIFT_SUMMARY.search(line)
        if swift:
            result.swift_tests, result.swift_status = int(swift.group(1)), swift.group(2)
        for pattern in (XCTEST_ERROR, XCTEST_CASE_FAILED):
            failed = pattern.search(line)
            if failed:
                result.note_failure(f"{failed.group(1)}.{failed.group(2)}")
        swift_failed = SWIFT_FAILURE.search(line)
        if swift_failed:
            result.note_failure(swift_failed.group("display") or swift_failed.group("function"))
        marker = RESULT_MARKER.search(line)
        if marker:
            result.marker = marker.group(1)
    return result


def collect_logs(paths):
    logs = []
    for raw in paths:
        path = Path(raw)
        if path.is_dir():
            logs.extend(sorted(path.glob(LOG_GLOB)))
        else:
            logs.append(path)
    return logs


def batch_name(path):
    stem = path.stem
    return stem[len("xctest-") :] if stem.startswith("xctest-") else stem


def render_report(results):
    width = max([len("Batch")] + [len(r.name) for r in results])
    lines = [f"{'Batch':<{width}}  {'XCTest run/failed':<18}  {'Swift Testing':<16}  Status"]
    for result in results:
        xctest = "-" if result.xctest_executed is None else f"{result.xctest_executed}/{result.xctest_failed}"
        swift = "-" if result.swift_tests is None else f"{result.swift_tests} {result.swift_status}"
        lines.append(f"{result.name:<{width}}  {xctest:<18}  {swift:<16}  {result.status}")
    total_x = sum(r.xctest_executed or 0 for r in results)
    total_xf = sum(r.xctest_failed or 0 for r in results)
    total_s = sum(r.swift_tests or 0 for r in results)
    lines.append(f"{'Total':<{width}}  {f'{total_x}/{total_xf}':<18}  {total_s:<16}")
    failing = [name for r in results for name in r.failures]
    if failing:
        lines.append("Failing tests:")
        lines.extend(f"  {name}" for name in failing)
    failed = sum(r.status == "failed" for r in results)
    incomplete = sum(r.status == "incomplete" for r in results)
    if failed or incomplete:
        lines.append(f"Result: FAILED ({failed} failed, {incomplete} incomplete of {len(results)} batches)")
    else:
        lines.append(f"Result: PASSED ({len(results)} batches)")
    return "\n".join(lines)


def command_report(args):
    logs = collect_logs(args.logs)
    if not logs:
        print("No xctest-*.log files found", file=sys.stderr)
        return 1
    results = [parse_log(batch_name(path), path.read_text(encoding="utf-8", errors="replace")) for path in logs]
    print(render_report(results))
    return 0 if all(result.status == "passed" for result in results) else 1


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)

    plan = commands.add_parser("plan", help="split the suites into batches")
    plan.add_argument("--tests-dir", type=Path, default=AIR_ROOT / "Tests")
    plan.add_argument("--batches", type=int, default=4, help="number of unit-test batches (default 4)")
    plan.add_argument("--ui-batch-size", type=int, default=4, help="UI tests per batch (default 4)")
    plan.add_argument("--filter", default="", help="keep only suites/tests whose name contains this substring")
    plan.add_argument("--kind", choices=("unit", "ui", "all"), default="all")
    plan.add_argument("--batch", type=int, help="print only this 1-based batch of --kind")
    plan.add_argument("--format", choices=("json", "args", "count"), default="json")
    plan.set_defaults(run=command_plan)

    report = commands.add_parser("report", help="summarise xcodebuild logs")
    report.add_argument("logs", nargs="+", help="xctest-*.log files or directories containing them")
    report.set_defaults(run=command_report)

    args = parser.parse_args(argv)
    return args.run(args)


if __name__ == "__main__":
    sys.exit(main())
