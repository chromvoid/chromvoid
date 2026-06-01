package com.chromvoid.app

import com.chromvoid.app.shared.PendingRequestRecord

data class AndroidPasskeySummary(
    val credentialIdB64Url: String,
    val rpId: String,
    val userName: String,
    val userDisplayName: String,
    val signCount: Long,
    val createdAtEpochMs: Long,
    val lastUsedEpochMs: Long,
)

data class PendingPasskeyRequest(
    override val requestId: String,
    val command: String,
    val rpId: String,
    override val createdAtEpochMs: Long = System.currentTimeMillis(),
) : PendingRequestRecord

data class GetPasskeyRequestData(
    val rpId: String,
    val challengeB64Url: String,
    val allowCredentialIds: Set<String>,
)

data class CreatePasskeyRequestData(
    val rpId: String,
    val rpName: String,
    val userIdB64Url: String,
    val userName: String,
    val userDisplayName: String,
    val challengeB64Url: String,
    val supportedAlgorithms: Set<Int>,
    val excludeCredentialIds: Set<String>,
    val attestationPreference: String,
    val credPropsRequested: Boolean = false,
    val residentKeyRequired: Boolean = false,
)

data class PasskeyCoreRequestPayload(
    val requestJson: String,
    val origin: String,
    val clientDataHashB64Url: String?,
    val selectedCredentialId: String? = null,
)

data class PasskeyCoreQueryResult(
    val requestId: String,
    val passkeys: List<AndroidPasskeySummary>,
)

data class PasskeyCoreOperationResult(
    val credentialIdB64Url: String,
    val responseJson: String,
)
