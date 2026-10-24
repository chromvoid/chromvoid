package com.chromvoid.air.bridge

import com.chromvoid.air.ffi.AirRestoreArtifact
import com.chromvoid.air.ffi.AirRestorePreview
import com.chromvoid.air.ffi.AirStorageRestore
import com.chromvoid.air.ffi.BridgeException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext

/**
 * Restoring a backup into empty storage. Core authenticates the source,
 * checks it and owns the one transaction that replaces the storage; this side
 * only hands it the backup's files, chunk by chunk, and asks for the review
 * and then the commit. Every step runs in whichever phase administration is
 * admitted in, under the generation the restore began with.
 */
public class StorageRestoreTransfer internal constructor(
    private val client: AirRuntimeClient,
    handle: AirStorageRestore,
    public val generation: ULong,
) {
    @Volatile
    private var handle: AirStorageRestore? = handle

    /** One chunk of one of the backup's files; an empty chunk says a present file is complete. */
    public suspend fun append(artifact: AirRestoreArtifact, bytes: ByteArray) {
        val current = handle ?: throw BridgeException.InvalidRestoreState()
        client.step("restore:local:uploadPack", client.administrationPhase(), generation) { requestId, _ ->
            current.beginAppend(requestId, artifact, bytes)
        }
    }

    /** Core's check of everything appended, opened with the backup's administrative password. */
    public suspend fun review(masterPassword: String): AirRestorePreview {
        val current = handle ?: throw BridgeException.InvalidRestoreState()
        client.step("restore:local:validatePayload", client.administrationPhase(), generation) { requestId, _ ->
            current.beginReview(requestId, masterPassword)
        }
        return current.preview()
    }

    /** Replaces the empty storage with exactly what was reviewed. */
    public suspend fun commit() {
        val current = handle ?: throw BridgeException.InvalidRestoreState()
        client.step("restore:local:commit", client.administrationPhase(), generation) { requestId, _ ->
            current.beginCommit(requestId)
        }
    }

    /** Stops the restore at once; [close] waits for Rust to let go of it. */
    public fun cancel() {
        runCatching { handle?.cancel() }
    }

    /**
     * Waits for Rust's worker to unwind before another restore may begin: a
     * cancelled restore holds its slot until then. Safe to call more than once.
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
}
