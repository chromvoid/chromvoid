package com.chromvoid.air.bridge

import com.chromvoid.air.bridge.wire.PassmanagerRootImportPreview
import com.chromvoid.air.ffi.AirImport
import com.chromvoid.air.ffi.AirPhase
import com.chromvoid.air.ffi.BridgeException
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.JsonElement

/**
 * A credential import in progress: a revocable handle to a Rust-owned buffer.
 *
 * Kotlin never holds a model of the imported document. Bytes are appended,
 * Core reviews them and answers with counts and warnings, and only an explicit
 * commit applies exactly what was reviewed. Any failure, and any cancellation,
 * drops the buffer, so an abandoned import leaves nothing behind.
 */
public class CredentialImportTransfer internal constructor(
    private val client: AirRuntimeClient,
    handle: AirImport,
    public val generation: ULong,
) {
    @Volatile
    private var handle: AirImport? = handle

    /** Appends one chunk; returns the bytes Rust now holds. */
    public fun append(chunk: ByteArray): ULong {
        val current = handle ?: throw BridgeException.InvalidImportState()
        return dropOnFailure { current.append(chunk) }
    }

    /** Core's review of what was appended. [sourcePassword] opens an encrypted source. */
    public suspend fun review(sourcePassword: String? = null): PassmanagerRootImportPreview {
        val current = handle ?: throw BridgeException.InvalidImportState()
        return dropOnFailure {
            val payload = client.execute(AirPhase.UNLOCKED, generation) { requestId, _ ->
                current.beginReview(requestId, sourcePassword)
            }
            WireEnvelope.decode(REVIEW, payload, PassmanagerRootImportPreview.serializer())
        }
    }

    /** Applies exactly the reviewed input. The transfer is spent afterwards, whatever the outcome. */
    public suspend fun commit() {
        val current = handle ?: throw BridgeException.InvalidImportState()
        try {
            val payload = client.execute(AirPhase.UNLOCKED, generation) { requestId, _ ->
                current.beginCommit(requestId)
            }
            WireEnvelope.decode(COMMIT, payload, JsonElement.serializer())
        } finally {
            cancel()
        }
    }

    /**
     * Drops the buffer and frees the handle: Rust keeps the import slot busy
     * for as long as the handle is alive. Safe to call more than once.
     */
    public fun cancel() {
        val current = handle ?: return
        handle = null
        runCatching { current.cancel() }
        current.close()
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
        const val REVIEW = "passmanager:root:import:review"
        const val COMMIT = "passmanager:root:import:commit"
    }
}
