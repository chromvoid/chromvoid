package com.chromvoid.app.nativebridge

import android.content.Context
import android.util.Log
import com.chromvoid.app.security.AppGateBiometricBridgeController

internal object BiometricNativeShell {
    private const val TAG = "ChromVoid/Biometric"

    init {
        runCatching { System.loadLibrary("chromvoid_lib") }
            .onFailure { error ->
                Log.w(TAG, "Native biometric library is not available in this process", error)
            }
    }

    @JvmStatic
    fun biometricPromptAvailable(context: Context): Int {
        return AppGateBiometricBridgeController.biometricPromptAvailable(context)
    }

    @JvmStatic
    fun startPrompt(reason: String): Int {
        return AppGateBiometricBridgeController.startPrompt(
            reason = reason,
            callbacks =
                object : AppGateBiometricBridgeController.NativeCallbacks {
                    override fun onAuthSuccess() {
                        nativeOnAuthSuccess()
                    }

                    override fun onAuthCancelled() {
                        nativeOnAuthCancelled()
                    }

                    override fun onAuthError(errorCode: Int) {
                        nativeOnAuthError(errorCode)
                    }
                },
        )
    }

    @JvmStatic
    private external fun nativeOnAuthSuccess()

    @JvmStatic
    private external fun nativeOnAuthDenied()

    @JvmStatic
    private external fun nativeOnAuthCancelled()

    @JvmStatic
    private external fun nativeOnAuthError(errorCode: Int)
}
