# Android platform module

Kotlin integrations with the Android platform for ChromVoid Air on Android: autofill, the credential provider, passkeys, biometrics, SAF,
share, media playback, the USB accessory, foreground services, the quick
settings tile and the keystore bridge.

The module owns the integrations, not the product. It holds no vault state,
decides no domain rule and constructs no Core adapter; the decisions behind
these surfaces live in `crates/android-runtime`, and the JNI entry points live
in the application that owns the process.

## Why the package name does not match the namespace

`crates/core` binds `com/chromvoid/app/KeystoreBridge` by name through JNI, and
the credential provider and autofill services are named from each application's
manifest. The sources therefore keep their `com.chromvoid.app.*` packages. The
Gradle `namespace` is only the R class and BuildConfig location, and the
application id is a third, separate value.

## Consumer

`apps/Android-air/settings.gradle.kts` includes this directory; its build writes
to its own subdirectory under `build/`.

The Tauri v2 Android client that this module was extracted from was removed on
2026-09-23 (ADR-040). Several `nativebridge` shells still declare `external`
callbacks whose Rust side lived in that client: until Android-air implements a
surface, its shell must not reach the native call. The OTP scanner shows the
pattern - a Kotlin result sink the native client installs, consulted before the
native callback.
