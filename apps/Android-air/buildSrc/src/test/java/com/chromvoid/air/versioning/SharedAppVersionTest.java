package com.chromvoid.air.versioning;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class SharedAppVersionTest {
    @Rule public TemporaryFolder temporaryFolder = new TemporaryFolder();

    @Test
    public void followsTauriVersionCodeFormula() {
        assertVersion("1.0.8", 1_000_008);
        assertVersion("2.0.0", 2_000_000);
        assertVersion("0.1.0", 1_000);
        assertVersion("12.345.678", 12_345_678);
        assertVersion("1.999.999", 1_999_999);
        assertVersion("2147.483.647", Integer.MAX_VALUE);
    }

    @Test
    public void requiresExactlyThreeNumericComponents() {
        for (String version : new String[] {
            "", "2", "2.0", "2.0.0.0", "v2.0.0", "2.0.0-beta.1", "2.0.0+1", "-2.0.0", "2.-1.0",
            "2.0.-1", "2.a.0", "2.0.0\n", " 2.0.0", "2.0.0 ", "02.0.0", "2.00.0", "2.0.00"
        }) {
            assertRejected(version, "x.y.z");
        }
    }

    @Test
    public void preventsMinorAndPatchFromOverlappingOtherComponents() {
        assertRejected("1.1000.0", "minor and patch must be below 1000");
        assertRejected("1.0.1000", "minor and patch must be below 1000");
    }

    @Test
    public void rejectsZeroAndOverflowInsteadOfFallingBack() {
        assertRejected("0.0.0", "positive 32-bit");
        assertRejected("2147.483.648", "positive 32-bit");
        assertRejected("2148.0.0", "positive 32-bit");
        assertRejected("9223372036854775807.0.0", "positive 32-bit");
        assertRejected("9223372036854775808.0.0", "versionCode range");
    }

    @Test
    public void readsOnlyTheTopLevelVersionString() throws IOException {
        File config = config("{\"bundle\":{\"version\":\"9.9.9\"},\"version\":\"2.0.0\"}");
        assertEquals(new SharedAppVersion("2.0.0", 2_000_000), SharedAppVersion.read(config));
    }

    @Test
    public void reportsUnreadableConfigPath() {
        File missing = new File(temporaryFolder.getRoot(), "missing-tauri.conf.json");
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> SharedAppVersion.read(missing));
        assertTrue(error.getMessage().contains("Cannot read shared app version"));
        assertTrue(error.getMessage().contains(missing.toString()));
    }

    @Test
    public void reportsInvalidJsonAndVersionFields() throws IOException {
        assertConfigRejected("{", "Cannot parse shared app version JSON");
        assertConfigRejected("[]", "must contain a string 'version'");
        assertConfigRejected("{}", "must contain a string 'version'");
        assertConfigRejected("{\"bundle\":{\"version\":\"2.0.0\"}}", "must contain a string 'version'");
        assertConfigRejected("{\"version\":2000000}", "must contain a string 'version'");
        assertConfigRejected("{\"version\":null}", "must contain a string 'version'");
        assertConfigRejected("{\"version\":\"2.0\"}", "Expected shared app version x.y.z");
        assertConfigRejected("{\"version\":\"2.1000.0\"}", "minor and patch must be below 1000");
    }

    private static void assertVersion(String name, int code) {
        assertEquals(new SharedAppVersion(name, code), SharedAppVersion.parse(name));
    }

    private static void assertRejected(String version, String expectedMessage) {
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> SharedAppVersion.parse(version));
        assertTrue(error.getMessage(), error.getMessage().contains(expectedMessage));
    }

    private void assertConfigRejected(String json, String expectedMessage) throws IOException {
        File config = config(json);
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> SharedAppVersion.read(config));
        assertTrue(error.getMessage(), error.getMessage().contains(expectedMessage));
        assertTrue(error.getMessage().contains(config.toString()));
    }

    private File config(String json) throws IOException {
        File config = temporaryFolder.newFile();
        Files.writeString(config.toPath(), json, StandardCharsets.UTF_8);
        return config;
    }
}
