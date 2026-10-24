package com.chromvoid.air.session

import com.chromvoid.air.bridge.AirSessionRuntime
import com.chromvoid.air.bridge.StorageBackupTransfer
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.maintenance.BackupArtifact
import com.chromvoid.air.ui.maintenance.BackupRun
import com.chromvoid.air.ui.maintenance.BackupStore

/** The backup of whatever session is current, as the screens see it. */
internal class SessionBackupStore(private val runtime: () -> AirSessionRuntime?) : BackupStore {
    override suspend fun prepareBackup(masterPassword: String, generation: ULong): BackupRun {
        val session = runtime() ?: throw BridgeException.SessionRevoked()
        return Run(session.prepareStorageBackup(masterPassword, generation))
    }

    private class Run(private val transfer: StorageBackupTransfer) : BackupRun {
        override fun artifacts(): List<BackupArtifact> =
            transfer.artifacts().map { BackupArtifact(it.name, it.byteCount.toLong()) }

        override suspend fun read(artifact: Int): ByteArray = transfer.read(artifact.toUInt())

        override suspend fun close(): Unit = transfer.close()
    }
}
