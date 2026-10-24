package com.chromvoid.air.ui.media

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.PlaybackException
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.BaseDataSource
import androidx.media3.datasource.DataSourceException
import androidx.media3.datasource.DataSpec
import com.chromvoid.air.bridge.wire.SourceMetadataResponse
import com.chromvoid.air.ui.files.FileReader
import com.chromvoid.air.ui.files.FileStore
import java.io.IOException
import kotlinx.coroutines.runBlocking

/**
 * The player's bytes, read from the vault. Each open - each seek - gets its own
 * reader pinned to the revision the preview opened, as iOS gives each seek its
 * own; a chunk from another revision fails the read rather than splice two
 * files. Nothing is cached: a chunk is cleared once the player has copied it.
 */
@UnstableApi
public class VaultDataSource(
    private val store: FileStore,
    private val nodeId: Long,
    private val generation: ULong,
    private val source: SourceMetadataResponse,
) : BaseDataSource(false) {
    private var uri: Uri? = null
    private var reader: FileReader? = null
    private var position = 0L
    private var remaining = 0L
    private var chunk: ByteArray? = null
    private var chunkOffset = 0
    private var opened = false

    override fun open(dataSpec: DataSpec): Long {
        uri = dataSpec.uri
        transferInitializing(dataSpec)
        if (dataSpec.position > source.size) {
            throw DataSourceException(PlaybackException.ERROR_CODE_IO_READ_POSITION_OUT_OF_RANGE)
        }
        position = dataSpec.position
        val available = source.size - position
        remaining = if (dataSpec.length == C.LENGTH_UNSET.toLong()) available else minOf(dataSpec.length, available)
        reader = try {
            store.openReader(nodeId, generation)
        } catch (error: Exception) {
            throw IOException("The file could not be opened", error)
        }
        opened = true
        transferStarted(dataSpec)
        return remaining
    }

    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        if (length == 0) return 0
        if (remaining == 0L) return C.RESULT_END_OF_INPUT
        val current = chunk?.takeIf { chunkOffset < it.size } ?: next()
        val count = minOf(length.toLong(), (current.size - chunkOffset).toLong(), remaining).toInt()
        current.copyInto(buffer, offset, chunkOffset, chunkOffset + count)
        chunkOffset += count
        position += count
        remaining -= count
        if (chunkOffset == current.size) release()
        bytesTransferred(count)
        return count
    }

    override fun getUri(): Uri? = uri

    override fun close() {
        release()
        reader?.cancel()
        reader = null
        uri = null
        if (opened) {
            opened = false
            transferEnded()
        }
    }

    private fun next(): ByteArray {
        val open = reader ?: throw IOException("The source is closed")
        val content = try {
            runBlocking { open.read(position, minOf(open.maximumChunkBytes, remaining)) }
        } catch (error: Exception) {
            throw IOException("The file could not be read", error)
        }
        val metadata = content.metadata
        if (metadata.nodeID != source.nodeID ||
            metadata.sourceRevision != source.sourceRevision ||
            metadata.size != source.size
        ) {
            content.bytes.fill(0)
            throw IOException("The file changed while it played")
        }
        if (content.bytes.isEmpty()) throw IOException("The file ended early")
        chunk = content.bytes
        chunkOffset = 0
        return content.bytes
    }

    private fun release() {
        chunk?.fill(0)
        chunk = null
        chunkOffset = 0
    }
}
