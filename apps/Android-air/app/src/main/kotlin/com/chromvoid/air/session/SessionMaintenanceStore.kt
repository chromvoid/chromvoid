package com.chromvoid.air.session

import com.chromvoid.air.bridge.AirSessionRuntime
import com.chromvoid.air.bridge.administrationPhase
import com.chromvoid.air.bridge.perform
import com.chromvoid.air.bridge.wire.MasterRekeyRequest
import com.chromvoid.air.bridge.wire.MasterRekeyResponse
import com.chromvoid.air.bridge.wire.VaultRekeyRequest
import com.chromvoid.air.bridge.wire.VaultRekeyResponse
import com.chromvoid.air.ffi.AirPhase
import com.chromvoid.air.ui.maintenance.MaintenanceStore

/**
 * Device administration over the current session's runtime, always under the
 * generation it was opened for, so a lock revokes a change in flight rather
 * than applying it to the next session. The vault password needs the vault
 * open; the administrative password runs locked as well.
 */
internal class SessionMaintenanceStore(private val runtime: () -> AirSessionRuntime?) : MaintenanceStore {
    override suspend fun rekeyVault(request: VaultRekeyRequest, generation: ULong): VaultRekeyResponse =
        current().perform<VaultRekeyRequest, VaultRekeyResponse>(
            "vault:rekey",
            request,
            AirPhase.UNLOCKED,
            generation,
        )

    override suspend fun rekeyMaster(request: MasterRekeyRequest, generation: ULong): MasterRekeyResponse =
        current().perform<MasterRekeyRequest, MasterRekeyResponse>(
            "master:rekey",
            request,
            current().administrationPhase(),
            generation,
        )

    private fun current(): AirSessionRuntime = runtime() ?: throw com.chromvoid.air.ffi.BridgeException.SessionRevoked()
}
