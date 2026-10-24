import com.chromvoid.air.versioning.SharedAppVersion

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

val sharedAppVersion = SharedAppVersion.read(rootProject.file("../chromvoid/src-tauri/tauri.conf.json"))

android {
    namespace = "com.chromvoid.air"
    compileSdk = 36

    defaultConfig {
        // Debug and fixture builds remain isolated from the shipping client.
        // The release identity is selected below through the variant API.
        applicationId = "com.chromvoid.air.dev"
        minSdk = 29
        targetSdk = 36
        versionCode = sharedAppVersion.versionCode
        versionName = sharedAppVersion.versionName
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        // Each test gets its own process and empty app data, which also drops
        // the app's keystore entries. A process may own one runtime, and the
        // shell's session holds one for the life of the process.
        testInstrumentationRunnerArguments["clearPackageData"] = "true"

        // Each ABI carries a ~25 MB native library. A build for one known
        // device packages one of them: -PairAbi=arm64-v8a for an emulator or
        // phone, -PairAbi=x86_64 for an x86 emulator. The default keeps both so
        // an ordinary debug build installs anywhere.
        val requestedAbis = (project.findProperty("airAbi") as? String)
            ?.split(",")
            ?.map(String::trim)
            ?.filter(String::isNotEmpty)
            ?: listOf("arm64-v8a", "x86_64")
        ndk { abiFilters += requestedAbis }
    }

    buildTypes {
        getByName("debug") {
            isMinifyEnabled = false
            // The dev build holds only synthetic vaults; its screens may be captured to show them.
            buildConfigField("boolean", "SCREEN_CAPTURE_ALLOWED", "true")
        }
        getByName("release") {
            isMinifyEnabled = true
            buildConfigField("boolean", "SCREEN_CAPTURE_ALLOWED", "false")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources.excludes += setOf("META-INF/AL2.0", "META-INF/LGPL2.1")
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
        execution = "ANDROIDX_TEST_ORCHESTRATOR"
    }
}

androidComponents {
    onVariants(selector().withBuildType("release")) { variant ->
        variant.applicationId.set("com.chromvoid.app")
    }
}

dependencies {
    implementation(project(":bridge"))
    implementation(project(":presentation"))
    // Shared Android integrations, including the keystore bridge Core binds by
    // JNI name. Without it no vault can be created or unlocked on a device.
    implementation(project(":platform"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    testImplementation(libs.compose.ui.test.manifest)

    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.espresso.intents)
    androidTestImplementation(libs.zxing.core)
    androidTestImplementation(libs.androidx.test.uiautomator)
    androidTestImplementation(libs.compose.ui.test.junit4)
    androidTestImplementation(libs.compose.ui.test.accessibility)
    androidTestUtil(libs.androidx.test.orchestrator)
    androidTestUtil(libs.androidx.test.services)
    debugImplementation(libs.compose.ui.test.manifest)
}
