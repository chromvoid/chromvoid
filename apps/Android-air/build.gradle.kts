// AGP compiles Kotlin itself and brings Kotlin Gradle plugin 2.2.10 at runtime.
// This entry keeps the compiler on the catalog's Kotlin version, which the
// Compose and serialization compiler plugins below must match.
buildscript {
    repositories {
        mavenCentral()
    }
    dependencies {
        classpath(libs.kotlin.gradle.plugin)
    }
}

plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
}
