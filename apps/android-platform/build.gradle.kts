// Android platform integrations for the native Android client (ChromVoid Air). The package names stay `com.chromvoid.app.*` because Core binds
// `com/chromvoid/app/KeystoreBridge` by name through JNI; the Gradle namespace
// below is a separate value and does not affect that.
plugins {
    id("com.android.library")
}

android {
    namespace = "com.chromvoid.platform"
    compileSdk = 36

    defaultConfig {
        minSdk = 29
        consumerProguardFiles("consumer-rules.pro")
    }

    buildFeatures {
        // Trace helpers in this module ask whether the build is a debug one.
        buildConfig = true
    }

    testOptions {
        // The moved surfaces read their own strings and layouts.
        unitTests.isIncludeAndroidResources = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

// The consuming build writes to its own output directory under build/.
layout.buildDirectory.set(layout.projectDirectory.dir("build/${rootProject.name}"))

dependencies {
    val cameraxVersion = "1.6.0"

    api("androidx.appcompat:appcompat:1.7.1")
    api("androidx.activity:activity-ktx:1.10.1")
    api("androidx.camera:camera-core:$cameraxVersion")
    api("androidx.camera:camera-camera2:$cameraxVersion")
    api("androidx.camera:camera-lifecycle:$cameraxVersion")
    api("androidx.camera:camera-view:$cameraxVersion")
    api("androidx.autofill:autofill:1.3.0")
    api("androidx.credentials:credentials:1.5.0")
    api("androidx.biometric:biometric:1.1.0")
    api("androidx.media3:media3-exoplayer:1.10.0")
    api("androidx.media3:media3-session:1.10.0")
    api("androidx.media3:media3-ui:1.10.0")
    api("com.google.mlkit:barcode-scanning:17.3.0")
    api("com.google.android.material:material:1.12.0")

    testImplementation("junit:junit:4.13.2")
    testImplementation("androidx.test:core:1.6.1")
    testImplementation("org.robolectric:robolectric:4.14.1")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test:runner:1.5.2")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}
