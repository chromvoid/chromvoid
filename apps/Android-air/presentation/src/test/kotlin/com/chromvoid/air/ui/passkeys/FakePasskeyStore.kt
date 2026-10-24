package com.chromvoid.air.ui.passkeys

import com.chromvoid.air.bridge.wire.VaultPasskeyDeleteRequest
import com.chromvoid.air.bridge.wire.VaultPasskeyDeleteResponse
import com.chromvoid.air.bridge.wire.VaultPasskeySummary
import com.chromvoid.air.bridge.wire.VaultPasskeysListResponse

/** Passkeys as Core answers for them: a deletion reports whether the passkey was still there. */
internal class FakePasskeyStore : PasskeyStore {
    val passkeys = mutableListOf<VaultPasskeySummary>()
    val calls = mutableListOf<String>()

    /** Thrown by the next call, once. */
    var failNext: Throwable? = null

    /** The passkey vanishes before the deletion reaches Core. */
    var goneBeforeDelete = false

    fun passkey(
        id: String,
        site: String,
        account: String,
        display: String = "",
        created: Long = 1_700_000_000_000,
        used: Long = 0,
        portable: Boolean = true,
    ): VaultPasskeySummary = VaultPasskeySummary(
        createdAtEpochMS = created,
        credentialIDB64URL = id,
        lastUsedEpochMS = used,
        portable = portable,
        rpID = site,
        rpName = site.substringBefore('.').replaceFirstChar { it.uppercase() },
        signCount = 0,
        storageKind = "vault",
        userDisplayName = display,
        userName = account,
    ).also { passkeys += it }

    private fun consume(call: String) {
        calls += call
        failNext?.let {
            failNext = null
            throw it
        }
    }

    override suspend fun listPasskeys(generation: ULong): VaultPasskeysListResponse {
        consume("list")
        return VaultPasskeysListResponse(passkeys.toList())
    }

    override suspend fun deletePasskey(
        request: VaultPasskeyDeleteRequest,
        generation: ULong,
    ): VaultPasskeyDeleteResponse {
        consume("delete:${request.credentialIDB64URL}")
        if (goneBeforeDelete) passkeys.clear()
        return VaultPasskeyDeleteResponse(passkeys.removeAll { it.credentialIDB64URL == request.credentialIDB64URL })
    }
}
