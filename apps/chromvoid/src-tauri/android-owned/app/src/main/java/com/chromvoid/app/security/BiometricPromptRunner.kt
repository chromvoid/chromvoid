package com.chromvoid.app.security

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.chromvoid.app.shared.CurrentActivityRegistry
import java.security.Signature
import java.util.concurrent.atomic.AtomicBoolean

internal object BiometricPromptAuth {
    const val ALLOWED_AUTHENTICATORS =
        BiometricManager.Authenticators.BIOMETRIC_STRONG or
            BiometricManager.Authenticators.DEVICE_CREDENTIAL
}

internal class BiometricPromptRunner(
    private val currentActivityRegistry: CurrentActivityRegistry<FragmentActivity>,
) {
    private val promptActive = AtomicBoolean(false)
    @Volatile
    private var activePrompt: BiometricPrompt? = null
    @Volatile
    private var activePromptActivity: FragmentActivity? = null

    fun availabilityCode(activity: FragmentActivity): Int {
        return BiometricManager.from(activity.applicationContext)
            .canAuthenticate(BiometricPromptAuth.ALLOWED_AUTHENTICATORS)
    }

    fun currentActivity(): FragmentActivity? = currentActivityRegistry.current()

    fun withPromptLock(block: () -> Int): Int {
        if (!promptActive.compareAndSet(false, true)) {
            return PROMPT_ALREADY_ACTIVE
        }
        return try {
            block()
        } catch (error: Throwable) {
            finishPrompt()
            throw error
        }
    }

    fun finishPrompt() {
        promptActive.compareAndSet(true, false)
        activePrompt = null
        activePromptActivity = null
    }

    fun cancelActivePrompt(activity: FragmentActivity? = null): Boolean {
        val prompt = activePrompt ?: return false
        if (activity != null && activePromptActivity !== activity) {
            return false
        }

        finishPrompt()
        prompt.cancelAuthentication()
        return true
    }

    fun authenticate(
        activity: FragmentActivity,
        title: String,
        subtitle: String,
        cryptoObject: BiometricPrompt.CryptoObject? = null,
        onSuccess: (BiometricPrompt.AuthenticationResult) -> Unit,
        onCancel: () -> Unit,
        onError: (Int, CharSequence) -> Unit,
    ) {
        val prompt =
            BiometricPrompt(
                activity,
                ContextCompat.getMainExecutor(activity),
                object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        finishPrompt()
                        onSuccess(result)
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        finishPrompt()
                        when (errorCode) {
                            BiometricPrompt.ERROR_CANCELED,
                            BiometricPrompt.ERROR_USER_CANCELED,
                            BiometricPrompt.ERROR_NEGATIVE_BUTTON -> onCancel()
                            else -> onError(errorCode, errString)
                        }
                    }
                },
            )
        activePrompt = prompt
        activePromptActivity = activity

        val promptInfo =
            BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .setSubtitle(subtitle)
                .setAllowedAuthenticators(BiometricPromptAuth.ALLOWED_AUTHENTICATORS)
                .build()

        if (cryptoObject != null) {
            prompt.authenticate(promptInfo, cryptoObject)
        } else {
            prompt.authenticate(promptInfo)
        }
    }

    fun cryptoObject(signature: Signature): BiometricPrompt.CryptoObject {
        return BiometricPrompt.CryptoObject(signature)
    }

    companion object {
        const val PROMPT_ALREADY_ACTIVE = -1002
    }
}
