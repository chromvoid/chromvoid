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
    namespace = "com.chromvoid.app"
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
        applicationId = "com.chromvoid.app"
        minSdk = 28
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            isMinifyEnabled = true
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
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
    sourceSets {
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
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("androidx.autofill:autofill:1.3.0")
    implementation("androidx.credentials:credentials:1.5.0")
    implementation("androidx.biometric:biometric:1.1.0")
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
                "nativebridge/PasswordSaveNativeShell.kt",
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
    }
}

tasks.named("preBuild").configure {
    dependsOn("verifyAndroidOwnedSources")
    dependsOn("verifyAndroidNativeBridgeOwnership")
}

apply(from = "tauri.build.gradle.kts")
