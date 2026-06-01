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
            "token" to redactIdentifier(source.token),
            "nodeId" to source.nodeId,
            "mimeType" to source.mimeType,
            "size" to source.size,
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
            trace("start_intent_sent", "token" to redactIdentifier(source.token))
            emitVideoPlayerEvent(source.token, "started", -1, -1, "")
            true
        }.getOrElse { error ->
            Log.w(TAG, "Failed to start video activity", error)
            releaseVideoSource(source.token)
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
            "token" to redactIdentifier(token),
            "finishedActivity" to finishedActivity,
        )
        releaseVideoSource(token)
    }

    @JvmStatic
    internal fun readVideoSource(
        token: String,
        offset: Long,
        length: Int,
    ): ByteArray? =
        NativeRuntimeLoader.callWhenLoaded<ByteArray?>(TAG, null) {
            nativeReadVideoSource(token, offset, length)
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
        trace(
            "player_event",
            "token" to redactIdentifier(token),
            "event" to event,
            "positionMs" to positionMs,
            "durationMs" to durationMs,
            "error" to TracePrivacy.traceValue(error),
        )
        emitVideoPlayerEvent(token, event, positionMs, durationMs, error)
    }

    private fun emitVideoPlayerEvent(
        token: String,
        event: String,
        positionMs: Long,
        durationMs: Long,
        error: String,
    ) {
        NativeRuntimeLoader.runWhenLoaded(TAG) {
            nativeOnVideoPlayerEvent(token, event, positionMs, durationMs, error)
        }
    }

    @JvmStatic
    private external fun nativeReadVideoSource(
        token: String,
        offset: Long,
        length: Int,
    ): ByteArray?

    @JvmStatic
    private external fun nativeReleaseVideoSource(token: String)

    @JvmStatic
    private external fun nativeOnVideoPlayerEvent(
        token: String,
        event: String,
        positionMs: Long,
        durationMs: Long,
        error: String,
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
