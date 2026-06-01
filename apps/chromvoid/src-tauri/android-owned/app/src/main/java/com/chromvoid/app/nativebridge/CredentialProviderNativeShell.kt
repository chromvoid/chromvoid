package com.chromvoid.app.nativebridge

import android.os.Build
import com.chromvoid.app.credentialprovider.AutofillProviderSettingsBridge
import com.chromvoid.app.shared.AndroidRuntimeAccess
import com.chromvoid.app.shared.NativeRuntimeLoader

internal object CredentialProviderNativeShell {
    private const val TAG = "ChromVoid/CredentialProvider"

    @JvmStatic
    fun appAutofillProviderSelected(): Boolean {
        val context = AndroidRuntimeAccess.applicationContextOrNull() ?: return false
        return AutofillProviderSettingsBridge.isSelected(context)
    }

    @JvmStatic
    fun openAutofillProviderSettings(): Boolean {
        val context = AndroidRuntimeAccess.applicationContextOrNull() ?: return false
        return AutofillProviderSettingsBridge.openSettings(context)
    }

    fun currentApiLevel(): Int = Build.VERSION.SDK_INT

    internal fun ensureRuntime(dataDir: String): Boolean =
        NativeRuntimeLoader.callWhenLoaded(TAG, false) { nativeEnsureRuntime(dataDir) }

    internal fun runtimeReady(): Boolean =
        NativeRuntimeLoader.callWhenLoaded(TAG, false) { nativeRuntimeReady() }

    internal fun providerStatus(): String =
        callNativeString { nativeProviderStatus() }

    internal fun autofillList(
        origin: String,
        domain: String,
        includeDiagnostics: Boolean = false,
    ): String =
        callNativeString {
            if (includeDiagnostics) {
                nativeAutofillListWithDiagnostics(origin, domain)
            } else {
                nativeAutofillList(origin, domain)
            }
        }

    internal fun autofillCloseSession(sessionId: String): String =
        callNativeString { nativeAutofillCloseSession(sessionId) }

    internal fun autofillGetSecret(sessionId: String, credentialId: String, otpId: String): String =
        callNativeString { nativeAutofillGetSecret(sessionId, credentialId, otpId) }

    internal fun passwordSaveStart(payloadJson: String): String =
        callNativeString { nativePasswordSaveStart(payloadJson) }

    internal fun passwordSaveRequest(token: String): String =
        callNativeString { nativePasswordSaveRequest(token) }

    internal fun passwordSaveMarkLaunched(token: String): String =
        callNativeString { nativePasswordSaveMarkLaunched(token) }

    internal fun passkeyPreflight(command: String, payloadJson: String): String =
        callNativeString { nativePasskeyPreflight(command, payloadJson) }

    internal fun passkeyQuery(payloadJson: String): String =
        callNativeString { nativePasskeyQuery(payloadJson) }

    internal fun passkeyCreate(payloadJson: String): String =
        callNativeString { nativePasskeyCreate(payloadJson) }

    internal fun passkeyGet(payloadJson: String): String =
        callNativeString { nativePasskeyGet(payloadJson) }

    private fun callNativeString(block: () -> String): String =
        NativeRuntimeLoader.callWhenLoaded(TAG, "", block)

    @JvmStatic
    private external fun nativeEnsureRuntime(dataDir: String): Boolean

    @JvmStatic
    private external fun nativeRuntimeReady(): Boolean

    @JvmStatic
    private external fun nativeProviderStatus(): String

    @JvmStatic
    private external fun nativeAutofillList(origin: String, domain: String): String

    @JvmStatic
    private external fun nativeAutofillListWithDiagnostics(origin: String, domain: String): String

    @JvmStatic
    private external fun nativeAutofillCloseSession(sessionId: String): String

    @JvmStatic
    private external fun nativeAutofillGetSecret(sessionId: String, credentialId: String, otpId: String): String

    @JvmStatic
    private external fun nativePasswordSaveStart(payloadJson: String): String

    @JvmStatic
    private external fun nativePasswordSaveRequest(token: String): String

    @JvmStatic
    private external fun nativePasswordSaveMarkLaunched(token: String): String

    @JvmStatic
    private external fun nativePasskeyPreflight(command: String, payloadJson: String): String

    @JvmStatic
    private external fun nativePasskeyQuery(payloadJson: String): String

    @JvmStatic
    private external fun nativePasskeyCreate(payloadJson: String): String

    @JvmStatic
    private external fun nativePasskeyGet(payloadJson: String): String
}
