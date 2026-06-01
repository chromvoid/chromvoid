package com.chromvoid.app.security

import android.content.Context
import android.util.Log
import androidx.biometric.BiometricManager
import androidx.fragment.app.FragmentActivity
import com.chromvoid.app.R
import com.chromvoid.app.androidAppGraph
import com.chromvoid.app.shared.AndroidRuntimeAccess
import java.util.concurrent.atomic.AtomicBoolean

internal object AppGateBiometricBridgeController {
    private const val TAG = "ChromVoid/Biometric"
    private const val INTERNAL_NO_ACTIVITY = -1001
    private const val INTERNAL_PROMPT_EXCEPTION = -1003

    private data class PendingPrompt(
        val activity: FragmentActivity,
        val callbacks: NativeCallbacks,
        val completed: AtomicBoolean = AtomicBoolean(false),
    )

    @Volatile
    private var pendingPrompt: PendingPrompt? = null

    interface NativeCallbacks {
        fun onAuthSuccess()
        fun onAuthCancelled()
        fun onAuthError(errorCode: Int)
    }

    fun biometricPromptAvailable(context: Context): Int {
        return try {
            BiometricManager.from(context.applicationContext)
                .canAuthenticate(BiometricPromptAuth.ALLOWED_AUTHENTICATORS)
        } catch (error: Exception) {
            Log.e(TAG, "Failed to query biometric availability", error)
            INTERNAL_PROMPT_EXCEPTION
        }
    }

    fun startPrompt(
        reason: String,
        callbacks: NativeCallbacks,
    ): Int {
        val activity = currentActivity() ?: return INTERNAL_NO_ACTIVITY
        if (activity.isFinishing || activity.isDestroyed) {
            return INTERNAL_NO_ACTIVITY
        }

        val availability = biometricPromptAvailable(activity.applicationContext)
        if (availability != BiometricManager.BIOMETRIC_SUCCESS) {
            return availability
        }

        val runner = activity.androidAppGraph().biometricPromptRunner
        return try {
            runner.withPromptLock {
                val pending = PendingPrompt(activity = activity, callbacks = callbacks)
                pendingPrompt = pending
                runner.authenticate(
                    activity = activity,
                    title = reason.ifBlank { activity.getString(R.string.biometric_prompt_title) },
                    subtitle = activity.getString(R.string.biometric_prompt_subtitle),
                    onSuccess = {
                        completePrompt(pending) { callbacks.onAuthSuccess() }
                    },
                    onCancel = {
                        completePrompt(pending) { callbacks.onAuthCancelled() }
                    },
                    onError = { errorCode, errString ->
                        Log.w(TAG, "Biometric auth terminal error: $errorCode ($errString)")
                        completePrompt(pending) { callbacks.onAuthError(errorCode) }
                    },
                )
                0
            }
        } catch (error: Exception) {
            pendingPrompt = null
            Log.e(TAG, "Failed to launch biometric prompt", error)
            callbacks.onAuthError(INTERNAL_PROMPT_EXCEPTION)
            INTERNAL_PROMPT_EXCEPTION
        }
    }

    fun cancelPromptFor(activity: FragmentActivity) {
        val pending = pendingPrompt
        if (pending?.activity !== activity) {
            activity.androidAppGraph().biometricPromptRunner.cancelActivePrompt(activity)
            return
        }
        if (!pending.completed.compareAndSet(false, true)) {
            return
        }

        pendingPrompt = null
        activity.androidAppGraph().biometricPromptRunner.cancelActivePrompt(activity)
        Log.i(TAG, "Cancelling pending biometric prompt because host activity paused")
        pending.callbacks.onAuthCancelled()
    }

    private fun completePrompt(
        pending: PendingPrompt,
        complete: () -> Unit,
    ) {
        if (!pending.completed.compareAndSet(false, true)) {
            return
        }
        if (pendingPrompt === pending) {
            pendingPrompt = null
        }
        complete()
    }

    private fun currentActivity(): FragmentActivity? {
        return AndroidRuntimeAccess.appGraphOrNull()?.biometricPromptRunner?.currentActivity()
    }
}
