package com.chromvoid.app.credentialprovider

import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.provider.BeginGetCredentialResponse
import androidx.credentials.provider.BeginGetPublicKeyCredentialOption
import com.chromvoid.app.AndroidPasskeySummary
import com.chromvoid.app.GetPasskeyRequestData
import com.chromvoid.app.PasskeyResultMapper
import com.chromvoid.app.PendingPasskeyRequest
import com.chromvoid.app.passkey.PasskeyPreflightPayloadFactory
import com.chromvoid.app.passkey.PasskeyRequestParser
import com.chromvoid.app.passkey.PasskeyRequestRegistry
import com.chromvoid.app.passkey.PasskeyTrace
import com.chromvoid.app.shared.TracePrivacy

internal class PasskeyQueryHandler(
    private val bridgeGateway: AndroidBridgeGateway,
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

        val queryResult =
            when (
                val query =
                    bridgeGateway.passkeyQuery(PasskeyPreflightPayloadFactory.buildCoreGet(option))
            ) {
                is BridgeResult.Failure -> {
                    return PasskeyQueryOutcome.Error(PasskeyResultMapper.getException(query.error))
                }
                is BridgeResult.Success -> query.value
            }
        if (queryResult.requestId.isBlank()) {
            return PasskeyQueryOutcome.Error(
                GetCredentialUnknownException("ChromVoid did not receive a passkey request handle."),
            )
        }

        if (queryResult.passkeys.isEmpty()) {
            PasskeyTrace.diagnostic(
                "get_no_entries",
                "rpId" to parsedRequest.rpId,
                "allowCredentialIds" to parsedRequest.allowCredentialIds.size,
                "storedCandidates" to 0,
                "reason" to "core_empty",
            )
            return PasskeyQueryOutcome.NoEntries
        }
        val candidatePasskeys = passkeyCandidatesForGetRequest(parsedRequest, queryResult.passkeys)
        if (candidatePasskeys.isEmpty()) {
            PasskeyTrace.diagnostic(
                "get_no_entries",
                "rpId" to parsedRequest.rpId,
                "allowCredentialIds" to parsedRequest.allowCredentialIds.size,
                "storedCandidates" to queryResult.passkeys.size,
                "reason" to "filtered_empty",
            )
            return PasskeyQueryOutcome.NoEntries
        }
        PasskeyTrace.important(
            "get_candidates",
            "rpId" to parsedRequest.rpId,
            "allowCredentialIds" to parsedRequest.allowCredentialIds.size,
            "storedCandidates" to queryResult.passkeys.size,
            "returnedCandidates" to candidatePasskeys.size,
            "returnedCredentialIds" to candidatePasskeys.joinToString(",") { it.credentialIdB64Url.safeTraceId() },
        )

        requestRegistry.put(
            PendingPasskeyRequest(
                requestId = queryResult.requestId,
                command = "get",
                rpId = parsedRequest.rpId,
            ),
        )

        candidatePasskeys.forEach { metadata ->
            builder.addCredentialEntry(entryFactory.buildPasskeyGetEntry(option, queryResult.requestId, metadata))
        }
        return PasskeyQueryOutcome.EntriesAdded(candidatePasskeys.size)
    }
}

internal fun passkeyCandidatesForGetRequest(
    parsedRequest: GetPasskeyRequestData,
    candidates: List<AndroidPasskeySummary>,
): List<AndroidPasskeySummary> {
    if (parsedRequest.allowCredentialIds.isNotEmpty()) {
        return candidates
    }

    return candidates
        .groupBy { metadata ->
            buildString {
                append(metadata.rpId)
                append('\u0000')
                append(metadata.discoverableAccountKey())
            }
        }
        .values
        .mapNotNull { accountCandidates ->
            accountCandidates.maxWithOrNull(
                compareBy<AndroidPasskeySummary> { it.createdAtEpochMs }
                    .thenBy { it.lastUsedEpochMs },
            )
        }
        .sortedWith(
            compareByDescending<AndroidPasskeySummary> { it.createdAtEpochMs }
                .thenByDescending { it.lastUsedEpochMs },
        )
}

private fun AndroidPasskeySummary.discoverableAccountKey(): String {
    return userName.ifBlank { userDisplayName }.ifBlank { credentialIdB64Url }
}

private fun String.safeTraceId(): String = TracePrivacy.redactIdentifier(this) ?: "blank"
