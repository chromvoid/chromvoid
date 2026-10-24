package com.chromvoid.air.session

import android.content.Context
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.chromvoid.air.R
import com.chromvoid.air.ui.access.PresenceCheck
import com.chromvoid.air.ui.access.PresencePreference
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The system's biometric prompt, with the screen lock as its fallback. It
 * proves only that the device owner is present; no key is released through
 * it, so it cannot unlock the vault.
 */
internal class DevicePresenceCheck(private val context: Context) : PresenceCheck {
    @Volatile
    private var activity: FragmentActivity? = null

    @Volatile
    private var prompt: BiometricPrompt? = null

    /** The activity the prompt is shown over; set while it is started. */
    fun attach(host: FragmentActivity?) {
        activity = host
    }

    override suspend fun authenticate(): PresenceCheck.Result = withContext(Dispatchers.Main.immediate) {
        val host = activity ?: return@withContext PresenceCheck.Result.UNAVAILABLE
        val available = BiometricManager.from(context).canAuthenticate(AUTHENTICATORS)
        if (available != BiometricManager.BIOMETRIC_SUCCESS) return@withContext PresenceCheck.Result.UNAVAILABLE
        val answer = CompletableDeferred<PresenceCheck.Result>()
        val shown = BiometricPrompt(
            host,
            ContextCompat.getMainExecutor(host),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    answer.complete(PresenceCheck.Result.ACCEPTED)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    answer.complete(
                        when (errorCode) {
                            BiometricPrompt.ERROR_CANCELED,
                            BiometricPrompt.ERROR_USER_CANCELED,
                            BiometricPrompt.ERROR_NEGATIVE_BUTTON,
                            -> PresenceCheck.Result.CANCELLED
                            BiometricPrompt.ERROR_NO_BIOMETRICS,
                            BiometricPrompt.ERROR_NO_DEVICE_CREDENTIAL,
                            BiometricPrompt.ERROR_HW_NOT_PRESENT,
                            BiometricPrompt.ERROR_HW_UNAVAILABLE,
                            -> PresenceCheck.Result.UNAVAILABLE
                            else -> PresenceCheck.Result.FAILED
                        },
                    )
                }
                // A rejected fingerprint is retried inside the prompt; only its end is an answer.
            },
        )
        prompt = shown
        shown.authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle(host.getString(R.string.presence_prompt_title))
                .setAllowedAuthenticators(AUTHENTICATORS)
                .build(),
        )
        try {
            answer.await()
        } finally {
            prompt = null
        }
    }

    override fun cancel() {
        prompt?.cancelAuthentication()
        prompt = null
    }

    private companion object {
        const val AUTHENTICATORS = BIOMETRIC_STRONG or DEVICE_CREDENTIAL
    }
}

/** The gate's on/off choice, in the app's private preferences; backups exclude them. */
internal class StoredPresencePreference(context: Context) : PresencePreference {
    private val preferences = context.getSharedPreferences("air-presence", Context.MODE_PRIVATE)

    override var enabled: Boolean
        get() = preferences.getBoolean(KEY, false)
        set(value) {
            preferences.edit().putBoolean(KEY, value).apply()
        }

    private companion object {
        const val KEY = "enabled"
    }
}
