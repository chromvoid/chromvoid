package com.chromvoid.app.nativebridge

import android.content.Context
import android.content.Intent
import android.util.Log
import com.chromvoid.app.BuildConfig
import com.chromvoid.app.ChromVoidVideoActivity
import com.chromvoid.app.VideoSource
import com.chromvoid.app.shared.NativeRuntimeLoader
import com.chromvoid.app.shared.TracePrivacy

internal object VideoPlaybackNativeShell {
    private const val TAG = "ChromVoid/VideoPlayback"

    @JvmStatic
    fun start(
        context: Context,
        sourceJson: String,
    ): Boolean {
        val source =
            runCatching { VideoSource.fromJson(sourceJson) }
                .onFailure { error -> Log.w(TAG, "Invalid video source payload", error) }
                .getOrNull()
                ?: return false
        trace(
            "start_request",
            "nativeSourceToken" to redactIdentifier(source.nativeSourceToken),
            "streamId" to redactIdentifier(source.streamId),
            "nodeId" to source.nodeId,
            "mimeType" to source.mimeType,
            "size" to source.size,
            "sourceRevision" to source.sourceRevision,
            "mediaSourceGeneration" to source.mediaSourceGeneration,
            "transportSessionGeneration" to source.transportSessionGeneration,
            "appForegroundEpoch" to source.appForegroundEpoch,
        )

        val intent =
            Intent(context, ChromVoidVideoActivity::class.java)
                .putExtra(ChromVoidVideoActivity.EXTRA_SOURCE_JSON, sourceJson)
                .addFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK or
                        Intent.FLAG_ACTIVITY_SINGLE_TOP or
                        Intent.FLAG_ACTIVITY_CLEAR_TOP,
                )

        return runCatching {
            startIntentForExternalAction(context, intent)
            trace("start_intent_sent", "nativeSourceToken" to redactIdentifier(source.nativeSourceToken))
            emitVideoPlayerEvent(source, "started", -1, -1, "")
            true
        }.getOrElse { error ->
            Log.w(TAG, "Failed to start video activity", error)
            releaseVideoSource(source.nativeSourceToken)
            false
        }
    }

    @JvmStatic
    @Suppress("UNUSED_PARAMETER")
    fun stop(
        context: Context,
        token: String,
    ) {
        if (token.isBlank()) return
        val finishedActivity = ChromVoidVideoActivity.finishActiveForToken(token)
        trace(
            "stop_request",
            "nativeSourceToken" to redactIdentifier(token),
            "finishedActivity" to finishedActivity,
        )
        releaseVideoSource(token)
    }

    @JvmStatic
    internal fun openVideoSourceRead(
        source: VideoSource,
        offset: Long,
        length: Long,
    ): VideoSourceReadHandleResult =
        NativeRuntimeLoader.callWhenLoaded(
            callerTag = TAG,
            fallback = VideoSourceReadHandleResult(handle = 0L, errorCode = "ERR_NATIVE_VIDEO_SOURCE_READ"),
        ) {
            nativeOpenVideoSourceRead(
                source.nativeSourceToken,
                offset,
                length,
                source.mediaSourceGeneration,
                source.sourceRevision,
                source.transportSessionGeneration ?: -1L,
                source.appForegroundEpoch,
            )
                ?: VideoSourceReadHandleResult(handle = 0L, errorCode = "ERR_NATIVE_VIDEO_SOURCE_READ")
        }

    @JvmStatic
    internal fun readVideoSourceChunk(
        source: VideoSource,
        handle: Long,
        maxLength: Int,
    ): VideoSourceReadResult =
        NativeRuntimeLoader.callWhenLoaded(
            callerTag = TAG,
            fallback = VideoSourceReadResult(bytes = null, errorCode = "ERR_NATIVE_VIDEO_SOURCE_READ"),
        ) {
            nativeReadVideoSourceChunk(
                source.nativeSourceToken,
                handle,
                maxLength,
                source.mediaSourceGeneration,
                source.sourceRevision,
                source.transportSessionGeneration ?: -1L,
                source.appForegroundEpoch,
            )
                ?: VideoSourceReadResult(bytes = null, errorCode = "ERR_NATIVE_VIDEO_SOURCE_READ")
        }

    @JvmStatic
    internal fun closeVideoSourceRead(
        source: VideoSource,
        handle: Long,
    ) {
        if (handle <= 0L) return
        NativeRuntimeLoader.runWhenLoaded(TAG) {
            nativeCloseVideoSourceRead(
                source.nativeSourceToken,
                handle,
                source.mediaSourceGeneration,
                source.sourceRevision,
                source.transportSessionGeneration ?: -1L,
                source.appForegroundEpoch,
            )
        }
    }

    @JvmStatic
    internal fun releaseVideoSource(token: String) {
        if (token.isNotBlank()) {
            NativeRuntimeLoader.runWhenLoaded(TAG) { nativeReleaseVideoSource(token) }
        }
    }

    @JvmStatic
    internal fun onVideoPlayerEvent(
        token: String,
        event: String,
        positionMs: Long = -1,
        durationMs: Long = -1,
        error: String = "",
    ) {
        emitVideoPlayerEvent(token, event, positionMs, durationMs, error)
    }

    @JvmStatic
    internal fun onVideoPlayerEvent(
        source: VideoSource,
        event: String,
        positionMs: Long = -1,
        durationMs: Long = -1,
        error: String = "",
    ) {
        trace(
            "player_event",
            "nativeSourceToken" to redactIdentifier(source.nativeSourceToken),
            "event" to event,
            "positionMs" to positionMs,
            "durationMs" to durationMs,
            "error" to TracePrivacy.traceValue(error),
            "sourceRevision" to source.sourceRevision,
            "mediaSourceGeneration" to source.mediaSourceGeneration,
            "transportSessionGeneration" to source.transportSessionGeneration,
            "appForegroundEpoch" to source.appForegroundEpoch,
        )
        emitVideoPlayerEvent(source, event, positionMs, durationMs, error)
    }

    private fun emitVideoPlayerEvent(
        source: VideoSource,
        event: String,
        positionMs: Long,
        durationMs: Long,
        error: String,
    ) {
        emitVideoPlayerEvent(
            token = source.nativeSourceToken,
            event = event,
            positionMs = positionMs,
            durationMs = durationMs,
            error = error,
            mediaSourceGeneration = source.mediaSourceGeneration,
            sourceRevision = source.sourceRevision,
            transportSessionGeneration = source.transportSessionGeneration ?: -1,
            appForegroundEpoch = source.appForegroundEpoch,
        )
    }

    private fun emitVideoPlayerEvent(
        token: String,
        event: String,
        positionMs: Long,
        durationMs: Long,
        error: String,
        mediaSourceGeneration: Long = -1,
        sourceRevision: Long = -1,
        transportSessionGeneration: Long = -1,
        appForegroundEpoch: Long = -1,
    ) {
        NativeRuntimeLoader.runWhenLoaded(TAG) {
            nativeOnVideoPlayerEvent(
                token,
                event,
                positionMs,
                durationMs,
                error,
                mediaSourceGeneration,
                sourceRevision,
                transportSessionGeneration,
                appForegroundEpoch,
            )
        }
    }

    @JvmStatic
    private external fun nativeOpenVideoSourceRead(
        token: String,
        offset: Long,
        length: Long,
        mediaSourceGeneration: Long,
        sourceRevision: Long,
        transportSessionGeneration: Long,
        appForegroundEpoch: Long,
    ): VideoSourceReadHandleResult?

    @JvmStatic
    private external fun nativeReadVideoSourceChunk(
        token: String,
        handle: Long,
        maxLength: Int,
        mediaSourceGeneration: Long,
        sourceRevision: Long,
        transportSessionGeneration: Long,
        appForegroundEpoch: Long,
    ): VideoSourceReadResult?

    @JvmStatic
    private external fun nativeCloseVideoSourceRead(
        token: String,
        handle: Long,
        mediaSourceGeneration: Long,
        sourceRevision: Long,
        transportSessionGeneration: Long,
        appForegroundEpoch: Long,
    ): String?

    @JvmStatic
    private external fun nativeReleaseVideoSource(token: String)

    @JvmStatic
    private external fun nativeOnVideoPlayerEvent(
        token: String,
        event: String,
        positionMs: Long,
        durationMs: Long,
        error: String,
        mediaSourceGeneration: Long,
        sourceRevision: Long,
        transportSessionGeneration: Long,
        appForegroundEpoch: Long,
    ): String?

    private fun trace(event: String, vararg fields: Pair<String, Any?>) {
        if (!BuildConfig.DEBUG) return

        val suffix =
            fields.joinToString(" ") { (key, value) ->
                "$key=${TracePrivacy.traceValue(value)}"
            }
        Log.i(TAG, "event=$event $suffix")
    }

    private fun redactIdentifier(value: String?): String? = TracePrivacy.redactIdentifier(value)
}
