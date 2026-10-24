#!/usr/bin/env bash
# JVM-side native checks: Kotlin style, locale parity, unit tests, a debug assembly and the instrumentation
# sources built without a device.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/paths.sh"
"$AIR_ROOT/scripts/kotlin-style.sh" check
"$AIR_ROOT/scripts/locale-parity.sh"
# Device suites run by hand, so CI only builds their sources: the app's test APK
# (Kotlin tests and the Java probe activities) and the platform module's
# androidTest, which is compiled but not packaged.
"$AIR_ROOT/scripts/gradle.sh" --no-daemon testDebugUnitTest assembleDebug \
  :app:assembleDebugAndroidTest :platform:compileDebugAndroidTestSources
