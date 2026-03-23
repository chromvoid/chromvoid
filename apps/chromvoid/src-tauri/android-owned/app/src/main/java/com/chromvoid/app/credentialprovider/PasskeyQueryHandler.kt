package com.chromvoid.app.credentialprovider

import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.provider.BeginGetCredentialResponse
import androidx.credentials.provider.BeginGetPublicKeyCredentialOption
import com.chromvoid.app.PasskeyResultMapper
import com.chromvoid.app.PendingPasskeyRequest
import com.chromvoid.app.passkey.PasskeyPreflightPayloadFactory
import com.chromvoid.app.passkey.PasskeyRequestParser
import com.chromvoid.app.passkey.PasskeyRequestRegistry
import com.chromvoid.app.security.PasskeyMetadataStore

internal class PasskeyQueryHandler(
    private val bridgeGateway: AndroidBridgeGateway,
    private val passkeyStore: PasskeyMetadataStore,
    private val requestRegistry: PasskeyRequestRegistry,
    private val entryFactory: CredentialProviderEntryFactory,
) {
    fun addEntries(
        builder: BeginGetCredentialResponse.Builder,
        option: BeginGetPublicKeyCredentialOption,
    ): PasskeyQueryOutcome {
        val parsedRequest = PasskeyRequestParser.parseGetRequestJson(option.requestJson)
        if (parsedRequest == null) {
            return PasskeyQueryOutcome.Error(
                GetCredentialUnknownException("ChromVoid could not parse the passkey request."),
            )
        }

        val requestId =
            when (
                val preflight =
                    bridgeGateway.passkeyPreflight(
                        command = "get",
                        payload = PasskeyPreflightPayloadFactory.buildGet(option),
                    )
            ) {
                is BridgeResult.Failure -> {
                    return PasskeyQueryOutcome.Error(PasskeyResultMapper.getException(preflight.error))
                }
                is BridgeResult.Success -> preflight.value
            }
        if (requestId.isBlank()) {
            return PasskeyQueryOutcome.Error(
                GetCredentialUnknownException("ChromVoid did not receive a passkey request handle."),
            )
        }

        val candidates =
            runCatching {
                passkeyStore.listForRpId(parsedRequest.rpId, parsedRequest.allowCredentialIds)
            }.getOrElse {
                return PasskeyQueryOutcome.Error(
                    GetCredentialUnknownException("ChromVoid could not read local Android passkeys."),
                )
            }
        if (candidates.isEmpty()) {
            return PasskeyQueryOutcome.NoEntries
        }

        requestRegistry.put(
            PendingPasskeyRequest(
                requestId = requestId,
                command = "get",
                rpId = parsedRequest.rpId,
            ),
        )

        candidates.forEach { metadata ->
            builder.addCredentialEntry(entryFactory.buildPasskeyGetEntry(option, requestId, metadata))
        }
        return PasskeyQueryOutcome.EntriesAdded(candidates.size)
    }
}
