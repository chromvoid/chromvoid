plugins {
    `java-library`
}

repositories {
    mavenCentral()
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

dependencies {
    implementation(localGroovy())
    testImplementation("junit:junit:4.13.2")
}

// buildSrc is compiled before the Android build. Keep its version-contract
// tests on that path so test-native.sh and the existing CI always run them.
tasks.jar {
    dependsOn(tasks.test)
}
