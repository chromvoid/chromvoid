package com.chromvoid.app.passkey

import android.content.Intent
import androidx.credentials.GetCredentialResponse
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialInterruptedException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.exceptions.NoCredentialException
import androidx.fragment.app.FragmentActivity
import com.chromvoid.app.ChromVoidCredentialProviderService
import com.chromvoid.app.GetRequestResolution
import com.chromvoid.app.PasskeyActivityBiometricRuntime
import com.chromvoid.app.PasskeyActivityCryptoRuntime
import com.chromvoid.app.PasskeyActivityRequestResolverRuntime
import com.chromvoid.app.PasskeyActivityResponseWriterRuntime
import com.chromvoid.app.PasskeyMetadata
import com.chromvoid.app.ResolvedGetPasskeyRequest
import com.chromvoid.app.credentialprovider.AndroidBridgeGateway
import com.chromvoid.app.security.PasskeyMetadataStore
import com.chromvoid.app.shared.AndroidClock
import java.security.Signature

internal class PasskeyGetCoordinator(
    private val bridgeGateway: AndroidBridgeGateway,
    private val requestRegistry: PasskeyRequestRegistry,
    private val passkeyStore: PasskeyMetadataStore,
    private val clock: AndroidClock,
    private val requestResolver: PasskeyActivityRequestResolverRuntime = AndroidPasskeyRequestResolver,
    private val responseWriter: PasskeyActivityResponseWriterRuntime = AndroidPasskeyResponseWriter,
    private val crypto: PasskeyActivityCryptoRuntime = AndroidPasskeyCryptoRuntime,
) {
    fun execute(
        activity: FragmentActivity,
        intent: Intent,
        biometric: PasskeyActivityBiometricRuntime,
        onSuccess: (requestId: String, resultIntent: Intent) -> Unit,
        onFailure: (requestId: String, exception: GetCredentialException) -> Unit,
    ) {
        val requestId =
            intent.getStringExtra(ChromVoidCredentialProviderService.EXTRA_REQUEST_ID).orEmpty()
        val credentialId =
            intent.getStringExtra(ChromVoidCredentialProviderService.EXTRA_CREDENTIAL_ID).orEmpty()
        if (requestId.isBlank() || credentialId.isBlank()) {
            onFailure("", GetCredentialUnknownException("ChromVoid passkey request is missing required extras."))
            return
        }

        val pendingRequest = requestRegistry.get(requestId)
        if (pendingRequest == null || pendingRequest.command != "get") {
            onFailure(requestId, GetCredentialInterruptedException("ChromVoid passkey request is no longer active."))
            return
        }

        PasskeyProviderStatusGuard.getFailure(bridgeGateway)?.let {
            onFailure(requestId, it)
            return
        }

        val resolved =
            when (val requestResolution = requestResolver.resolveGet(intent)) {
                is GetRequestResolution.Failure -> {
                    onFailure(requestId, requestResolution.exception)
                    return
                }
                is GetRequestResolution.Success -> requestResolution.request
            }

        val metadata =
            runCatching { passkeyStore.findByCredentialId(credentialId) }.getOrElse {
                onFailure(requestId, GetCredentialUnknownException("ChromVoid could not read local Android passkeys."))
                return
            }
        val resolvedMetadata =
            metadata ?: run {
                onFailure(requestId, NoCredentialException("The selected ChromVoid passkey is no longer available."))
                return
            }
        if (!matchesActiveSelection(resolvedMetadata, resolved, pendingRequest.rpId)) {
            onFailure(requestId, NoCredentialException("The selected ChromVoid passkey is no longer available."))
            return
        }

        val clientDataJson =
            PasskeyResponseAssembler.clientDataJson(
                "webauthn.get",
                resolved.requestData.challengeB64Url,
                resolved.origin,
            )
        val clientDataHash = PasskeyResponseAssembler.clientDataHash(clientDataJson, resolved.clientDataHash)
        val nextSignCount = resolvedMetadata.signCount + 1
        val authenticatorData =
            PasskeyResponseAssembler.authenticatorDataForAssertion(
                rpId = resolvedMetadata.rpId,
                signCount = nextSignCount,
            )
        val signature =
            runCatching { crypto.beginAssertionSignature(resolvedMetadata) }.getOrElse {
                onFailure(requestId, GetCredentialUnknownException("ChromVoid could not initialize Android passkey signing."))
                return
            }

        biometric.authenticateAssertion(
            activity = activity,
            signature = signature,
            onSuccess = { resolvedSignature ->
                handleGetSuccess(
                    requestId = requestId,
                    metadata = resolvedMetadata,
                    signature = resolvedSignature ?: signature,
                    authenticatorData = authenticatorData,
                    clientDataHash = clientDataHash,
                    clientDataJson = clientDataJson,
                    nextSignCount = nextSignCount,
                    onSuccess = onSuccess,
                    onFailure = onFailure,
                )
            },
            onError = { exception -> onFailure(requestId, exception) },
        )
    }

    private fun handleGetSuccess(
        requestId: String,
        metadata: PasskeyMetadata,
        signature: Signature,
        authenticatorData: ByteArray,
        clientDataHash: ByteArray,
        clientDataJson: ByteArray,
        nextSignCount: Long,
        onSuccess: (requestId: String, resultIntent: Intent) -> Unit,
        onFailure: (requestId: String, exception: GetCredentialException) -> Unit,
    ) {
        val signed =
            runCatching {
                crypto.signAssertion(signature, authenticatorData, clientDataHash)
            }.getOrElse {
                onFailure(requestId, GetCredentialUnknownException("ChromVoid could not sign the Android passkey assertion."))
                return
            }

        val resultIntent =
            runCatching {
                val intent = Intent()
                responseWriter.setGetSuccess(
                    intent,
                    GetCredentialResponse(
                        PublicKeyCredential(
                            PasskeyResponseAssembler.assertionResponseJson(
                                credentialId = crypto.credentialIdBytes(metadata),
                                userId = crypto.userIdBytes(metadata),
                                clientDataJson = clientDataJson,
                                authenticatorData = authenticatorData,
                                signature = signed,
                            ),
                        ),
                    ),
                )
                intent
            }.getOrElse {
                onFailure(requestId, GetCredentialUnknownException("ChromVoid could not serialize the Android passkey assertion."))
                return
            }

        runCatching {
            passkeyStore.updateUsage(
                credentialId = metadata.credentialIdB64Url,
                signCount = nextSignCount,
                lastUsedEpochMs = clock.now(),
            )
        }.getOrElse {
            onFailure(requestId, GetCredentialUnknownException("ChromVoid could not update the Android passkey usage metadata."))
            return
        }

        onSuccess(requestId, resultIntent)
    }

    private fun matchesActiveSelection(
        metadata: PasskeyMetadata?,
        resolved: ResolvedGetPasskeyRequest,
        pendingRpId: String,
    ): Boolean {
        return metadata != null &&
            metadata.rpId == resolved.requestData.rpId &&
            pendingRpId == resolved.requestData.rpId
    }
}
