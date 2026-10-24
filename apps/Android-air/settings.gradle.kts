pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "ChromVoidAir"

include(":bridge")
include(":presentation")
include(":app")

// The Android platform integrations both clients share. The directory belongs
// to neither application, so each includes it from where it actually lives.
include(":platform")
project(":platform").projectDir = file("../android-platform")
