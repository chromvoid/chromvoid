package com.chromvoid.air.session

import com.chromvoid.air.bridge.AirSessionRuntime
import com.chromvoid.air.bridge.perform
import com.chromvoid.air.bridge.wire.VaultPasskeyDeleteRequest
import com.chromvoid.air.bridge.wire.VaultPasskeyDeleteResponse
import com.chromvoid.air.bridge.wire.VaultPasskeysListResponse
import com.chromvoid.air.ffi.AirPhase
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.passkeys.PasskeyStore
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject

/** The vault's passkeys over the session's runtime, with the requests iOS sends. */
internal class SessionPasskeyStore(private val runtime: () -> AirSessionRuntime?) : PasskeyStore {
    override suspend fun listPasskeys(generation: ULong): VaultPasskeysListResponse =
        current().perform<JsonObject, VaultPasskeysListResponse>(
            "passkeys:list",
            buildJsonObject {},
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun deletePasskey(
        request: VaultPasskeyDeleteRequest,
        generation: ULong,
    ): VaultPasskeyDeleteResponse =
        current().perform<VaultPasskeyDeleteRequest, VaultPasskeyDeleteResponse>(
            "passkeys:delete",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    private fun current(): AirSessionRuntime = runtime() ?: throw BridgeException.SessionRevoked()
}
