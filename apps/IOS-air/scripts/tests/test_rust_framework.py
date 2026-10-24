"""Exercise the packaging boundary with real Apple device/simulator static libraries."""

from pathlib import Path
import os
import plistlib
import runpy
import subprocess
import tempfile
import unittest


SCRIPTS = Path(__file__).resolve().parents[1]
package_framework = runpy.run_path(str(SCRIPTS / "package-rust-framework.py"))["package_framework"]


class RustFrameworkTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.bindings = self.root / "bindings"
        self.bindings.mkdir()
        (self.bindings / "AirFFIFFI.h").write_text("int air_fixture_probe(void);\n")
        (self.bindings / "AirFFIFFI.modulemap").write_text(
            'module AirFFIFFI { header "AirFFIFFI.h" export * }\n')
        bridge = self.root / "Packages/ChromVoidBridge"
        self.manifest = bridge / "Resources/AirFFIFFI/PrivacyInfo.xcprivacy"
        self.manifest.parent.mkdir(parents=True)
        self.manifest.write_bytes(plistlib.dumps({
            "NSPrivacyCollectedDataTypes": [], "NSPrivacyTracking": False,
        }))
        self.output = bridge / ".artifacts/AirFFIFFI.xcframework"
        self.output.parent.mkdir()
        (self.output.parent / "mode").write_text("fixture\n")
        self.guard = self.root / "scripts/verify-artifacts.sh"
        self.guard.parent.mkdir()
        self.guard.write_bytes((SCRIPTS / "verify-artifacts.sh").read_bytes())

    def verify_artifact(self, variant="ios-arm64"):
        return subprocess.run(["bash", str(self.guard), "Fixture"], capture_output=True, text=True,
                              env={**os.environ, "AIR_RUST_VARIANT": variant})

    def library(self, sdk, target):
        source = self.root / f"{sdk}.c"
        source.write_text("int air_fixture_probe(void) { return 17; }\n")
        obj = source.with_suffix(".o")
        sdk_path = subprocess.check_output(
            ["xcrun", "--sdk", sdk, "--show-sdk-path"], text=True).strip()
        subprocess.run(["xcrun", "clang", "-target", target, "-isysroot", sdk_path,
                        "-c", str(source), "-o", str(obj)], check=True)
        library = source.with_suffix(".a")
        subprocess.run(["xcrun", "libtool", "-static", "-o", str(library), str(obj)], check=True)
        return library

    def test_both_platforms_carry_original_library_header_and_manifest(self):
        device = self.library("iphoneos", "arm64-apple-ios16.0")
        simulator = self.library("iphonesimulator", "arm64-apple-ios16.0-simulator")
        package_framework(device, simulator, self.bindings, self.manifest, self.output)
        self.assertEqual(self.verify_artifact().returncode, 0)
        self.assertEqual(self.verify_artifact("ios-arm64-simulator").returncode, 0)
        info = plistlib.loads((self.output / "Info.plist").read_bytes())
        variants = {v["LibraryIdentifier"]: v for v in info["AvailableLibraries"]}
        self.assertEqual(set(variants), {"ios-arm64", "ios-arm64-simulator"})
        for key, library, sdk, target in [
            ("ios-arm64", device, "iphoneos", "arm64-apple-ios16.0"),
            ("ios-arm64-simulator", simulator, "iphonesimulator", "arm64-apple-ios16.0-simulator"),
        ]:
            variant = variants[key]
            self.assertEqual(variant["SupportedPlatform"], "ios")
            self.assertEqual(variant.get("SupportedPlatformVariant"),
                             "simulator" if key.endswith("simulator") else None)
            framework = self.output / key / variant["LibraryPath"]
            self.assertEqual((framework / "AirFFIFFI").read_bytes(), library.read_bytes())
            self.assertEqual((framework / "PrivacyInfo.xcprivacy").read_bytes(),
                             self.manifest.read_bytes())
            self.assertEqual((framework / "Headers/AirFFIFFI.h").read_bytes(),
                             (self.bindings / "AirFFIFFI.h").read_bytes())
            consumer = self.root / f"{key}.m"
            consumer.write_text("@import AirFFIFFI; int consume(void) { return air_fixture_probe(); }\n")
            sdk_path = subprocess.check_output(
                ["xcrun", "--sdk", sdk, "--show-sdk-path"], text=True).strip()
            subprocess.run([
                "xcrun", "clang", "-target", target, "-isysroot", sdk_path, "-fmodules",
                f"-fmodules-cache-path={self.root / 'module-cache'}", "-F", str(framework.parent),
                "-fsyntax-only", str(consumer),
            ], check=True)
        # Device-only Release packaging replaces both variants and reads current source bytes.
        self.manifest.write_bytes(plistlib.dumps({"NSPrivacyCollectedDataTypes": []}))
        stale = self.verify_artifact()
        self.assertNotEqual(stale.returncode, 0)
        self.assertIn("privacy declaration is stale", stale.stderr)
        package_framework(device, None, self.bindings, self.manifest, self.output)
        release = plistlib.loads((self.output / "Info.plist").read_bytes())["AvailableLibraries"]
        self.assertEqual([v["LibraryIdentifier"] for v in release], ["ios-arm64"])
        self.assertEqual((self.output / "ios-arm64/AirFFIFFI.framework/PrivacyInfo.xcprivacy").read_bytes(),
                         self.manifest.read_bytes())

    def test_signing_failure_preserves_previous_framework(self):
        device = self.library("iphoneos", "arm64-apple-ios16.0")
        package_framework(device, None, self.bindings, self.manifest, self.output)
        original = {str(p.relative_to(self.output)): p.read_bytes()
                    for p in self.output.rglob("*") if p.is_file()}
        with self.assertRaises(subprocess.CalledProcessError):
            package_framework(device, None, self.bindings, self.manifest, self.output,
                              signing_identity="ios-air-nonexistent-test-signer",
                              signing_team="TESTTEAM00")
        self.assertEqual({str(p.relative_to(self.output)): p.read_bytes()
                          for p in self.output.rglob("*") if p.is_file()}, original)

    def test_signing_requires_both_identity_and_team_before_replacement(self):
        device = self.library("iphoneos", "arm64-apple-ios16.0")
        self.output.mkdir()
        marker = self.output / "previous-artifact"
        marker.write_text("retained")
        for identity, team in [("identity", None), (None, "TESTTEAM00"), ("-", "TESTTEAM00")]:
            with self.subTest(identity=identity, team=team):
                with self.assertRaises(ValueError):
                    package_framework(device, None, self.bindings,
                                      self.manifest, self.output,
                                      signing_identity=identity, signing_team=team)
                self.assertEqual(marker.read_text(), "retained")

    def test_bad_inputs_and_rejected_library_preserve_existing_artifact(self):
        self.output.mkdir()
        marker = self.output / "previous-artifact"
        marker.write_text("retained")
        missing = self.verify_artifact()
        self.assertNotEqual(missing.returncode, 0)
        self.assertIn("privacy resources are missing", missing.stderr)
        library = self.root / "invalid.a"
        library.write_bytes(b"not an Apple archive")
        valid_manifest = self.manifest.read_bytes()
        self.manifest.write_text("not a plist")
        with self.assertRaises(plistlib.InvalidFileException):
            package_framework(library, None, self.bindings, self.manifest, self.output)
        self.manifest.write_bytes(valid_manifest)
        with self.assertRaises(subprocess.CalledProcessError):
            package_framework(library, None, self.bindings, self.manifest, self.output)
        self.assertEqual(marker.read_text(), "retained")
        self.assertEqual(list(self.output.iterdir()), [marker])


if __name__ == "__main__":
    unittest.main()
