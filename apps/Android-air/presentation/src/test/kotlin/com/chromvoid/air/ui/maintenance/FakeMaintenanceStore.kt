package com.chromvoid.air.ui.maintenance

import com.chromvoid.air.bridge.wire.MasterRekeyRequest
import com.chromvoid.air.bridge.wire.MasterRekeyResponse
import com.chromvoid.air.bridge.wire.VaultRekeyRequest
import com.chromvoid.air.bridge.wire.VaultRekeyResponse

/** Records what was asked of Core, and refuses with whatever a test sets. */
internal class FakeMaintenanceStore : MaintenanceStore {
    var failWith: Exception? = null
    var backupRecommended: Boolean = false
    val vaultRekeys: MutableList<VaultRekeyRequest> = mutableListOf()
    val masterRekeys: MutableList<MasterRekeyRequest> = mutableListOf()

    override suspend fun rekeyVault(request: VaultRekeyRequest, generation: ULong): VaultRekeyResponse {
        vaultRekeys += request
        failWith?.let { throw it }
        return VaultRekeyResponse(
            backupRecommended = backupRecommended,
            deletedDerivativeChunks = 0,
            deletedOldChunks = 0,
            durationMS = 0,
            migratedChunks = 0,
            preservedUnknownChunks = 0,
        )
    }

    override suspend fun rekeyMaster(request: MasterRekeyRequest, generation: ULong): MasterRekeyResponse {
        masterRekeys += request
        failWith?.let { throw it }
        return MasterRekeyResponse(backupRecommended = backupRecommended, rewrappedArtifacts = emptyList())
    }
}
