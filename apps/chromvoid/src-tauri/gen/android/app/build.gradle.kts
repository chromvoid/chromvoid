import java.io.File
import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

val releaseKeystorePropertiesFile = rootProject.file("keystore.properties")
val releaseKeystoreProperties = Properties().apply {
    if (releaseKeystorePropertiesFile.exists()) {
        releaseKeystorePropertiesFile.inputStream().use { load(it) }
    }
}
val releaseTasksRequested = gradle.startParameter.taskNames.any {
    it.contains("Release", ignoreCase = true)
}
val ownedAndroidAppDir = rootProject.projectDir.resolve("../../android-owned/app")
val androidNamespace = "com.chromvoid.app"
val debugApplicationIdSuffix = ".dev"

fun requireReleaseKeystoreProperty(name: String): String {
    val value = releaseKeystoreProperties.getProperty(name)?.trim().orEmpty()
    if (value.isEmpty()) {
        error(
            "Missing \"$name\" in ${releaseKeystorePropertiesFile.path}. " +
                "Copy keystore.properties.example and fill password, keyAlias, and storeFile.",
        )
    }
    return value
}

fun resolveReleaseStoreFile(): java.io.File {
    val rawStoreFile = requireReleaseKeystoreProperty("storeFile")
    val absoluteFile = File(rawStoreFile)
    val candidate = if (absoluteFile.isAbsolute) absoluteFile else rootProject.file(rawStoreFile)
    if (!candidate.exists()) {
        error(
            "Android release keystore file not found at ${candidate.path}. " +
                "Update ${releaseKeystorePropertiesFile.path}.",
        )
    }
    return candidate
}

if (releaseTasksRequested && !releaseKeystorePropertiesFile.exists()) {
    error(
        "Missing Android release signing config at ${releaseKeystorePropertiesFile.path}. " +
            "Copy keystore.properties.example and point storeFile to your local .jks keystore.",
    )
}

android {
    compileSdk = 36
    namespace = androidNamespace
    signingConfigs {
        if (releaseTasksRequested && releaseKeystorePropertiesFile.exists()) {
            create("release") {
                val password = requireReleaseKeystoreProperty("password")
                storeFile = resolveReleaseStoreFile()
                storePassword = password
                keyAlias = requireReleaseKeystoreProperty("keyAlias")
                keyPassword = password
            }
        }
    }
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = androidNamespace
        minSdk = 29
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildTypes {
        getByName("debug") {
            applicationIdSuffix = debugApplicationIdSuffix
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            isMinifyEnabled = true
            ndk {
                debugSymbolLevel = "FULL"
            }
            if (releaseTasksRequested && releaseKeystorePropertiesFile.exists()) {
                signingConfig = signingConfigs.getByName("release")
            }
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
    }
    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
    sourceSets {
        getByName("debug") {
            res.srcDirs(ownedAndroidAppDir.resolve("src/debug/res"))
        }
        getByName("main") {
            java.srcDirs("src/main/java", ownedAndroidAppDir.resolve("src/main/java"))
            res.srcDirs("src/main/res", ownedAndroidAppDir.resolve("src/main/res"))
        }
        getByName("test") {
            java.srcDirs("src/test/java", ownedAndroidAppDir.resolve("src/test/java"))
        }
        getByName("androidTest") {
            java.srcDirs("src/androidTest/java", ownedAndroidAppDir.resolve("src/androidTest/java"))
        }
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    val cameraxVersion = "1.6.0"

    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.camera:camera-core:$cameraxVersion")
    implementation("androidx.camera:camera-camera2:$cameraxVersion")
    implementation("androidx.camera:camera-lifecycle:$cameraxVersion")
    implementation("androidx.camera:camera-view:$cameraxVersion")
    implementation("androidx.autofill:autofill:1.3.0")
    implementation("androidx.credentials:credentials:1.5.0")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.media3:media3-exoplayer:1.10.0")
    implementation("androidx.media3:media3-session:1.10.0")
    implementation("androidx.media3:media3-ui:1.10.0")
    implementation("com.google.mlkit:barcode-scanning:17.3.0")
    implementation("com.google.android.material:material:1.12.0")
    testImplementation("junit:junit:4.13.2")
    testImplementation("androidx.test:core:1.6.1")
    testImplementation("org.robolectric:robolectric:4.14.1")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test:runner:1.5.2")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

tasks.register("verifyAndroidOwnedSources") {
    doLast {
        val violations =
            buildList {
                addAll(
                    fileTree("src/main/java") {
                        include("**/*.kt", "**/*.java")
                        exclude("com/chromvoid/app/generated/**")
                    }.files,
                )
                addAll(fileTree("src/test/java") { include("**/*.kt", "**/*.java") }.files)
                addAll(fileTree("src/androidTest/java") { include("**/*.kt", "**/*.java") }.files)
                addAll(fileTree("src/main/res/values") { include("**/*.xml") }.files)
            }.sortedBy { it.invariantSeparatorsPath }
        if (violations.isNotEmpty()) {
            val formatted = violations.joinToString(separator = "\n") { " - ${it.invariantSeparatorsPath}" }
            error(
                "Handwritten Android code must live under ${ownedAndroidAppDir.invariantSeparatorsPath}.\n" +
                    "Remove the following files from gen/android before building:\n$formatted",
            )
        }
    }
}

tasks.register("verifyAndroidNativeBridgeOwnership") {
    doLast {
        val ownedMainDir = ownedAndroidAppDir.resolve("src/main/java/com/chromvoid/app")
        val forbiddenRootBridges =
            listOf(
                "BiometricBridge.kt",
                "CredentialProviderBridge.kt",
                "PasswordSaveBridge.kt",
            ).map { ownedMainDir.resolve(it) }.filter { it.exists() }
        if (forbiddenRootBridges.isNotEmpty()) {
            val formatted = forbiddenRootBridges.joinToString(separator = "\n") { " - ${it.invariantSeparatorsPath}" }
            error(
                "Android JNI ownership must live under com.chromvoid.app.nativebridge.\n" +
                    "Remove the following root compatibility bridge files:\n$formatted",
            )
        }

        val requiredNativeShells =
            listOf(
                "nativebridge/BiometricNativeShell.kt",
                "nativebridge/CredentialProviderNativeShell.kt",
                "nativebridge/GallerySaveNativeShell.kt",
                "nativebridge/HeifPreviewNativeShell.kt",
                "nativebridge/AndroidShareImportNativeShell.kt",
                "nativebridge/NativeUploadNativeShell.kt",
                "nativebridge/OtpQrScannerNativeShell.kt",
                "nativebridge/PasswordSaveNativeShell.kt",
                "nativebridge/SafBackupNativeShell.kt",
                "nativebridge/AudioPlaybackNativeShell.kt",
                "nativebridge/VideoPlaybackNativeShell.kt",
                "KeystoreBridge.kt",
            ).map { ownedMainDir.resolve(it) }
        val missing = requiredNativeShells.filterNot { it.exists() }
        if (missing.isNotEmpty()) {
            val formatted = missing.joinToString(separator = "\n") { " - ${it.invariantSeparatorsPath}" }
            error(
                "Android native bridge ownership is incomplete.\n" +
                    "The following required native bridge files are missing:\n$formatted",
            )
        }

        val proguardRules = file("proguard-rules.pro").readText()
        val nativeUploadKeepRule = "-keep class com.chromvoid.app.nativebridge.NativeUploadNativeShell { *; }"
        val androidShareImportKeepRule =
            "-keep class com.chromvoid.app.nativebridge.AndroidShareImportNativeShell { *; }"
        if (!proguardRules.contains(nativeUploadKeepRule)) {
            error(
                "Android release minification must keep NativeUploadNativeShell because Rust calls startFilePicker by JNI name.\n" +
                    "Missing ProGuard rule: $nativeUploadKeepRule",
            )
        }
        if (!proguardRules.contains(androidShareImportKeepRule)) {
            error(
                "Android release minification must keep AndroidShareImportNativeShell because Rust calls startSharedFilesUpload by JNI name.\n" +
                "Missing ProGuard rule: $androidShareImportKeepRule",
            )
        }
    }
}

tasks.register("verifyAndroidNativeQualityGates") {
    doLast {
        val ownedMainDir = ownedAndroidAppDir.resolve("src/main/java/com/chromvoid/app")
        val violations = mutableListOf<String>()

        fun File.ownedPath(): String =
            relativeTo(ownedMainDir).invariantSeparatorsPath

        fun addFileViolations(reason: String, files: List<File>) {
            if (files.isEmpty()) return
            val formatted = files
                .sortedBy { it.invariantSeparatorsPath }
                .joinToString(separator = "\n") { " - ${it.invariantSeparatorsPath}" }
            violations += "$reason\n$formatted"
        }

        fun requireOwnedFile(relativePath: String) {
            val file = ownedMainDir.resolve(relativePath)
            if (!file.exists()) {
                violations += "Missing Android native source-of-truth file: ${file.invariantSeparatorsPath}"
            }
        }

        val sourceFiles =
            if (ownedMainDir.exists()) {
                ownedMainDir.walkTopDown()
                    .filter { it.isFile && (it.extension == "kt" || it.extension == "java") }
                    .toList()
            } else {
                violations += "Android owned main source directory is missing: ${ownedMainDir.invariantSeparatorsPath}"
                emptyList()
            }
        val sourceTexts = sourceFiles.associateWith { it.readText() }

        listOf(
            "shared/NativeRuntimeLoader.kt",
            "shared/NativeBridgeTaskDispatcher.kt",
            "shared/TracePrivacy.kt",
            "main/StartupSplashController.kt",
            "nativebridge/NativeUploadPayloadCodec.kt",
            "nativebridge/NativeUploadReadResolver.kt",
            "nativebridge/NativeUploadStreamRunner.kt",
        ).forEach(::requireOwnedFile)

        addFileViolations(
            "System.loadLibrary ownership must stay centralized in NativeRuntimeLoader.",
            sourceTexts
                .filter { (file, text) ->
                    text.contains("System.loadLibrary(") && file.ownedPath() != "shared/NativeRuntimeLoader.kt"
                }
                .keys
                .toList(),
        )

        addFileViolations(
            "Inline native library load blocks are forbidden; use NativeRuntimeLoader.",
            sourceTexts
                .filter { (_, text) -> text.contains("runCatching { System.loadLibrary") }
                .keys
                .toList(),
        )

        addFileViolations(
            "Suffix-based trace redaction is forbidden; use TracePrivacy hash redaction.",
            sourceTexts
                .filter { (_, text) -> text.contains("takeLast(6)") }
                .keys
                .toList(),
        )

        val mainActivity = ownedMainDir.resolve("MainActivity.kt")
        if (mainActivity.exists()) {
            val mainActivityText = mainActivity.readText()
            val splashInternals =
                listOf("ValueAnimator", "ColorMatrix", "RenderEffect", "STARTUP_GLOW", "CHROMVOID_SPLASH_BACKGROUND")
                    .filter { mainActivityText.contains(it) }
            if (splashInternals.isNotEmpty()) {
                violations +=
                    "Startup splash internals must stay in main/StartupSplashController.kt; " +
                    "MainActivity.kt contains: ${splashInternals.joinToString()}"
            }
        }

        val fileProviderPaths = file("src/main/res/xml/file_paths.xml")
        if (!fileProviderPaths.exists()) {
            violations += "Android FileProvider paths file is missing: ${fileProviderPaths.invariantSeparatorsPath}"
        } else {
            val fileProviderText = fileProviderPaths.readText()
            if (fileProviderText.contains("<external-path") || Regex("""path\s*=\s*["']\./?["']""").containsMatchIn(fileProviderText)) {
                violations +=
                    "Android FileProvider paths must stay narrow; external-path and path=\".\" entries are forbidden."
            }
            listOf(
                "external-files-path" to "Pictures/",
                "cache-path" to "chromvoid-share/",
                "cache-path" to "chromvoid-open/",
                "external-cache-path" to "chromvoid-share/",
                "external-cache-path" to "chromvoid-open/",
            ).forEach { (requiredTag, requiredPath) ->
                val requiredEntry =
                    Regex("""<$requiredTag\b[^>]*\bpath\s*=\s*["']${Regex.escape(requiredPath)}["']""")
                if (!requiredEntry.containsMatchIn(fileProviderText)) {
                    violations +=
                        "Android FileProvider paths must include scoped $requiredTag path marker: $requiredPath"
                }
            }
        }

        val rawTracePatterns =
            listOf(
                "parent=${'$'}parentUri",
                "name=${'$'}name",
                "display_name=${'$'}displayName",
                "uploadId=${'$'}uploadId",
                "fileId=${'$'}fileId",
                "shareSessionId=${'$'}shareSessionId",
                "session_id=${'$'}sessionId",
                "message=${'$'}message",
            )
        addFileViolations(
            "Known sensitive native trace values must be routed through TracePrivacy helpers.",
            sourceTexts
                .filter { (file, text) ->
                    file.ownedPath().startsWith("nativebridge/") && rawTracePatterns.any { text.contains(it) }
                }
                .keys
                .toList(),
        )

        if (violations.isNotEmpty()) {
            error(
                "Android native quality gates failed:\n" +
                    violations.joinToString(separator = "\n\n"),
            )
        }
    }
}

tasks.named("preBuild").configure {
    dependsOn("verifyAndroidOwnedSources")
    dependsOn("verifyAndroidNativeBridgeOwnership")
    dependsOn("verifyAndroidNativeQualityGates")
}

apply(from = "tauri.build.gradle.kts")
