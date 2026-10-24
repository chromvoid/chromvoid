package com.chromvoid.air.bridge

import com.chromvoid.air.ffi.AirBackupArtifact
import com.chromvoid.air.ffi.AirPhase
import com.chromvoid.air.ffi.AirStorageBackup
import com.chromvoid.air.ffi.BridgeException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext

/**
 * A prepared backup: Core owns the format and the snapshot it was taken from,
 * and this side owns only where the bytes go. Artifacts are read chunk by
 * chunk, so a backup of any size never sits in memory, and an abandoned
 * transfer leaves Rust nothing to hold.
 */
public class StorageBackupTransfer internal constructor(
    private val client: AirRuntimeClient,
    handle: AirStorageBackup,
    public val generation: ULong,
    private val phase: AirPhase,
) {
    @Volatile
    private var handle: AirStorageBackup? = handle

    /** What the backup consists of, in the order it is written. */
    public fun artifacts(): List<AirBackupArtifact> {
        val current = handle ?: throw BridgeException.InvalidBackupState()
        return dropOnFailure { current.artifacts() }
    }

    /** The next chunk of one artifact; empty means the artifact is complete. */
    public suspend fun read(artifact: UInt): ByteArray {
        val current = handle ?: throw BridgeException.InvalidBackupState()
        return dropOnFailure {
            client.step("storage:backup:read", phase, generation) { requestId, _ ->
                current.beginRead(requestId, artifact)
            }
            current.takeChunk()
        }
    }

    /** Drops the backup. Safe to call more than once. */
    public fun cancel() {
        val current = handle ?: return
        handle = null
        runCatching { current.cancel() }
        current.close()
    }

    /**
     * Waits for Rust's worker to finish before another attempt may start;
     * a cancelled backup still holds its slot until it has unwound.
     */
    public suspend fun close() {
        val current = handle ?: return
        handle = null
        try {
            withContext(NonCancellable) { current.cancelAndWait() }
        } finally {
            current.close()
        }
    }

    private inline fun <T> dropOnFailure(action: () -> T): T =
        try {
            action()
        } catch (cancellation: CancellationException) {
            cancel()
            throw cancellation
        } catch (error: Exception) {
            cancel()
            throw error
        }
}
