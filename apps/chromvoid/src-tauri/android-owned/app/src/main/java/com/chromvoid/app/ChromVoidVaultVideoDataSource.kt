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
import com.chromvoid.app.nativebridge.VideoPlaybackNativeShell
import com.chromvoid.app.shared.TracePrivacy
import java.io.IOException

@OptIn(UnstableApi::class)
internal class ChromVoidVaultVideoDataSource(
    private val source: VideoSource,
    private val reader: VideoSourceReader = NativeVideoSourceReader,
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
            throw VideoSourceIOException(ERR_RANGE_INVALID)
        }
        if (dataSpec.position > source.size) {
            throw VideoSourceIOException(ERR_RANGE_INVALID)
        }
        if (
            dataSpec.length != C.LENGTH_UNSET.toLong() &&
            dataSpec.position + dataSpec.length < dataSpec.position
        ) {
            throw VideoSourceIOException(ERR_RANGE_INVALID)
        }
        if (
            dataSpec.length != C.LENGTH_UNSET.toLong() &&
            dataSpec.length > source.size - dataSpec.position
        ) {
            throw VideoSourceIOException(ERR_RANGE_INVALID)
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
            "token" to redactIdentifier(source.token),
            "position" to position,
            "remaining" to remaining,
            "requestedLength" to dataSpec.length,
            "sourceSize" to source.size,
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
            "read",
            "token" to redactIdentifier(source.token),
            "bytes" to bytesToCopy,
            "position" to position,
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
        val bytes =
            reader.read(source.token, position, fetchLength)
                ?: run {
                    traceReadFailure("read_null", fetchLength, null)
                    throw VideoSourceIOException(ERR_SOURCE_READ)
                }
        if (bytes.isEmpty()) {
            traceReadFailure("read_empty_before_eof", fetchLength, 0)
            throw VideoSourceIOException(ERR_SOURCE_READ)
        }
        if (bytes.size > fetchLength) {
            traceReadFailure("read_overflow", fetchLength, bytes.size)
            throw VideoSourceIOException(ERR_SOURCE_READ)
        }
        val elapsedMs = SystemClock.elapsedRealtime() - startedAt

        readBuffer = bytes
        readBufferOffset = 0
        traceSampled(
            currentRead,
            "native_read",
            "token" to redactIdentifier(source.token),
            "bytes" to bytes.size,
            "offset" to position,
            "requestedLength" to fetchLength,
            "remaining" to remaining,
            "elapsedMs" to elapsedMs,
        )
        if (elapsedMs >= SLOW_NATIVE_READ_MS) {
            Log.i(
                TAG,
                "event=native_read_slow token=${redactIdentifier(source.token)} offset=$position bytes=${bytes.size} requestedLength=$fetchLength elapsedMs=$elapsedMs",
            )
        }
    }

    override fun getUri(): Uri? = uri

    override fun getResponseHeaders(): Map<String, List<String>> = emptyMap()

    override fun close() {
        trace(
            "close",
            "token" to redactIdentifier(source.token),
            "position" to position,
            "remaining" to remaining,
            "readCount" to readCount,
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

    internal fun interface VideoSourceReader {
        fun read(
            token: String,
            offset: Long,
            length: Int,
        ): ByteArray?
    }

    internal class VideoSourceIOException(
        val code: String,
    ) : IOException(code)

    private object NativeVideoSourceReader : VideoSourceReader {
        override fun read(
            token: String,
            offset: Long,
            length: Int,
        ): ByteArray? = VideoPlaybackNativeShell.readVideoSource(token, offset, length)
    }

    companion object {
        const val ERR_RANGE_INVALID = "ERR_NATIVE_VIDEO_RANGE_INVALID"
        const val ERR_SOURCE_READ = "ERR_NATIVE_VIDEO_SOURCE_READ"
        const val MAX_READ_BYTES = 2 * 1024 * 1024
        const val MIN_READ_BUFFER_BYTES = MAX_READ_BYTES
        private const val TAG = "ChromVoid/VideoSource"
        private const val SLOW_NATIVE_READ_MS = 250L
    }

    private fun traceReadFailure(
        event: String,
        requestedLength: Int,
        actualLength: Int?,
    ) {
        Log.w(
            TAG,
            "event=$event token=${redactIdentifier(source.token)} position=$position remaining=$remaining requestedLength=$requestedLength actualLength=$actualLength",
        )
        trace(
            event,
            "token" to redactIdentifier(source.token),
            "position" to position,
            "remaining" to remaining,
            "requestedLength" to requestedLength,
            "actualLength" to actualLength,
        )
    }

    private fun traceSampled(
        readCount: Int,
        event: String,
        vararg fields: Pair<String, Any?>,
    ) {
        if (readCount <= 8 || readCount % 64 == 0 || remaining <= 0L) {
            trace(event, "read" to readCount, *fields)
        }
    }

    private fun trace(event: String, vararg fields: Pair<String, Any?>) {
        if (!BuildConfig.DEBUG) return

        val suffix =
            fields.joinToString(" ") { (key, value) ->
                "$key=${TracePrivacy.traceValue(value)}"
            }
        Log.i(
            TAG,
            "elapsedMs=${SystemClock.elapsedRealtime()} event=$event $suffix",
        )
    }

    private fun redactIdentifier(value: String?): String? = TracePrivacy.redactIdentifier(value)
}
