package com.chromvoid.app.passkey

import android.content.Intent
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialInterruptedException
import androidx.credentials.exceptions.CreateCredentialNoCreateOptionException
import androidx.credentials.exceptions.CreateCredentialUnknownException
import androidx.fragment.app.FragmentActivity
import com.chromvoid.app.ChromVoidCredentialProviderService
import com.chromvoid.app.CreatePasskeyRequestData
import com.chromvoid.app.CreateRequestResolution
import com.chromvoid.app.PasskeyActivityBiometricRuntime
import com.chromvoid.app.PasskeyActivityCryptoRuntime
import com.chromvoid.app.PasskeyActivityRequestResolverRuntime
import com.chromvoid.app.PasskeyActivityResponseWriterRuntime
import com.chromvoid.app.credentialprovider.AndroidBridgeGateway
import com.chromvoid.app.security.PasskeyMetadataStore

internal class PasskeyCreateCoordinator(
    private val bridgeGateway: AndroidBridgeGateway,
    private val requestRegistry: PasskeyRequestRegistry,
    private val passkeyStore: PasskeyMetadataStore,
    private val requestResolver: PasskeyActivityRequestResolverRuntime = AndroidPasskeyRequestResolver,
    private val responseWriter: PasskeyActivityResponseWriterRuntime = AndroidPasskeyResponseWriter,
    private val crypto: PasskeyActivityCryptoRuntime = AndroidPasskeyCryptoRuntime,
) {
    fun execute(
        activity: FragmentActivity,
        intent: Intent,
        biometric: PasskeyActivityBiometricRuntime,
        onSuccess: (requestId: String, resultIntent: Intent) -> Unit,
        onFailure: (requestId: String, exception: CreateCredentialException) -> Unit,
    ) {
        val requestId =
            intent.getStringExtra(ChromVoidCredentialProviderService.EXTRA_REQUEST_ID).orEmpty()
        if (requestId.isBlank()) {
            onFailure("", CreateCredentialUnknownException("ChromVoid passkey create request is missing its handle."))
            return
        }

        val pendingRequest = requestRegistry.get(requestId)
        if (pendingRequest == null || pendingRequest.command != "create") {
            onFailure(requestId, CreateCredentialInterruptedException("ChromVoid passkey create request is no longer active."))
            return
        }

        PasskeyProviderStatusGuard.createFailure(bridgeGateway)?.let {
            onFailure(requestId, it)
            return
        }

        val resolved =
            when (val requestResolution = requestResolver.resolveCreate(intent)) {
                is CreateRequestResolution.Failure -> {
                    onFailure(requestId, requestResolution.exception)
                    return
                }
                is CreateRequestResolution.Success -> requestResolution.request
            }

        if (!PasskeyResponseAssembler.supportsEs256(resolved.requestData)) {
            onFailure(requestId, CreateCredentialNoCreateOptionException("ChromVoid supports only ES256 passkeys on Android v1."))
            return
        }
        if (!PasskeyResponseAssembler.supportsAttestationNone(resolved.requestData)) {
            onFailure(requestId, CreateCredentialNoCreateOptionException("ChromVoid supports attestation=\"none\" only on Android v1."))
            return
        }

        val hasExcludedCredential =
            runCatching { passkeyStore.hasExcludedCredential(resolved.requestData.excludeCredentialIds) }.getOrElse {
                onFailure(requestId, CreateCredentialUnknownException("ChromVoid could not read local Android passkeys."))
                return
            }
        if (hasExcludedCredential) {
            onFailure(requestId, CreateCredentialNoCreateOptionException("A local ChromVoid passkey already matches the excluded credential set."))
            return
        }

        val clientDataJson =
            PasskeyResponseAssembler.clientDataJson(
                "webauthn.create",
                resolved.requestData.challengeB64Url,
                resolved.origin,
            )

        biometric.authenticateCreate(
            activity = activity,
            onSuccess = {
                handleCreateSuccess(
                    requestId = requestId,
                    parsedRequest = resolved.requestData,
                    clientDataJson = clientDataJson,
                    onSuccess = onSuccess,
                    onFailure = onFailure,
                )
            },
            onError = { exception -> onFailure(requestId, exception) },
        )
    }

    private fun handleCreateSuccess(
        requestId: String,
        parsedRequest: CreatePasskeyRequestData,
        clientDataJson: ByteArray,
        onSuccess: (requestId: String, resultIntent: Intent) -> Unit,
        onFailure: (requestId: String, exception: CreateCredentialException) -> Unit,
    ) {
        val created =
            runCatching { crypto.createCredential(parsedRequest) }.getOrElse {
                onFailure(requestId, CreateCredentialUnknownException("ChromVoid could not create the Android passkey key material."))
                return
            }

        val attestationObject =
            runCatching {
                val authenticatorData =
                    PasskeyResponseAssembler.authenticatorDataForRegistration(
                        rpId = parsedRequest.rpId,
                        credentialId = created.credentialId,
                        cosePublicKey = created.cosePublicKey,
                    )
                PasskeyResponseAssembler.attestationObject(authenticatorData)
            }.getOrElse {
                onFailure(requestId, CreateCredentialUnknownException("ChromVoid could not serialize the Android passkey attestation."))
                return
            }

        runCatching {
            passkeyStore.saveNew(created.metadata)
        }.getOrElse {
            onFailure(requestId, CreateCredentialUnknownException("ChromVoid could not persist the Android passkey metadata."))
            return
        }

        val resultIntent =
            runCatching {
                val intent = Intent()
                responseWriter.setCreateSuccess(
                    intent,
                    CreatePublicKeyCredentialResponse(
                        PasskeyResponseAssembler.registrationResponseJson(
                            credentialId = created.credentialId,
                            clientDataJson = clientDataJson,
                            attestationObject = attestationObject,
                        ),
                    ),
                )
                intent
            }.getOrElse {
                onFailure(requestId, CreateCredentialUnknownException("ChromVoid could not serialize the Android passkey registration response."))
                return
            }

        onSuccess(requestId, resultIntent)
    }
}
