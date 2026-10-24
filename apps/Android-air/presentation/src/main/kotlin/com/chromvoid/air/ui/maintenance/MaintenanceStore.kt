package com.chromvoid.air.ui.maintenance

import com.chromvoid.air.bridge.wire.MasterRekeyRequest
import com.chromvoid.air.bridge.wire.MasterRekeyResponse
import com.chromvoid.air.bridge.wire.VaultRekeyRequest
import com.chromvoid.air.bridge.wire.VaultRekeyResponse

/**
 * Device administration, apart from the vault's contents: the passwords that
 * open the vault and authorize administration. Its calls are the session's,
 * so a lock revokes them like any other.
 */
public interface MaintenanceStore {
    public suspend fun rekeyVault(request: VaultRekeyRequest, generation: ULong): VaultRekeyResponse

    public suspend fun rekeyMaster(request: MasterRekeyRequest, generation: ULong): MasterRekeyResponse
}
