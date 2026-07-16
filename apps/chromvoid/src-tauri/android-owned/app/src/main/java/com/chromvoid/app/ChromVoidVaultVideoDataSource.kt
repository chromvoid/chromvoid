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
import com.chromvoid.app.nativebridge.VideoSourceReadHandleResult
import com.chromvoid.app.nativebridge.VideoSourceReadResult
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
    private var readHandle = 0L

    override fun addTransferListener(transferListener: TransferListener) = Unit

    override fun open(dataSpec: DataSpec): Long {
        if (opened || readHandle != 0L) {
            close()
        }
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
        if (remaining > 0L) {
            val openResult = reader.open(source, position, remaining)
            openResult.errorCode?.takeIf { it.isNotBlank() }?.let {
                opened = false
                traceReadFailure("open_error", 0, null, it)
                throw VideoSourceIOException(it)
            }
            if (openResult.handle <= 0L) {
                opened = false
                traceReadFailure("open_invalid_handle", 0, null, ERR_SOURCE_READ)
                throw VideoSourceIOException(ERR_SOURCE_READ)
            }
            readHandle = openResult.handle
        }
        trace(
            "open",
            "nativeSourceToken" to redactIdentifier(source.nativeSourceToken),
            "streamId" to redactIdentifier(source.streamId),
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
            "nativeSourceToken" to redactIdentifier(source.nativeSourceToken),
            "streamId" to redactIdentifier(source.streamId),
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
                requestedLength.toLong(),
                remaining,
                MAX_READ_BYTES.toLong(),
            ).toInt()
        val startedAt = SystemClock.elapsedRealtime()
        val result = reader.read(source, readHandle, fetchLength)
        result.errorCode?.takeIf { it.isNotBlank() }?.let {
            traceReadFailure("read_error", fetchLength, null, it)
            throw VideoSourceIOException(it)
        }

        val bytes =
            result.bytes
                ?: run {
                    traceReadFailure("read_null", fetchLength, null, ERR_SOURCE_READ)
                    throw VideoSourceIOException(ERR_SOURCE_READ)
                }
        if (bytes.isEmpty()) {
            traceReadFailure("read_empty_before_eof", fetchLength, 0, ERR_SOURCE_READ)
            throw VideoSourceIOException(ERR_SOURCE_READ)
        }
        if (bytes.size > fetchLength) {
            traceReadFailure("read_overflow", fetchLength, bytes.size, ERR_SOURCE_READ)
            throw VideoSourceIOException(ERR_SOURCE_READ)
        }
        val elapsedMs = SystemClock.elapsedRealtime() - startedAt

        readBuffer = bytes
        readBufferOffset = 0
        traceSampled(
            currentRead,
            "native_read",
            "nativeSourceToken" to redactIdentifier(source.nativeSourceToken),
            "streamId" to redactIdentifier(source.streamId),
            "bytes" to bytes.size,
            "offset" to position,
            "requestedLength" to fetchLength,
            "remaining" to remaining,
            "elapsedMs" to elapsedMs,
        )
        if (elapsedMs >= SLOW_NATIVE_READ_MS) {
            Log.i(
                TAG,
                "event=native_read_slow nativeSourceToken=${redactIdentifier(source.nativeSourceToken)} offset=$position bytes=${bytes.size} requestedLength=$fetchLength elapsedMs=$elapsedMs",
            )
        }
    }

    override fun getUri(): Uri? = uri

    override fun getResponseHeaders(): Map<String, List<String>> = emptyMap()

    override fun close() {
        trace(
            "close",
            "nativeSourceToken" to redactIdentifier(source.nativeSourceToken),
            "streamId" to redactIdentifier(source.streamId),
            "position" to position,
            "remaining" to remaining,
            "readCount" to readCount,
        )
        if (readHandle > 0L) {
            reader.close(source, readHandle)
            readHandle = 0L
        }
        opened = false
        uri = null
        remaining = 0L
        clearReadBuffer()
    }

    private fun clearReadBuffer() {
        readBuffer = ByteArray(0)
        readBufferOffset = 0
    }

    internal interface VideoSourceReader {
        fun open(
            source: VideoSource,
            offset: Long,
            length: Long,
        ): VideoSourceReadHandleResult

        fun read(
            source: VideoSource,
            handle: Long,
            maxLength: Int,
        ): VideoSourceReadResult

        fun close(
            source: VideoSource,
            handle: Long,
        )
    }

    internal class VideoSourceIOException(
        val code: String,
    ) : IOException(code)

    private object NativeVideoSourceReader : VideoSourceReader {
        override fun open(
            source: VideoSource,
            offset: Long,
            length: Long,
        ): VideoSourceReadHandleResult = VideoPlaybackNativeShell.openVideoSourceRead(source, offset, length)

        override fun read(
            source: VideoSource,
            handle: Long,
            maxLength: Int,
        ): VideoSourceReadResult = VideoPlaybackNativeShell.readVideoSourceChunk(source, handle, maxLength)

        override fun close(
            source: VideoSource,
            handle: Long,
        ) = VideoPlaybackNativeShell.closeVideoSourceRead(source, handle)
    }

    companion object {
        const val ERR_RANGE_INVALID = "ERR_NATIVE_VIDEO_RANGE_INVALID"
        const val ERR_SOURCE_READ = "ERR_NATIVE_VIDEO_SOURCE_READ"
        const val MAX_READ_BYTES = 2 * 1024 * 1024
        private const val TAG = "ChromVoid/VideoSource"
        private const val SLOW_NATIVE_READ_MS = 250L
    }

    private fun traceReadFailure(
        event: String,
        requestedLength: Int,
        actualLength: Int?,
        errorCode: String,
    ) {
        Log.w(
            TAG,
            "event=$event nativeSourceToken=${redactIdentifier(source.nativeSourceToken)} position=$position remaining=$remaining requestedLength=$requestedLength actualLength=$actualLength errorCode=$errorCode",
        )
        trace(
            event,
            "nativeSourceToken" to redactIdentifier(source.nativeSourceToken),
            "streamId" to redactIdentifier(source.streamId),
            "position" to position,
            "remaining" to remaining,
            "requestedLength" to requestedLength,
            "actualLength" to actualLength,
            "errorCode" to errorCode,
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
