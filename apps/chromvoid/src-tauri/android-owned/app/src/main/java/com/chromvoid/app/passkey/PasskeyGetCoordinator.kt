package com.chromvoid.app.passkey

import android.content.Intent
import android.os.SystemClock
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
import com.chromvoid.app.PasskeyActivityRequestResolverRuntime
import com.chromvoid.app.PasskeyActivityResponseWriterRuntime
import com.chromvoid.app.PasskeyCoreRequestPayload
import com.chromvoid.app.credentialprovider.AndroidBridgeGateway
import com.chromvoid.app.shared.TracePrivacy
import java.security.MessageDigest

internal class PasskeyGetCoordinator(
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

        if (pendingRequest.rpId != resolved.requestData.rpId) {
            onFailure(requestId, NoCredentialException("The selected ChromVoid passkey is no longer available."))
            return
        }

        PasskeyTrace.important(
            "get_request_resolved",
            "requestId" to requestId,
            "rpId" to resolved.requestData.rpId,
            "origin" to resolved.origin,
            "credentialId" to credentialId,
            "clientDataMode" to if (resolved.clientDataHash != null) "provided-hash" else "assembled-json",
            "challengeLen" to resolved.requestData.challengeB64Url.length,
            "providedClientDataHashLen" to (resolved.clientDataHash?.size ?: 0),
        )

        biometric.authenticateAssertion(
            activity = activity,
            onSuccess = {
                handleGetSuccess(
                    requestId = requestId,
                    credentialId = credentialId,
                    requestJson = resolved.requestJson,
                    origin = resolved.origin,
                    clientDataHash = resolved.clientDataHash,
                    onSuccess = onSuccess,
                    onFailure = onFailure,
                )
            },
            onError = { exception -> onFailure(requestId, exception) },
        )
    }

    private fun handleGetSuccess(
        requestId: String,
        credentialId: String,
        requestJson: String,
        origin: String,
        clientDataHash: ByteArray?,
        onSuccess: (requestId: String, resultIntent: Intent) -> Unit,
        onFailure: (requestId: String, exception: GetCredentialException) -> Unit,
    ) {
        val coreStartedAt = SystemClock.elapsedRealtime()
        val assertion =
            when (
                val result =
                    bridgeGateway.passkeyGet(
                        PasskeyCoreRequestPayload(
                            requestJson = requestJson,
                            origin = origin,
                            clientDataHashB64Url = clientDataHash?.let(PasskeyEncoding::base64UrlEncode),
                            selectedCredentialId = credentialId,
                        ),
                    )
            ) {
                is com.chromvoid.app.credentialprovider.BridgeResult.Failure -> {
                    onFailure(requestId, GetCredentialUnknownException(result.error.message))
                    return
                }
                is com.chromvoid.app.credentialprovider.BridgeResult.Success -> result.value
            }
        PasskeyTrace.important(
            "get_core.done",
            "requestId" to requestId,
            "credentialId" to assertion.credentialIdB64Url.safeTraceId(),
            "dt_ms" to elapsedMs(coreStartedAt),
        )

        val resultIntent =
            runCatching {
                PasskeyTrace.important(
                    "get_response_packaged",
                    "requestId" to requestId,
                    "credentialId" to assertion.credentialIdB64Url.safeTraceId(),
                    "responseJsonLen" to assertion.responseJson.length,
                    "responseJsonSha256" to assertion.responseJson.toByteArray(Charsets.UTF_8).sha256B64Url(),
                )
                PasskeyTrace.file(
                    "get_assertion_response_json",
                    "requestId" to requestId,
                    "responseJsonB64Url" to PasskeyEncoding.base64UrlEncode(assertion.responseJson.toByteArray(Charsets.UTF_8)),
                )
                val intent = Intent()
                responseWriter.setGetSuccess(
                    intent,
                    GetCredentialResponse(
                        PublicKeyCredential(
                            assertion.responseJson,
                        ),
                    ),
                )
                intent
            }.getOrElse {
                onFailure(requestId, GetCredentialUnknownException("ChromVoid could not serialize the Android passkey assertion."))
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
