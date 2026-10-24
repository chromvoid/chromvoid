package com.chromvoid.air.bridge

import com.chromvoid.air.bridge.wire.SourceMetadataResponse
import com.chromvoid.air.ffi.AirFileReader
import com.chromvoid.air.ffi.AirPhase
import com.chromvoid.air.ffi.BridgeException
import kotlinx.coroutines.CancellationException

/** One bounded plaintext chunk and the source it came from. The caller clears [bytes] after use. */
public class FileChunk(public val metadata: SourceMetadataResponse, public val bytes: ByteArray)

/**
 * Positioned reads of one catalog file, pinned to the revision Core had when
 * the reader opened: a file changed meanwhile fails the read rather than
 * mixing two versions. Nothing is cached here; each read is one chunk.
 */
public class FileReadTransfer internal constructor(
    private val client: AirRuntimeClient,
    handle: AirFileReader,
    public val generation: ULong,
    /** The most one read returns. */
    public val maximumChunkBytes: Long,
) {
    @Volatile
    private var handle: AirFileReader? = handle

    public suspend fun read(offset: Long, length: Long): FileChunk {
        val current = handle ?: throw BridgeException.InvalidFileReadState()
        return try {
            val payload = client.execute(AirPhase.UNLOCKED, generation) { requestId, _ ->
                current.beginRead(requestId, offset.toULong(), length.toULong())
            }
            val metadata = WireEnvelope.decode(READ, payload, SourceMetadataResponse.serializer())
            // take_chunk checks Rust's authority again; nothing suspends between the two.
            FileChunk(metadata, current.takeChunk())
        } catch (cancellation: CancellationException) {
            cancel()
            throw cancellation
        } catch (error: Exception) {
            cancel()
            throw error
        }
    }

    /** Releases the reader. Safe to call more than once. */
    public fun cancel() {
        val current = handle ?: return
        handle = null
        runCatching { current.cancel() }
        current.close()
    }

    private companion object {
        const val READ = "catalog:file:read"
    }
}
