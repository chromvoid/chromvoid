package com.chromvoid.app.passkey

import android.content.Intent
import android.os.SystemClock
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialInterruptedException
import androidx.credentials.exceptions.CreateCredentialNoCreateOptionException
import androidx.credentials.exceptions.CreateCredentialUnknownException
import androidx.fragment.app.FragmentActivity
import com.chromvoid.app.ChromVoidCredentialProviderService
import com.chromvoid.app.CreateRequestResolution
import com.chromvoid.app.PasskeyActivityBiometricRuntime
import com.chromvoid.app.PasskeyActivityRequestResolverRuntime
import com.chromvoid.app.PasskeyActivityResponseWriterRuntime
import com.chromvoid.app.PasskeyCoreRequestPayload
import com.chromvoid.app.credentialprovider.AndroidBridgeGateway
import com.chromvoid.app.shared.TracePrivacy
import java.security.MessageDigest

internal class PasskeyCreateCoordinator(
    private val bridgeGateway: AndroidBridgeGateway,
    private val requestRegistry: PasskeyRequestRegistry,
    private val requestResolver: PasskeyActivityRequestResolverRuntime = AndroidPasskeyRequestResolver,
    private val responseWriter: PasskeyActivityResponseWriterRuntime = AndroidPasskeyResponseWriter,
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
            PasskeyTrace.diagnostic(
                "create_request_rejected",
                "requestId" to requestId,
                "rpId" to resolved.requestData.rpId,
                "reason" to "unsupported_algorithm",
                "algorithms" to resolved.requestData.supportedAlgorithms.sorted(),
            )
            onFailure(requestId, CreateCredentialNoCreateOptionException("ChromVoid supports only ES256 passkeys on Android v1."))
            return
        }
        if (!PasskeyResponseAssembler.supportsAttestationNone(resolved.requestData)) {
            PasskeyTrace.diagnostic(
                "create_request_rejected",
                "requestId" to requestId,
                "rpId" to resolved.requestData.rpId,
                "reason" to "unsupported_attestation",
                "attestation" to resolved.requestData.attestationPreference,
            )
            onFailure(requestId, CreateCredentialNoCreateOptionException("ChromVoid supports attestation=\"none\" only on Android v1."))
            return
        }

        PasskeyTrace.important(
            "create_request_resolved",
            "requestId" to requestId,
            "rpId" to resolved.requestData.rpId,
            "origin" to resolved.origin,
            "clientDataMode" to if (resolved.clientDataHash != null) "provided-hash" else "assembled-json",
            "challengeLen" to resolved.requestData.challengeB64Url.length,
            "providedClientDataHashLen" to (resolved.clientDataHash?.size ?: 0),
            "algorithms" to resolved.requestData.supportedAlgorithms.sorted(),
            "attestation" to resolved.requestData.attestationPreference.ifBlank { "none" },
            "excludes" to resolved.requestData.excludeCredentialIds.size,
            "credPropsRequested" to resolved.requestData.credPropsRequested,
            "residentKeyRequired" to resolved.requestData.residentKeyRequired,
        )
        PasskeyTrace.diagnostic(
            "create_biometric_start",
            "requestId" to requestId,
            "rpId" to resolved.requestData.rpId,
        )
        biometric.authenticateCreate(
            activity = activity,
            onSuccess = {
                PasskeyTrace.diagnostic(
                    "create_biometric_success",
                    "requestId" to requestId,
                    "rpId" to resolved.requestData.rpId,
                )
                handleCreateSuccess(
                    requestId = requestId,
                    rpId = resolved.requestData.rpId,
                    origin = resolved.origin,
                    requestJson = resolved.requestJson,
                    clientDataHash = resolved.clientDataHash,
                    onSuccess = onSuccess,
                    onFailure = onFailure,
                )
            },
            onError = { exception ->
                PasskeyTrace.diagnostic(
                    "create_biometric_error",
                    "requestId" to requestId,
                    "rpId" to resolved.requestData.rpId,
                    "exception" to exception::class.java.simpleName,
                    "message" to exception.message,
                )
                onFailure(requestId, exception)
            },
        )
    }

    private fun handleCreateSuccess(
        requestId: String,
        rpId: String,
        origin: String,
        requestJson: String,
        clientDataHash: ByteArray?,
        onSuccess: (requestId: String, resultIntent: Intent) -> Unit,
        onFailure: (requestId: String, exception: CreateCredentialException) -> Unit,
    ) {
        val coreStartedAt = SystemClock.elapsedRealtime()
        val created =
            when (
                val result =
                    bridgeGateway.passkeyCreate(
                        PasskeyCoreRequestPayload(
                            requestJson = requestJson,
                            origin = origin,
                            clientDataHashB64Url = clientDataHash?.let(PasskeyEncoding::base64UrlEncode),
                        ),
                    )
            ) {
                is com.chromvoid.app.credentialprovider.BridgeResult.Failure -> {
                    PasskeyTrace.diagnostic(
                        "create_core_error",
                        "requestId" to requestId,
                        "rpId" to rpId,
                        "code" to result.error.code,
                        "message" to result.error.message,
                        "dt_ms" to elapsedMs(coreStartedAt),
                    )
                    onFailure(requestId, CreateCredentialUnknownException(result.error.message))
                    return
                }
                is com.chromvoid.app.credentialprovider.BridgeResult.Success -> result.value
            }
        PasskeyTrace.important(
            "create_core.done",
            "requestId" to requestId,
            "credentialId" to created.credentialIdB64Url.safeTraceId(),
            "dt_ms" to elapsedMs(coreStartedAt),
        )

        val resultIntent =
            runCatching {
                PasskeyTrace.important(
                    "create_response_packaged",
                    "requestId" to requestId,
                    "origin" to origin,
                    "responseJsonLen" to created.responseJson.length,
                    "responseJsonSha256" to created.responseJson.toByteArray(Charsets.UTF_8).sha256B64Url(),
                )
                PasskeyTrace.file(
                    "create_registration_response_json",
                    "requestId" to requestId,
                    "responseJsonB64Url" to PasskeyEncoding.base64UrlEncode(created.responseJson.toByteArray(Charsets.UTF_8)),
                )
                val intent = Intent()
                responseWriter.setCreateSuccess(
                    intent,
                    CreatePublicKeyCredentialResponse(
                        created.responseJson,
                    ),
                )
                intent
            }.getOrElse {
                onFailure(requestId, CreateCredentialUnknownException("ChromVoid could not serialize the Android passkey registration response."))
                return
            }

        onSuccess(requestId, resultIntent)
    }

    private fun ByteArray.sha256B64Url(): String {
        return PasskeyEncoding.base64UrlEncode(MessageDigest.getInstance("SHA-256").digest(this))
    }

    private fun elapsedMs(startedAt: Long): Long =
        SystemClock.elapsedRealtime() - startedAt

    private fun String.safeTraceId(): String = TracePrivacy.redactIdentifier(this) ?: "blank"
}
