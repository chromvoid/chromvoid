package com.chromvoid.air.bridge

import com.chromvoid.air.bridge.wire.UploadResponse
import com.chromvoid.air.ffi.AirFileWriter
import com.chromvoid.air.ffi.AirPhase
import com.chromvoid.air.ffi.BridgeException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext

/**
 * One new catalog file being written: an exclusive, create-only Rust writer.
 * Chunks are appended in order and only a confirmed [finish] makes the file
 * exist; anything else - a failure, a cancellation, a lock - drops what was
 * staged. [close] waits for Rust to release the writer, which another write
 * needs before it may start.
 */
public class FileWriteTransfer internal constructor(
    private val client: AirRuntimeClient,
    handle: AirFileWriter,
    public val generation: ULong,
) {
    @Volatile
    private var handle: AirFileWriter? = handle

    /** Appends one chunk; the reply counts the bytes staged so far. */
    public suspend fun append(chunk: ByteArray): UploadResponse {
        val current = handle ?: throw BridgeException.InvalidFileWriteState()
        return dropOnFailure {
            val payload = client.execute(AirPhase.UNLOCKED, generation) { requestId, _ ->
                current.beginAppend(requestId, chunk)
            }
            WireEnvelope.decode(APPEND, payload, UploadResponse.serializer())
        }
    }

    /**
     * Commits the file. A cancellation while this runs leaves the outcome
     * unknown: Core may already have committed, so the caller reads the folder.
     */
    public suspend fun finish(): UploadResponse {
        val current = handle ?: throw BridgeException.InvalidFileWriteState()
        return dropOnFailure {
            val payload = client.execute(AirPhase.UNLOCKED, generation) { requestId, _ ->
                current.beginFinish(requestId)
            }
            val saved = WireEnvelope.decode(FINISH, payload, UploadResponse.serializer())
            handle = null
            current.close()
            saved
        }
    }

    /** Stops the write at once. Safe to call more than once. */
    public fun cancel() {
        val current = handle ?: return
        runCatching { current.cancel() }
    }

    /** Drops what was staged and waits until Rust has released the writer. */
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

    private companion object {
        const val APPEND = "catalog:file:append"
        const val FINISH = "catalog:file:finish"
    }
}
