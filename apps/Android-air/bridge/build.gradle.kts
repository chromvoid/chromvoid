plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.chromvoid.air.bridge"
    compileSdk = 36

    defaultConfig {
        minSdk = 29
        consumerProguardFiles("consumer-rules.pro")
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.all {
            // Rust writes these replies; the DTO tests decode them as they are.
            it.systemProperty("air.wireFixtures", rootProject.file("docs/wire-fixtures.json").absolutePath)
        }
    }
}

// build-rust.sh writes the cargo-ndk output into AGP's default
// src/main/jniLibs. It is generated, never committed, and every ABI carries the
// same fingerprint. The script packages whatever it built last into that one
// directory, and a fixture build adds test-only runtime constructors. A
// release variant must never pick those up, so it refuses anything but
// release libraries.
val nativeProvenance = layout.projectDirectory.file("src/main/jniLibs/.build-provenance")
val checkReleaseNativeLibraries by tasks.registering {
    inputs.file(nativeProvenance).optional()
    doLast {
        val provenance = nativeProvenance.asFile
        val mode = provenance.takeIf { it.isFile }
            ?.readLines()
            ?.firstNotNullOfOrNull { it.removePrefix("mode=").takeIf { value -> value != it } }
        check(mode == "release") {
            "Release packaging needs release native libraries, found mode=${mode ?: "none"}. " +
                "Run scripts/build-rust.sh release first."
        }
    }
}
tasks.matching { it.name == "preReleaseBuild" }.configureEach {
    dependsOn(checkReleaseNativeLibraries)
}

dependencies {
    api(libs.jna) { artifact { type = "aar" } }
    api(libs.kotlinx.coroutines.android)
    // The wire DTOs are part of the bridge API the application consumes.
    api(libs.kotlinx.serialization.json)
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}
