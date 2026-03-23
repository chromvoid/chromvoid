package com.chromvoid.app.credentialprovider

import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialNoCreateOptionException
import androidx.credentials.provider.BeginCreateCredentialRequest
import androidx.credentials.provider.BeginCreateCredentialResponse
import androidx.credentials.provider.BeginCreatePublicKeyCredentialRequest
import com.chromvoid.app.PasskeyResultMapper
import com.chromvoid.app.PendingPasskeyRequest
import com.chromvoid.app.passkey.PasskeyPreflightPayloadFactory
import com.chromvoid.app.passkey.PasskeyRequestParser
import com.chromvoid.app.passkey.PasskeyRequestRegistry
import com.chromvoid.app.passkey.PasskeyResponseAssembler
import com.chromvoid.app.security.PasskeyMetadataStore

internal class PasskeyCreateEntryHandler(
    private val bridgeGateway: AndroidBridgeGateway,
    private val passkeyStore: PasskeyMetadataStore,
    private val requestRegistry: PasskeyRequestRegistry,
    private val entryFactory: CredentialProviderEntryFactory,
) {
    fun handle(
        request: BeginCreateCredentialRequest,
        builder: BeginCreateCredentialResponse.Builder,
    ): CreateCredentialException? {
        val passkeyRequest = request as? BeginCreatePublicKeyCredentialRequest ?: return null
        val parsedRequest = PasskeyRequestParser.parseCreateRequestJson(passkeyRequest.requestJson)
            ?: return CreateCredentialNoCreateOptionException("ChromVoid could not parse the passkey create request.")

        if (!PasskeyResponseAssembler.supportsEs256(parsedRequest)) {
            return CreateCredentialNoCreateOptionException("ChromVoid supports only ES256 passkeys on Android v1.")
        }
        if (!PasskeyResponseAssembler.supportsAttestationNone(parsedRequest)) {
            return CreateCredentialNoCreateOptionException("ChromVoid supports attestation=\"none\" only on Android v1.")
        }

        val hasExcludedCredential =
            runCatching { passkeyStore.hasExcludedCredential(parsedRequest.excludeCredentialIds) }.getOrElse {
                return CreateCredentialNoCreateOptionException("ChromVoid could not read local Android passkeys.")
            }
        if (hasExcludedCredential) {
            return CreateCredentialNoCreateOptionException("A local ChromVoid passkey already matches the excluded credential set.")
        }

        val requestId =
            when (
                val preflight =
                    bridgeGateway.passkeyPreflight(
                        command = "create",
                        payload = PasskeyPreflightPayloadFactory.buildCreate(passkeyRequest),
                    )
            ) {
                is BridgeResult.Failure -> {
                    return PasskeyResultMapper.createException(preflight.error)
                }
                is BridgeResult.Success -> preflight.value
            }
        if (requestId.isBlank()) {
            return CreateCredentialNoCreateOptionException("ChromVoid did not receive a passkey request handle.")
        }

        requestRegistry.put(
            PendingPasskeyRequest(
                requestId = requestId,
                command = "create",
                rpId = parsedRequest.rpId,
            ),
        )
        builder.addCreateEntry(entryFactory.buildPasskeyCreateEntry(requestId))
        return null
    }
}
