package com.chromvoid.app.nativebridge

import android.os.Build
import android.util.Log
import com.chromvoid.app.credentialprovider.AutofillProviderSettingsBridge
import com.chromvoid.app.shared.AndroidRuntimeAccess

internal object CredentialProviderNativeShell {
    private const val TAG = "ChromVoid/CredentialProvider"

    init {
        runCatching { System.loadLibrary("chromvoid_lib") }
            .onFailure { error ->
                Log.w(TAG, "Native bridge library is not available in this process", error)
            }
    }

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

    internal fun ensureRuntime(dataDir: String): Boolean = nativeEnsureRuntime(dataDir)

    internal fun runtimeReady(): Boolean = nativeRuntimeReady()

    internal fun providerStatus(): String = nativeProviderStatus()

    internal fun autofillList(origin: String, domain: String): String =
        nativeAutofillList(origin, domain)

    internal fun autofillGetSecret(sessionId: String, credentialId: String, otpId: String): String =
        nativeAutofillGetSecret(sessionId, credentialId, otpId)

    internal fun passwordSaveStart(payloadJson: String): String =
        nativePasswordSaveStart(payloadJson)

    internal fun passwordSaveRequest(token: String): String =
        nativePasswordSaveRequest(token)

    internal fun passwordSaveMarkLaunched(token: String): String =
        nativePasswordSaveMarkLaunched(token)

    internal fun passkeyPreflight(command: String, payloadJson: String): String =
        nativePasskeyPreflight(command, payloadJson)

    @JvmStatic
    private external fun nativeEnsureRuntime(dataDir: String): Boolean

    @JvmStatic
    private external fun nativeRuntimeReady(): Boolean

    @JvmStatic
    private external fun nativeProviderStatus(): String

    @JvmStatic
    private external fun nativeAutofillList(origin: String, domain: String): String

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
}
