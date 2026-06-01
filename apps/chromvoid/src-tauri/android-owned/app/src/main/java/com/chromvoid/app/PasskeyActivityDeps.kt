package com.chromvoid.app

import android.content.Intent
import androidx.credentials.CreateCredentialResponse
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialException
import androidx.fragment.app.FragmentActivity

internal data class ResolvedGetPasskeyRequest(
    val requestData: GetPasskeyRequestData,
    val requestJson: String,
    val origin: String,
    val clientDataHash: ByteArray?,
)

internal data class ResolvedCreatePasskeyRequest(
    val requestData: CreatePasskeyRequestData,
    val requestJson: String,
    val origin: String,
    val clientDataHash: ByteArray?,
)

internal sealed interface GetRequestResolution {
    data class Success(
        val request: ResolvedGetPasskeyRequest,
    ) : GetRequestResolution

    data class Failure(
        val exception: GetCredentialException,
    ) : GetRequestResolution
}

internal sealed interface CreateRequestResolution {
    data class Success(
        val request: ResolvedCreatePasskeyRequest,
    ) : CreateRequestResolution

    data class Failure(
        val exception: CreateCredentialException,
    ) : CreateRequestResolution
}

internal interface PasskeyActivityBiometricRuntime {
    fun authenticateAssertion(
        activity: FragmentActivity,
        onSuccess: () -> Unit,
        onError: (GetCredentialException) -> Unit,
    )

    fun authenticateCreate(
        activity: FragmentActivity,
        onSuccess: () -> Unit,
        onError: (CreateCredentialException) -> Unit,
    )
}

internal interface PasskeyActivityRequestResolverRuntime {
    fun resolveGet(intent: Intent): GetRequestResolution
    fun resolveCreate(intent: Intent): CreateRequestResolution
}

internal interface PasskeyActivityResponseWriterRuntime {
    fun setGetSuccess(intent: Intent, response: GetCredentialResponse)
    fun setGetFailure(intent: Intent, exception: GetCredentialException)
    fun setCreateSuccess(intent: Intent, response: CreateCredentialResponse)
    fun setCreateFailure(intent: Intent, exception: CreateCredentialException)
}
