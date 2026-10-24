"""`test-batches.py` splits the native test suites into batches and merges the batch logs."""

import contextlib
import io
import json
from pathlib import Path
import runpy
import tempfile
import unittest


AIR_ROOT = Path(__file__).resolve().parents[2]
tool = runpy.run_path(str(AIR_ROOT / "scripts/test-batches.py"))


def run(*argv):
    out = io.StringIO()
    err = io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = tool["main"](list(argv))
    return code, out.getvalue(), err.getvalue()


def xctest_suite(name, tests=("testOne",), padding=0):
    body = "\n".join(f"  func {test}() {{ XCTAssertTrue(true) }}" for test in tests)
    return f"import XCTest\n\nfinal class {name}: XCTestCase {{\n{body}\n}}\n" + "//" * padding + "\n"


def swift_testing_suite(name, padding=0):
    return f"import Testing\n\n@Suite @MainActor\nstruct {name} {{\n  @Test func works() {{}}\n}}\n" + "//" * padding + "\n"


class TreeTests(unittest.TestCase):
    """A temporary `Tests/` tree in the repository layout."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.tests_dir = Path(self.tmp.name) / "Tests"
        for directory in ("Access", "Bridge", "Credentials", "Files", "Media", "Wallet", "UI"):
            (self.tests_dir / directory).mkdir(parents=True)

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, relative, text):
        (self.tests_dir / relative).write_text(text, encoding="utf-8")

    def plan(self, *argv):
        code, out, err = run("plan", "--tests-dir", str(self.tests_dir), *argv)
        self.assertEqual(code, 0, err)
        return out


class DiscoveryTests(TreeTests):
    def test_each_test_type_becomes_a_suite_and_helpers_are_skipped(self):
        self.write("Bridge/BridgeTests.swift", xctest_suite("BridgeTests"))
        self.write("Access/PasswordMaintenanceTests.swift", swift_testing_suite("PasswordMaintenanceTests") + swift_testing_suite("StorageBackupModelTests"))
        self.write("Access/ConnectionsModelTests.swift", xctest_suite("ConnectionsModelTests") + "final class TestHostStore: HostStore {\n  func testable() {}\n}\n")
        self.write("Credentials/CredentialGroupTestSupport.swift", "import Testing\n\nextension Credential {\n  static func sample() -> Credential { .init() }\n}\n")
        self.write("Media/MediaRuntimeFixture.swift", "private struct Fixture {\n  @Test func hidden() {}\n}\n")
        files = tool["discover_unit_files"](self.tests_dir)
        self.assertEqual(
            [(f.path.name, f.suites) for f in files],
            [
                ("ConnectionsModelTests.swift", ["ConnectionsModelTests"]),
                ("PasswordMaintenanceTests.swift", ["PasswordMaintenanceTests", "StorageBackupModelTests"]),
                ("BridgeTests.swift", ["BridgeTests"]),
            ],
        )

    def test_ui_tests_are_parsed_in_file_order_including_conditional_blocks(self):
        self.write(
            "UI/AirUITests.swift",
            "import XCTest\n\nfinal class AirUITests: XCTestCase {\n"
            "  @MainActor\n  func testImageGallery() {\n  }\n\n"
            "  #if AIR_FIXTURE\n    @MainActor\n    func testAutoFillSettings() throws {\n    }\n  #endif\n\n"
            "  private func testableHelper() {}\n"
            "  func testWalletSend() {\n  }\n}\n",
        )
        self.assertEqual(
            tool["discover_ui_tests"](self.tests_dir),
            ["AirUITests/AirUITests/testImageGallery", "AirUITests/AirUITests/testAutoFillSettings", "AirUITests/AirUITests/testWalletSend"],
        )

    def test_ui_discovery_includes_brand_motion_but_skips_opt_in_captures(self):
        self.write("UI/AirUITests.swift", xctest_suite("AirUITests"))
        self.write(
            "UI/AirBrandMotionTests.swift",
            xctest_suite("AirBrandMotionTests", ("testLightBrandMotion", "testDarkBrandMotion")),
        )
        self.write("UI/AirLandingCaptureTests.swift", xctest_suite("AirLandingCaptureTests", ("testLandingTour",)))
        self.assertEqual(
            tool["discover_ui_tests"](self.tests_dir),
            [
                "AirUITests/AirUITests/testOne",
                "AirUITests/AirBrandMotionTests/testLightBrandMotion",
                "AirUITests/AirBrandMotionTests/testDarkBrandMotion",
            ],
        )


class PlanTests(TreeTests):
    def setUp(self):
        super().setUp()
        self.write("Bridge/HeavyTests.swift", xctest_suite("HeavyTests", padding=500))
        self.write("Files/MediumTests.swift", xctest_suite("MediumTests", padding=400))
        self.write("Wallet/SmallTests.swift", swift_testing_suite("SmallTests", padding=150))
        self.write("Access/TinyTests.swift", swift_testing_suite("TinyTests"))
        self.write(
            "UI/AirUITests.swift",
            "final class AirUITests: XCTestCase {\n" + "".join(f"  func testFlow{i}() {{}}\n" for i in range(1, 6)) + "}\n",
        )

    def test_unit_batches_are_balanced_by_file_size(self):
        batches = tool["plan_unit"](self.tests_dir, 2)
        # Heaviest first into the lightest batch: [Heavy, Tiny] against [Medium, Small].
        self.assertEqual(batches, [["BridgeTests/HeavyTests", "BridgeTests/TinyTests"], ["BridgeTests/MediumTests", "BridgeTests/SmallTests"]])

    def test_more_batches_than_files_collapses_to_one_per_file(self):
        self.assertEqual(len(tool["plan_unit"](self.tests_dir, 10)), 4)

    def test_ui_batches_chunk_in_file_order(self):
        self.assertEqual(
            tool["plan_ui"](self.tests_dir, 2),
            [
                ["AirUITests/AirUITests/testFlow1", "AirUITests/AirUITests/testFlow2"],
                ["AirUITests/AirUITests/testFlow3", "AirUITests/AirUITests/testFlow4"],
                ["AirUITests/AirUITests/testFlow5"],
            ],
        )

    def test_filter_is_a_case_insensitive_substring_on_suite_and_test_names(self):
        self.assertEqual(tool["plan_unit"](self.tests_dir, 4, "small"), [["BridgeTests/SmallTests"]])
        self.assertEqual(tool["plan_ui"](self.tests_dir, 4, "FLOW5"), [["AirUITests/AirUITests/testFlow5"]])
        self.assertEqual(tool["plan_unit"](self.tests_dir, 4, "nothing"), [])

    def test_brand_motion_filter_plans_both_tests_from_the_additional_file(self):
        self.write(
            "UI/AirBrandMotionTests.swift",
            xctest_suite("AirBrandMotionTests", ("testLightBrandMotion", "testDarkBrandMotion")),
        )
        expected = [
            "AirUITests/AirBrandMotionTests/testLightBrandMotion",
            "AirUITests/AirBrandMotionTests/testDarkBrandMotion",
        ]
        self.assertEqual(
            json.loads(self.plan("--kind", "ui", "--filter", "BrandMotion", "--format", "json")),
            {"ui": [expected]},
        )
        self.assertEqual(
            self.plan("--kind", "ui", "--filter", "BrandMotion", "--format", "args").splitlines(),
            [f"-only-testing:{identifier}" for identifier in expected],
        )

    def test_args_format_prints_one_batch_when_requested(self):
        out = self.plan("--kind", "unit", "--batches", "2", "--batch", "2", "--format", "args")
        self.assertEqual(out.splitlines(), ["-only-testing:BridgeTests/MediumTests", "-only-testing:BridgeTests/SmallTests"])

    def test_args_format_separates_batches_with_a_blank_line(self):
        out = self.plan("--kind", "ui", "--ui-batch-size", "3", "--format", "args")
        self.assertEqual(out.count("\n\n"), 1)
        self.assertEqual(len([line for line in out.splitlines() if line]), 5)

    def test_count_format_and_out_of_range_batch(self):
        self.assertEqual(self.plan("--kind", "unit", "--batches", "3", "--format", "count").strip(), "3")
        self.assertEqual(self.plan("--kind", "all", "--batches", "3", "--ui-batch-size", "4", "--format", "count").strip(), "5")
        code, _, err = run("plan", "--tests-dir", str(self.tests_dir), "--kind", "unit", "--batches", "2", "--batch", "3")
        self.assertEqual(code, 2)
        self.assertIn("out of range", err)


PASSED_LOG = """\
Test Suite 'NativeRuntimeTests' started at 2026-09-16 10:00:00.000
Test Case '-[BridgeTests.NativeRuntimeTests testUnlock]' started.
Test Case '-[BridgeTests.NativeRuntimeTests testUnlock]' passed (0.120 seconds).
Test Suite 'NativeRuntimeTests' passed at 2026-09-16 10:00:01.000.
\t Executed 1 test, with 0 failures (0 unexpected) in 0.120 (0.121) seconds
Test Suite 'All tests' passed at 2026-09-16 10:00:02.000.
\t Executed 12 tests, with 0 failures (0 unexpected) in 1.500 (1.600) seconds
◇ Test run started.
✔ Test run with 40 tests in 6 suites passed after 3.210 seconds.
** TEST SUCCEEDED **
"""

FAILED_LOG = """\
Test Case '-[BridgeTests.NativeFileTransferTests testResume]' started.
/Users/x/Tests/Bridge/NativeFileTransferTests.swift:88: error: -[BridgeTests.NativeFileTransferTests testResume] : XCTAssertEqual failed: ("1") is not equal to ("2")
Test Case '-[BridgeTests.NativeFileTransferTests testResume]' failed (0.300 seconds).
\t Executed 20 tests, with 1 failure (0 unexpected) in 4.000 (4.100) seconds
✘ Test "Submit explains invalid fields" recorded an issue at PasswordMaintenanceTests.swift:12:5: Expectation failed
✘ Test "Submit explains invalid fields" failed after 0.010 seconds with 1 issue.
✘ Test revocationClearsSecrets() recorded an issue at StorageEraseTests.swift:40:7: Expectation failed
✘ Test revocationClearsSecrets() failed after 0.020 seconds with 1 issue.
✘ Suite StorageEraseTests failed after 0.030 seconds with 1 issue.
✘ Test run with 52 tests in 8 suites failed after 5.000 seconds with 2 issues.
** TEST FAILED **
"""

KILLED_LOG = """\
Test Case '-[BridgeTests.ImageGalleryTests testSwipe]' started.
\t Executed 3 tests, with 0 failures (0 unexpected) in 0.900 (0.950) seconds
"""


class ReportTests(unittest.TestCase):
    def test_passed_log_counts_both_frameworks(self):
        result = tool["parse_log"]("01-unit", PASSED_LOG)
        self.assertEqual((result.xctest_executed, result.xctest_failed), (12, 0))
        self.assertEqual((result.swift_tests, result.swift_status), (40, "passed"))
        self.assertEqual(result.status, "passed")
        self.assertEqual(result.failures, [])

    def test_failed_log_lists_each_failing_test_once(self):
        result = tool["parse_log"]("02-unit", FAILED_LOG)
        self.assertEqual(result.status, "failed")
        self.assertEqual(
            result.failures,
            ["BridgeTests.NativeFileTransferTests.testResume", "Submit explains invalid fields", "revocationClearsSecrets()"],
        )

    def test_log_without_result_marker_is_incomplete(self):
        self.assertEqual(tool["parse_log"]("03-unit", KILLED_LOG).status, "incomplete")

    def test_report_command_merges_directory_logs_and_fails_on_any_problem(self):
        with tempfile.TemporaryDirectory() as tmp:
            logs = Path(tmp)
            (logs / "xctest-01-unit.log").write_text(PASSED_LOG, encoding="utf-8")
            (logs / "xctest-02-unit.log").write_text(FAILED_LOG, encoding="utf-8")
            (logs / "xctest-03-ui.log").write_text(KILLED_LOG, encoding="utf-8")
            (logs / "build-for-testing.log").write_text("** BUILD SUCCEEDED **\n", encoding="utf-8")
            code, out, _ = run("report", tmp)
        self.assertEqual(code, 1)
        lines = out.splitlines()
        self.assertTrue(any(line.startswith("01-unit") and line.endswith("passed") for line in lines))
        self.assertTrue(any(line.startswith("02-unit") and line.endswith("failed") for line in lines))
        self.assertTrue(any(line.startswith("03-ui") and line.endswith("incomplete") for line in lines))
        self.assertNotIn("build-for-testing", out)
        self.assertIn("Total", out)
        self.assertIn("35/1", out)  # 12 + 20 + 3 XCTest cases, one failure
        self.assertIn("  BridgeTests.NativeFileTransferTests.testResume", lines)
        self.assertEqual(lines[-1], "Result: FAILED (1 failed, 1 incomplete of 3 batches)")

    def test_report_command_passes_when_every_batch_passed(self):
        with tempfile.TemporaryDirectory() as tmp:
            log = Path(tmp) / "xctest-01-unit.log"
            log.write_text(PASSED_LOG, encoding="utf-8")
            code, out, _ = run("report", str(log))
        self.assertEqual(code, 0)
        self.assertEqual(out.splitlines()[-1], "Result: PASSED (1 batches)")

    def test_report_without_logs_fails(self):
        with tempfile.TemporaryDirectory() as tmp:
            code, _, err = run("report", tmp)
        self.assertEqual(code, 1)
        self.assertIn("No xctest-*.log", err)


if __name__ == "__main__":
    unittest.main()
