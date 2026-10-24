plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.compose)
}

// Screens and the state holders behind them. No Rust and no domain rules: a
// state holder reaches the vault only through the interfaces this module
// declares, and the application supplies their implementations. The bridge is
// a dependency for its generated wire types and error classes, nothing else.
android {
    namespace = "com.chromvoid.air.presentation"
    compileSdk = 36

    defaultConfig {
        minSdk = 29
    }

    buildFeatures {
        compose = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    testOptions {
        unitTests.isIncludeAndroidResources = true
    }
}

dependencies {
    api(project(":bridge"))
    api(libs.kotlinx.coroutines.android)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    implementation(libs.compose.material.icons.extended)
    implementation(libs.compose.ui.tooling.preview)
    // Audio and video play from the vault through a DataSource over the file reader.
    api(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.ui)
    // Encodes the QR codes a receive address and a pairing offer are shown as; iOS uses Core Image.
    implementation(libs.zxing.core)
    debugImplementation(libs.compose.ui.tooling)

    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    testImplementation(libs.compose.ui.test.manifest)
}

// The design survey (ScreenSurveyTest) renders screens only when asked:
// ./scripts/gradle.sh :presentation:testDebugUnitTest -Pair.survey=1 --tests '*ScreenSurveyTest'
tasks.withType<Test>().configureEach {
    systemProperty("air.survey", providers.gradleProperty("air.survey").orElse(providers.systemProperty("air.survey"))
        .getOrElse("0"))
    systemProperty("air.survey.variant", providers.gradleProperty("air.survey.variant")
        .orElse(providers.systemProperty("air.survey.variant")).getOrElse("light"))
    // Robolectric draws a captured screen through hardware rendering, as Roborazzi does.
    systemProperty("robolectric.pixelCopyRenderMode", "hardware")
}
