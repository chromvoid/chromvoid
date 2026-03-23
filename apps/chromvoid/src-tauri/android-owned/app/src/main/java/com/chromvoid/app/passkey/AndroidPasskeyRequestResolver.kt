package com.chromvoid.app.passkey

import android.content.Intent
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.exceptions.CreateCredentialInterruptedException
import androidx.credentials.exceptions.CreateCredentialNoCreateOptionException
import androidx.credentials.exceptions.CreateCredentialUnknownException
import androidx.credentials.exceptions.GetCredentialInterruptedException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.exceptions.NoCredentialException
import androidx.credentials.provider.PendingIntentHandler
import com.chromvoid.app.CreateRequestResolution
import com.chromvoid.app.GetRequestResolution
import com.chromvoid.app.PasskeyActivityRequestResolverRuntime
import com.chromvoid.app.ResolvedCreatePasskeyRequest
import com.chromvoid.app.ResolvedGetPasskeyRequest

internal object AndroidPasskeyRequestResolver : PasskeyActivityRequestResolverRuntime {
    override fun resolveGet(intent: Intent): GetRequestResolution {
        val providerRequest = PendingIntentHandler.retrieveProviderGetCredentialRequest(intent)
            ?: return GetRequestResolution.Failure(
                GetCredentialInterruptedException(
                    "ChromVoid did not receive the selected passkey request.",
                ),
            )
        val option = providerRequest.credentialOptions.singleOrNull() as? GetPublicKeyCredentialOption
            ?: return GetRequestResolution.Failure(
                NoCredentialException("ChromVoid did not receive a public-key credential option."),
            )
        val parsedRequest = PasskeyRequestParser.parseGetRequest(option)
            ?: return GetRequestResolution.Failure(
                GetCredentialUnknownException("ChromVoid could not parse the passkey retrieval request."),
            )

        return GetRequestResolution.Success(
            ResolvedGetPasskeyRequest(
                requestData = parsedRequest,
                origin = PasskeyOriginResolver.originForCallingApp(providerRequest.callingAppInfo),
                clientDataHash = option.clientDataHash,
            ),
        )
    }

    override fun resolveCreate(intent: Intent): CreateRequestResolution {
        val providerRequest = PendingIntentHandler.retrieveProviderCreateCredentialRequest(intent)
            ?: return CreateRequestResolution.Failure(
                CreateCredentialInterruptedException(
                    "ChromVoid did not receive the selected passkey create request.",
                ),
            )
        val createRequest = providerRequest.callingRequest as? CreatePublicKeyCredentialRequest
            ?: return CreateRequestResolution.Failure(
                CreateCredentialNoCreateOptionException(
                    "ChromVoid did not receive a public-key create request.",
                ),
            )
        val parsedRequest = PasskeyRequestParser.parseCreateRequest(createRequest)
            ?: return CreateRequestResolution.Failure(
                CreateCredentialUnknownException("ChromVoid could not parse the passkey create request."),
            )

        return CreateRequestResolution.Success(
            ResolvedCreatePasskeyRequest(
                requestData = parsedRequest,
                origin = PasskeyOriginResolver.originForCallingApp(providerRequest.callingAppInfo),
            ),
        )
    }
}
