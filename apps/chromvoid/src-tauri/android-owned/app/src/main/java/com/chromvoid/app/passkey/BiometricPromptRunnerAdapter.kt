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
import java.security.Signature

internal class BiometricPromptRunnerAdapter(
    private val biometricPromptRunner: BiometricPromptRunner,
) : PasskeyActivityBiometricRuntime {
    override fun authenticateAssertion(
        activity: FragmentActivity,
        signature: Signature,
        onSuccess: (Signature?) -> Unit,
        onError: (GetCredentialException) -> Unit,
    ) {
        biometricPromptRunner.authenticate(
            activity = activity,
            title = activity.getString(R.string.passkey_get_title),
            subtitle = activity.getString(R.string.passkey_prompt_subtitle),
            cryptoObject = biometricPromptRunner.cryptoObject(signature),
            onSuccess = { result ->
                onSuccess(result.cryptoObject?.signature)
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
    }

    override fun authenticateCreate(
        activity: FragmentActivity,
        onSuccess: () -> Unit,
        onError: (androidx.credentials.exceptions.CreateCredentialException) -> Unit,
    ) {
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
    }
}
