package com.chromvoid.air.session

import com.chromvoid.air.bridge.AirSessionRuntime
import com.chromvoid.air.bridge.StorageRestoreTransfer
import com.chromvoid.air.ffi.AirRestoreLimits
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.maintenance.RestoreArtifact
import com.chromvoid.air.ui.maintenance.RestorePreview
import com.chromvoid.air.ui.maintenance.RestoreRun
import com.chromvoid.air.ui.maintenance.RestoreStore

/** Restoring into whatever session is current, as the screens see it. */
internal class SessionRestoreStore(private val runtime: () -> AirSessionRuntime?) : RestoreStore {
    override suspend fun beginRestore(generation: ULong): RestoreRun {
        val session = runtime() ?: throw BridgeException.SessionRevoked()
        val limits = session.storageRestoreLimits()
        return Run(session.beginStorageRestore(generation), limits)
    }

    private class Run(private val transfer: StorageRestoreTransfer, private val limits: AirRestoreLimits) : RestoreRun {
        override val artifacts: List<RestoreArtifact> =
            limits.artifacts.map { RestoreArtifact(it.name, it.maximumBytes.toLong(), it.required) }

        override val chunkBytes: Int = limits.chunkBytes.coerceAtMost(Int.MAX_VALUE.toULong()).toInt()

        override suspend fun append(artifact: Int, bytes: ByteArray): Unit =
            transfer.append(limits.artifacts[artifact].artifact, bytes)

        override suspend fun review(masterPassword: String): RestorePreview =
            RestorePreview(transfer.review(masterPassword).byteCount.toLong())

        override suspend fun commit(): Unit = transfer.commit()

        override fun cancel(): Unit = transfer.cancel()

        override suspend fun close(): Unit = transfer.close()
    }
}
