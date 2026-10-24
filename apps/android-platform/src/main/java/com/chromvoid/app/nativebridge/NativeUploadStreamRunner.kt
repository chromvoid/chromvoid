package com.chromvoid.app.nativebridge

import android.content.Context
import android.os.SystemClock
import android.util.Log
import com.chromvoid.app.shared.TracePrivacy
import java.io.InputStream
import java.util.Locale

internal interface NativeUploadCallbackSink {
    fun onFileStreamStarted(
        uploadId: String,
        fileId: String,
        provenanceJson: String,
    ): Boolean

    fun onFileChunk(
        uploadId: String,
        fileId: String,
        offset: Long,
        chunk: ByteArray,
    ): Boolean

    fun onFileCompleted(
        uploadId: String,
        fileId: String,
    ): Boolean

    fun onUploadFinished(uploadId: String)

    fun onUploadFailed(
        uploadId: String,
        message: String,
    )
}

internal class NativeUploadStreamRunner(
    private val callbackSink: NativeUploadCallbackSink,
) {
    fun streamPreparedFiles(
        context: Context,
        uploadId: String,
        bufferSize: Int,
        files: List<PickedFile>,
        batchStartNs: Long,
        source: String,
    ) {
        val buffer = ByteArray(bufferSize.takeIf { it > 0 } ?: DEFAULT_BUFFER_SIZE)
        for ((index, file) in files.withIndex()) {
            val openStartNs = SystemClock.elapsedRealtimeNanos()
            val openedStream = NativeUploadReadResolver.openInputStreamForUpload(context, file)
            openedStream.stream.use {
                Log.i(
                    TAG,
                    "event=file_stream_start uploadId=${traceId(uploadId)} source=$source fileId=${traceId(file.fileId)} index=$index size=${file.size} mimeType=${file.mimeType} uriScheme=${openedStream.provenance.uriScheme} uriAuthority=${openedStream.provenance.uriAuthority} permissionStatus=${openedStream.provenance.permissionStatus} requireOriginalStatus=${openedStream.provenance.requireOriginalStatus} originalStreamUsed=${openedStream.provenance.originalStreamUsed} regularStreamFallback=${openedStream.provenance.regularStreamFallback} openMs=${formatMs(SystemClock.elapsedRealtimeNanos() - openStartNs)}",
                )
                if (!callbackSink.onFileStreamStarted(uploadId, file.fileId, NativeUploadPayloadCodec.encodeUploadReadProvenance(openedStream.provenance))) {
                    Log.w(
                        TAG,
                        "event=file_stream_provenance_rejected uploadId=${traceId(uploadId)} source=$source fileId=${traceId(file.fileId)}",
                    )
                }
                val result = streamFile(uploadId, file, it, buffer)
                logStreamSummary(uploadId, file.fileId, source, "file_stream_finish", result.stats)
                if (!result.completed) {
                    val message = "Native upload stream was rejected"
                    Log.w(TAG, "event=file_stream_rejected uploadId=${traceId(uploadId)} source=$source fileId=${traceId(file.fileId)}")
                    callbackSink.onUploadFailed(uploadId, message)
                    return
                }
            }

            val completeStartNs = SystemClock.elapsedRealtimeNanos()
            if (!callbackSink.onFileCompleted(uploadId, file.fileId)) {
                Log.i(
                    TAG,
                    "event=file_completed_rejected uploadId=${traceId(uploadId)} source=$source fileId=${traceId(file.fileId)} elapsedMs=${formatMs(SystemClock.elapsedRealtimeNanos() - completeStartNs)}",
                )
                return
            }
            Log.i(
                TAG,
                "event=file_completed_sent uploadId=${traceId(uploadId)} source=$source fileId=${traceId(file.fileId)} elapsedMs=${formatMs(SystemClock.elapsedRealtimeNanos() - completeStartNs)}",
            )
        }

        callbackSink.onUploadFinished(uploadId)
        Log.i(
            TAG,
            "event=batch_finish uploadId=${traceId(uploadId)} source=$source files=${files.size} elapsedMs=${formatMs(SystemClock.elapsedRealtimeNanos() - batchStartNs)}",
        )
    }

    private fun streamFile(
        uploadId: String,
        file: PickedFile,
        stream: InputStream,
        buffer: ByteArray,
    ): StreamResult {
        val stats = StreamStats()
        var offset = 0L
        while (true) {
            val readStartNs = SystemClock.elapsedRealtimeNanos()
            val read = stream.read(buffer)
            val readNs = SystemClock.elapsedRealtimeNanos() - readStartNs
            stats.readNs += readNs
            if (readNs >= SLOW_CHUNK_NS) stats.slowReadCalls += 1
            if (read < 0) return StreamResult(completed = true, stats = stats)
            if (read == 0) {
                stats.zeroReads += 1
                continue
            }

            val copyStartNs = SystemClock.elapsedRealtimeNanos()
            val chunk = buffer.copyOf(read)
            val copyNs = SystemClock.elapsedRealtimeNanos() - copyStartNs
            stats.copyNs += copyNs
            if (copyNs >= SLOW_CHUNK_NS) stats.slowCopyCalls += 1

            val nativeStartNs = SystemClock.elapsedRealtimeNanos()
            val accepted = callbackSink.onFileChunk(uploadId, file.fileId, offset, chunk)
            val nativeNs = SystemClock.elapsedRealtimeNanos() - nativeStartNs
            stats.nativeNs += nativeNs
            if (nativeNs >= SLOW_CHUNK_NS) stats.slowNativeCalls += 1

            stats.bytesRead += read.toLong()
            stats.chunks += 1
            logStreamProgress(uploadId, file.fileId, offset, read, stats, readNs, copyNs, nativeNs)
            if (!accepted) return StreamResult(completed = false, stats = stats)
            offset += read.toLong()
        }
    }

    private fun logStreamProgress(
        uploadId: String,
        fileId: String,
        offset: Long,
        read: Int,
        stats: StreamStats,
        readNs: Long,
        copyNs: Long,
        nativeNs: Long,
    ) {
        val nowNs = SystemClock.elapsedRealtimeNanos()
        val bytesSinceLastLog = stats.bytesRead - stats.lastLogBytes
        val slowChunk = readNs >= SLOW_CHUNK_NS || copyNs >= SLOW_CHUNK_NS || nativeNs >= SLOW_CHUNK_NS
        if (
            !slowChunk &&
            nowNs - stats.lastLogNs < PERF_LOG_INTERVAL_NS &&
            bytesSinceLastLog < PERF_LOG_BYTES_INTERVAL
        ) {
            return
        }

        Log.i(
            TAG,
            "event=file_stream_progress uploadId=${traceId(uploadId)} fileId=${traceId(fileId)} offset=$offset chunkBytes=$read loadedBytes=${stats.bytesRead} chunks=${stats.chunks} avgMiBs=${formatRate(stats.bytesRead, nowNs - stats.startedNs)} readMs=${formatMs(readNs)} copyMs=${formatMs(copyNs)} nativeMs=${formatMs(nativeNs)} totalReadMs=${formatMs(stats.readNs)} totalCopyMs=${formatMs(stats.copyNs)} totalNativeMs=${formatMs(stats.nativeNs)}",
        )
        stats.lastLogNs = nowNs
        stats.lastLogBytes = stats.bytesRead
    }

    private fun logStreamSummary(uploadId: String, fileId: String, source: String, event: String, stats: StreamStats) {
        val elapsedNs = SystemClock.elapsedRealtimeNanos() - stats.startedNs
        Log.i(
            TAG,
            "event=$event uploadId=${traceId(uploadId)} source=$source fileId=${traceId(fileId)} bytes=${stats.bytesRead} chunks=${stats.chunks} zeroReads=${stats.zeroReads} elapsedMs=${formatMs(elapsedNs)} avgMiBs=${formatRate(stats.bytesRead, elapsedNs)} readMs=${formatMs(stats.readNs)} copyMs=${formatMs(stats.copyNs)} nativeMs=${formatMs(stats.nativeNs)} slowReadCalls=${stats.slowReadCalls} slowCopyCalls=${stats.slowCopyCalls} slowNativeCalls=${stats.slowNativeCalls}",
        )
    }

    private fun formatMs(ns: Long): String = String.format(Locale.US, "%.2f", ns / 1_000_000.0)

    private fun traceId(value: String): String = TracePrivacy.redactIdentifier(value) ?: "blank"

    private fun formatRate(bytes: Long, elapsedNs: Long): String {
        if (bytes <= 0 || elapsedNs <= 0) return "0.00"

        val seconds = elapsedNs / 1_000_000_000.0
        return String.format(Locale.US, "%.2f", bytes / BYTES_PER_MIB / seconds)
    }

    companion object {
        private const val TAG = "ChromVoid/NativeUpload"
        private const val DEFAULT_BUFFER_SIZE = 512 * 1024
        private const val PERF_LOG_INTERVAL_NS = 2_000_000_000L
        private const val PERF_LOG_BYTES_INTERVAL = 8L * 1024L * 1024L
        private const val SLOW_CHUNK_NS = 250_000_000L
        private const val BYTES_PER_MIB = 1024.0 * 1024.0
    }
}
