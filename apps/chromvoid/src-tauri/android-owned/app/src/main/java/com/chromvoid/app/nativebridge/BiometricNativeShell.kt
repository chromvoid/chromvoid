package com.chromvoid.app.nativebridge

import android.content.Context
import com.chromvoid.app.security.AppGateBiometricBridgeController
import com.chromvoid.app.shared.NativeBridgeTaskDispatcher
import com.chromvoid.app.shared.NativeRuntimeLoader

internal object BiometricNativeShell {
    private const val TAG = "ChromVoid/Biometric"

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
                        dispatchNativeCallback("biometric.auth_success") {
                            nativeOnAuthSuccess()
                        }
                    }

                    override fun onAuthCancelled() {
                        dispatchNativeCallback("biometric.auth_cancelled") {
                            nativeOnAuthCancelled()
                        }
                    }

                    override fun onAuthError(errorCode: Int) {
                        dispatchNativeCallback("biometric.auth_error") {
                            nativeOnAuthError(errorCode)
                        }
                    }
                },
        )
    }

    private fun dispatchNativeCallback(
        owner: String,
        callback: () -> Unit,
    ) {
        NativeBridgeTaskDispatcher.execute(owner) {
            NativeRuntimeLoader.runWhenLoaded(TAG, callback)
        }
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
