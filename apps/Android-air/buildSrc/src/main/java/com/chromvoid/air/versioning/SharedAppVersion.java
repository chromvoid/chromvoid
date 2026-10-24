package com.chromvoid.air.versioning;

import groovy.json.JsonSlurper;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Android's version coordinates derived from the shared Tauri application version. */
public record SharedAppVersion(String versionName, int versionCode) {
    private static final Pattern VERSION = Pattern.compile(
        "(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)\\.(0|[1-9][0-9]*)"
    );

    public static SharedAppVersion read(File configFile) {
        String json;
        try {
            json = Files.readString(configFile.toPath(), StandardCharsets.UTF_8);
        } catch (IOException error) {
            throw new IllegalArgumentException("Cannot read shared app version from " + configFile, error);
        }

        Object document;
        try {
            document = new JsonSlurper().parseText(json);
        } catch (RuntimeException error) {
            throw new IllegalArgumentException("Cannot parse shared app version JSON in " + configFile, error);
        }
        if (!(document instanceof Map<?, ?> config) || !(config.get("version") instanceof String version)) {
            throw new IllegalArgumentException("Shared app config " + configFile + " must contain a string 'version'");
        }

        try {
            return parse(version);
        } catch (IllegalArgumentException error) {
            throw new IllegalArgumentException("Invalid shared app version in " + configFile + ": " + error.getMessage(), error);
        }
    }

    public static SharedAppVersion parse(String version) {
        Matcher match = VERSION.matcher(version);
        if (!match.matches()) {
            throw new IllegalArgumentException("Expected shared app version x.y.z; got '" + version + "'");
        }

        long major;
        long minor;
        long patch;
        try {
            major = Long.parseLong(match.group(1));
            minor = Long.parseLong(match.group(2));
            patch = Long.parseLong(match.group(3));
        } catch (NumberFormatException error) {
            throw new IllegalArgumentException("Shared app version '" + version + "' exceeds the Android versionCode range", error);
        }
        if (minor >= 1000 || patch >= 1000) {
            throw new IllegalArgumentException("Shared app version minor and patch must be below 1000; got '" + version + "'");
        }
        // Bound the major before multiplying so even a valid long cannot overflow.
        if (major > Integer.MAX_VALUE / 1_000_000) {
            throw versionCodeRangeError(version);
        }
        long code = major * 1_000_000 + minor * 1_000 + patch;
        if (code < 1 || code > Integer.MAX_VALUE) {
            throw versionCodeRangeError(version);
        }
        return new SharedAppVersion(version, (int) code);
    }

    private static IllegalArgumentException versionCodeRangeError(String version) {
        return new IllegalArgumentException(
            "Shared app version '" + version + "' must produce a positive 32-bit Android versionCode"
        );
    }
}
