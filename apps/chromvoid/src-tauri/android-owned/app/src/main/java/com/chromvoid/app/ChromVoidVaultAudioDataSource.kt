package com.chromvoid.app

import android.net.Uri
import android.os.SystemClock
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.TransferListener
import com.chromvoid.app.nativebridge.AudioPlaybackNativeShell
import com.chromvoid.app.nativebridge.AudioSourceReadResult
import java.io.IOException

@OptIn(UnstableApi::class)
internal class ChromVoidVaultAudioDataSource(
    private val source: AudioPlaybackCommand.AudioTrack,
    private val reader: AudioSourceReader = NativeAudioSourceReader,
) : DataSource {
    private var uri: Uri? = null
    private var position: Long = 0L
    private var remaining: Long = 0L
    private var opened = false
    private var readCount = 0
    private var readBuffer = ByteArray(0)
    private var readBufferOffset = 0

    override fun addTransferListener(transferListener: TransferListener) = Unit

    override fun open(dataSpec: DataSpec): Long {
        if (dataSpec.position < 0L || dataSpec.length < C.LENGTH_UNSET.toLong()) {
            throw AudioSourceIOException(ERR_RANGE_INVALID)
        }
        if (dataSpec.position > source.size) {
            throw AudioSourceIOException(ERR_RANGE_INVALID)
        }
        if (
            dataSpec.length != C.LENGTH_UNSET.toLong() &&
            dataSpec.position + dataSpec.length < dataSpec.position
        ) {
            throw AudioSourceIOException(ERR_RANGE_INVALID)
        }
        if (
            dataSpec.length != C.LENGTH_UNSET.toLong() &&
            dataSpec.length > source.size - dataSpec.position
        ) {
            throw AudioSourceIOException(ERR_RANGE_INVALID)
        }

        uri = dataSpec.uri
        position = dataSpec.position
        remaining =
            if (dataSpec.length == C.LENGTH_UNSET.toLong()) {
                source.size - position
            } else {
                dataSpec.length
            }.coerceAtLeast(0L)
        opened = true
        readCount = 0
        clearReadBuffer()
        trace(
            "open",
            "trackId" to source.trackId,
            "sourceRevision" to source.sourceRevision,
            "position" to position,
            "dataSpecLength" to dataSpec.length,
            "remaining" to remaining,
            "mimeType" to source.mimeType,
        )
        return remaining
    }

    override fun read(
        buffer: ByteArray,
        offset: Int,
        length: Int,
    ): Int {
        if (!opened) return C.RESULT_END_OF_INPUT
        if (length == 0) return 0
        if (remaining <= 0L) return C.RESULT_END_OF_INPUT

        val currentRead = ++readCount
        if (readBufferOffset >= readBuffer.size) {
            fillReadBuffer(currentRead, length)
        }

        val bytesToCopy = minOf(length, readBuffer.size - readBufferOffset)
        readBuffer.copyInto(buffer, offset, readBufferOffset, readBufferOffset + bytesToCopy)
        readBufferOffset += bytesToCopy
        position += bytesToCopy
        remaining -= bytesToCopy
        traceSampled(
            currentRead,
            "read_success",
            "trackId" to source.trackId,
            "sourceRevision" to source.sourceRevision,
            "bytes" to bytesToCopy,
            "nextPosition" to position,
            "remaining" to remaining,
            "bufferedBytes" to (readBuffer.size - readBufferOffset),
        )

        if (readBufferOffset >= readBuffer.size) {
            clearReadBuffer()
        }
        return bytesToCopy
    }

    private fun fillReadBuffer(
        currentRead: Int,
        requestedLength: Int,
    ) {
        val fetchLength =
            minOf(
                maxOf(requestedLength, MIN_READ_BUFFER_BYTES).toLong(),
                remaining,
                MAX_READ_BYTES.toLong(),
            ).toInt()
        val startedAt = SystemClock.elapsedRealtime()
        traceSampled(
            currentRead,
            "native_read_start",
            "trackId" to source.trackId,
            "sourceRevision" to source.sourceRevision,
            "offset" to position,
            "length" to fetchLength,
            "remaining" to remaining,
        )
        val result = reader.read(source.sourceToken, position, fetchLength)
        result.errorCode?.takeIf { it.isNotBlank() }?.let {
            trace(
                "read_error",
                "trackId" to source.trackId,
                "sourceRevision" to source.sourceRevision,
                "offset" to position,
                "length" to fetchLength,
                "errorCode" to it,
                "elapsedMs" to (SystemClock.elapsedRealtime() - startedAt),
            )
            throw AudioSourceIOException(it)
        }

        val bytes = result.bytes ?: throw AudioSourceIOException(ERR_SOURCE_READ)
        if (bytes.isEmpty()) {
            trace(
                "read_error",
                "trackId" to source.trackId,
                "sourceRevision" to source.sourceRevision,
                "offset" to position,
                "length" to fetchLength,
                "errorCode" to ERR_SOURCE_READ,
                "empty" to true,
                "elapsedMs" to (SystemClock.elapsedRealtime() - startedAt),
            )
            throw AudioSourceIOException(ERR_SOURCE_READ)
        }
        if (bytes.size > fetchLength) {
            trace(
                "read_error",
                "trackId" to source.trackId,
                "sourceRevision" to source.sourceRevision,
                "offset" to position,
                "length" to fetchLength,
                "bytes" to bytes.size,
                "errorCode" to ERR_SOURCE_READ,
                "elapsedMs" to (SystemClock.elapsedRealtime() - startedAt),
            )
            throw AudioSourceIOException(ERR_SOURCE_READ)
        }

        val nextPosition = position + bytes.size
        if (bytes.size < fetchLength && nextPosition < source.size) {
            trace(
                "read_error",
                "trackId" to source.trackId,
                "sourceRevision" to source.sourceRevision,
                "offset" to position,
                "length" to fetchLength,
                "bytes" to bytes.size,
                "nextPosition" to nextPosition,
                "sourceSize" to source.size,
                "errorCode" to ERR_SOURCE_READ,
                "elapsedMs" to (SystemClock.elapsedRealtime() - startedAt),
            )
            throw AudioSourceIOException(ERR_SOURCE_READ)
        }

        readBuffer = bytes
        readBufferOffset = 0
        traceSampled(
            currentRead,
            "native_read_success",
            "trackId" to source.trackId,
            "sourceRevision" to source.sourceRevision,
            "bytes" to bytes.size,
            "offset" to position,
            "elapsedMs" to (SystemClock.elapsedRealtime() - startedAt),
        )
    }

    override fun getUri(): Uri? = uri

    override fun getResponseHeaders(): Map<String, List<String>> = emptyMap()

    override fun close() {
        trace(
            "close",
            "trackId" to source.trackId,
            "position" to position,
            "remaining" to remaining,
            "reads" to readCount,
        )
        opened = false
        uri = null
        remaining = 0L
        clearReadBuffer()
    }

    private fun clearReadBuffer() {
        readBuffer = ByteArray(0)
        readBufferOffset = 0
    }

    internal fun interface AudioSourceReader {
        fun read(
            token: String,
            offset: Long,
            length: Int,
        ): AudioSourceReadResult
    }

    internal class AudioSourceIOException(
        val code: String,
    ) : IOException(code)

    private object NativeAudioSourceReader : AudioSourceReader {
        override fun read(
            token: String,
            offset: Long,
            length: Int,
        ): AudioSourceReadResult = AudioPlaybackNativeShell.readAudioSource(token, offset, length)
    }

    companion object {
        private const val TAG = "ChromVoid/AudioDataSource"
        const val ERR_RANGE_INVALID = "ERR_NATIVE_AUDIO_RANGE_INVALID"
        const val ERR_SOURCE_READ = "ERR_NATIVE_AUDIO_SOURCE_READ"
        const val ERR_SOURCE_STALE = "ERR_NATIVE_AUDIO_SOURCE_STALE"
        const val ERR_VAULT_LOCKED = "ERR_NATIVE_AUDIO_VAULT_LOCKED"
        const val MIN_READ_BUFFER_BYTES = 64 * 1024
        const val MAX_READ_BYTES = 2 * 1024 * 1024

        private fun traceSampled(
            readCount: Int,
            event: String,
            vararg fields: Pair<String, Any?>,
        ) {
            if (readCount <= 8 || readCount % 32 == 0) {
                trace(event, "read" to readCount, *fields)
            }
        }

        private fun trace(event: String, vararg fields: Pair<String, Any?>) {
            if (!BuildConfig.DEBUG) return

            val suffix =
                fields.joinToString(" ") { (key, value) ->
                    "$key=${value?.toString()?.replace('\n', ' ') ?: "null"}"
                }
            Log.d(TAG, "elapsedMs=${SystemClock.elapsedRealtime()} event=$event $suffix")
        }
    }
}
