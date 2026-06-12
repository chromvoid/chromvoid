package com.chromvoid.app.passkey

import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialInterruptedException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialInterruptedException
import androidx.fragment.app.FragmentActivity
import com.chromvoid.app.PasskeyActivityBiometricRuntime
import com.chromvoid.app.R
import com.chromvoid.app.security.BiometricPromptRunner

internal class BiometricPromptRunnerAdapter(
    private val biometricPromptRunner: BiometricPromptRunner,
) : PasskeyActivityBiometricRuntime {
    override fun authenticateAssertion(
        activity: FragmentActivity,
        onSuccess: () -> Unit,
        onError: (GetCredentialException) -> Unit,
    ) {
        val result =
            biometricPromptRunner.withPromptLock {
                biometricPromptRunner.authenticate(
                    activity = activity,
                    title = activity.getString(R.string.passkey_get_title),
                    subtitle = activity.getString(R.string.passkey_prompt_subtitle),
                    onSuccess = {
                        onSuccess()
                    },
                    onCancel = {
                        onError(
                            GetCredentialCancellationException(
                                "ChromVoid passkey prompt was cancelled.",
                            ),
                        )
                    },
                    onError = { _, errString ->
                        onError(
                            GetCredentialInterruptedException(
                                errString.takeIf { it.isNotBlank() }
                                    ?: "ChromVoid passkey prompt was interrupted.",
                            ),
                        )
                    },
                )
                0
            }
        if (result == BiometricPromptRunner.PROMPT_ALREADY_ACTIVE) {
            onError(GetCredentialInterruptedException("ChromVoid passkey prompt is already active."))
        }
    }

    override fun authenticateCreate(
        activity: FragmentActivity,
        onSuccess: () -> Unit,
        onError: (androidx.credentials.exceptions.CreateCredentialException) -> Unit,
    ) {
        val result =
            biometricPromptRunner.withPromptLock {
                biometricPromptRunner.authenticate(
                    activity = activity,
                    title = activity.getString(R.string.passkey_create_title),
                    subtitle = activity.getString(R.string.passkey_prompt_subtitle),
                    onSuccess = {
                        onSuccess()
                    },
                    onCancel = {
                        onError(
                            CreateCredentialCancellationException(
                                "ChromVoid passkey prompt was cancelled.",
                            ),
                        )
                    },
                    onError = { _, errString ->
                        onError(
                            CreateCredentialInterruptedException(
                                errString.takeIf { it.isNotBlank() }
                                    ?: "ChromVoid passkey prompt was interrupted.",
                            ),
                        )
                    },
                )
                0
            }
        if (result == BiometricPromptRunner.PROMPT_ALREADY_ACTIVE) {
            onError(CreateCredentialInterruptedException("ChromVoid passkey prompt is already active."))
        }
    }
}
