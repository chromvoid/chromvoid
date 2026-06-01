package com.chromvoid.app.credentialprovider

import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialNoCreateOptionException
import androidx.credentials.provider.BeginCreateCredentialRequest
import androidx.credentials.provider.BeginCreateCredentialResponse
import androidx.credentials.provider.BeginCreatePublicKeyCredentialRequest
import com.chromvoid.app.PendingPasskeyRequest
import com.chromvoid.app.passkey.PasskeyRequestParser
import com.chromvoid.app.passkey.PasskeyRequestRegistry
import com.chromvoid.app.passkey.PasskeyResponseAssembler
import com.chromvoid.app.passkey.PasskeyTrace
import java.util.UUID

internal class PasskeyCreateEntryHandler(
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

        PasskeyTrace.diagnostic(
            "begin_create.parsed",
            "rpId" to parsedRequest.rpId,
            "algorithms" to parsedRequest.supportedAlgorithms.sorted(),
            "excludes" to parsedRequest.excludeCredentialIds.size,
            "credPropsRequested" to parsedRequest.credPropsRequested,
            "residentKeyRequired" to parsedRequest.residentKeyRequired,
        )

        if (!PasskeyResponseAssembler.supportsEs256(parsedRequest)) {
            PasskeyTrace.diagnostic(
                "begin_create.rejected",
                "rpId" to parsedRequest.rpId,
                "reason" to "unsupported_algorithm",
                "algorithms" to parsedRequest.supportedAlgorithms.sorted(),
            )
            return CreateCredentialNoCreateOptionException("ChromVoid supports only ES256 passkeys on Android v1.")
        }
        if (!PasskeyResponseAssembler.supportsAttestationNone(parsedRequest)) {
            PasskeyTrace.diagnostic(
                "begin_create.rejected",
                "rpId" to parsedRequest.rpId,
                "reason" to "unsupported_attestation",
                "attestation" to parsedRequest.attestationPreference,
            )
            return CreateCredentialNoCreateOptionException("ChromVoid supports attestation=\"none\" only on Android v1.")
        }

        val requestId = UUID.randomUUID().toString()

        PasskeyTrace.diagnostic(
            "begin_create.request_tracked",
            "requestId" to requestId,
            "rpId" to parsedRequest.rpId,
        )
        requestRegistry.put(
            PendingPasskeyRequest(
                requestId = requestId,
                command = "create",
                rpId = parsedRequest.rpId,
            ),
        )
        builder.addCreateEntry(entryFactory.buildPasskeyCreateEntry(requestId))
        PasskeyTrace.diagnostic(
            "begin_create.entry_added",
            "requestId" to requestId,
            "rpId" to parsedRequest.rpId,
        )
        return null
    }
}
