# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

# Uncomment this to preserve the line number information for
# debugging stack traces.
#-keepattributes SourceFile,LineNumberTable

# If you keep the line number information, uncomment this to
# hide the original source file name.
#-renamesourcefileattribute SourceFile

-keep class com.chromvoid.app.ConnectionForegroundService { *; }
-keep class com.chromvoid.app.MediaPlaybackForegroundService { *; }
-keep class com.chromvoid.app.VaultStatusNotificationController { *; }
-keep class com.chromvoid.app.VaultQuickLockReceiver { *; }
-keep class com.chromvoid.app.VaultQuickSettingsTileService { *; }
-keep class com.chromvoid.app.ChromVoidAudioSessionService { *; }
-keep class com.chromvoid.app.ChromVoidAudioPlayerController { *; }
-keep class com.chromvoid.app.ChromVoidVaultAudioDataSource { *; }
-keep class com.chromvoid.app.AudioPlaybackCommand { *; }
-keep class com.chromvoid.app.AudioPlaybackEvent { *; }
-keep class com.chromvoid.app.ChromVoidVideoActivity { *; }
-keep class com.chromvoid.app.OtpQrScannerActivity { *; }
-keep class com.chromvoid.app.nativebridge.** { *; }
-keep class com.chromvoid.app.nativebridge.BiometricNativeShell { *; }
-keep class com.chromvoid.app.nativebridge.CredentialProviderNativeShell { *; }
-keep class com.chromvoid.app.nativebridge.HeifPreviewNativeResult { *; }
-keep class com.chromvoid.app.nativebridge.HeifPreviewNativeShell { *; }
-keep class com.chromvoid.app.nativebridge.AndroidShareImportNativeShell { *; }
-keep class com.chromvoid.app.nativebridge.NativeUploadNativeShell { *; }
-keep class com.chromvoid.app.nativebridge.OtpQrScannerNativeShell { *; }
-keep class com.chromvoid.app.nativebridge.PasswordSaveNativeShell { *; }
-keep class com.chromvoid.app.nativebridge.AudioPlaybackNativeShell { *; }
-keep class com.chromvoid.app.nativebridge.AudioSourceReadResult { *; }
-keep class com.chromvoid.app.nativebridge.VideoPlaybackNativeShell { *; }
-keep class com.chromvoid.app.KeystoreBridge { *; }
