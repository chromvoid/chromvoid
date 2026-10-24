package com.chromvoid.air.ui.passkeys

import com.chromvoid.air.bridge.wire.VaultPasskeyDeleteRequest
import com.chromvoid.air.bridge.wire.VaultPasskeyDeleteResponse
import com.chromvoid.air.bridge.wire.VaultPasskeysListResponse

/**
 * The vault's passkeys as metadata: website, account and dates, never the
 * private key. Core alone authorizes and commits a deletion.
 */
public interface PasskeyStore {
    public suspend fun listPasskeys(generation: ULong): VaultPasskeysListResponse

    public suspend fun deletePasskey(request: VaultPasskeyDeleteRequest, generation: ULong): VaultPasskeyDeleteResponse
}
