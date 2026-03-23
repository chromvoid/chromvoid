package com.chromvoid.app

import com.chromvoid.app.shared.PendingRequestRecord

data class PasskeyMetadata(
    val credentialIdB64Url: String,
    val rpId: String,
    val userIdB64Url: String,
    val userName: String,
    val userDisplayName: String,
    val keyAlias: String,
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
)

data class CreatedPasskeyMaterial(
    val metadata: PasskeyMetadata,
    val credentialId: ByteArray,
    val cosePublicKey: ByteArray,
)
