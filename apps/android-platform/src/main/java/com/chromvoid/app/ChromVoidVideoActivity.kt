package com.chromvoid.app

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.ViewGroup
import androidx.annotation.OptIn
import androidx.appcompat.app.AppCompatActivity
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.ui.PlayerView
import com.chromvoid.app.nativebridge.VideoPlaybackNativeShell
import com.chromvoid.app.shared.TracePrivacy
import com.chromvoid.platform.BuildConfig
import java.lang.ref.WeakReference

@OptIn(UnstableApi::class)
class ChromVoidVideoActivity : AppCompatActivity() {
    private var player: ExoPlayer? = null
    private var playerView: PlayerView? = null
    private var source: VideoSource? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        trace("create")
        handleIntent()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        trace("new_intent")
        handleIntent()
    }

    private fun handleIntent() {
        val stopToken = intent.getStringExtra(EXTRA_STOP_TOKEN)
        if (!stopToken.isNullOrBlank()) {
            trace("stop_intent", "nativeSourceToken" to redactIdentifier(stopToken))
            if (source?.nativeSourceToken == stopToken) {
                finish()
            } else {
                VideoPlaybackNativeShell.releaseVideoSource(stopToken)
            }
            return
        }

        val sourceJson = intent.getStringExtra(EXTRA_SOURCE_JSON)
        if (sourceJson.isNullOrBlank()) {
            trace("missing_source_json")
            finish()
            return
        }

        val parsed =
            runCatching { VideoSource.fromJson(sourceJson) }
                .getOrElse {
                    trace("invalid_source_json")
                    finish()
                    return
                }

        val previous = source
        if (previous?.nativeSourceToken == parsed.nativeSourceToken && player != null) {
            trace("duplicate_start_ignored", "nativeSourceToken" to redactIdentifier(parsed.nativeSourceToken))
            return
        }
        if (previous != null && previous.nativeSourceToken != parsed.nativeSourceToken) {
            releasePlayer(notifyNative = true)
        }

        source = parsed
        setActiveActivity(this, parsed.nativeSourceToken)
        trace(
            "source_ready",
            "nativeSourceToken" to redactIdentifier(parsed.nativeSourceToken),
            "streamId" to redactIdentifier(parsed.streamId),
            "nodeId" to parsed.nodeId,
            "mimeType" to parsed.mimeType,
            "size" to parsed.size,
            "sourceRevision" to parsed.sourceRevision,
        )
        startPlayer(parsed)
    }

    private fun startPlayer(source: VideoSource) {
        trace("start_player", "nativeSourceToken" to redactIdentifier(source.nativeSourceToken))
        if (player != null || playerView != null) {
            releasePlayer(notifyNative = false)
        }

        val view =
            PlayerView(this).apply {
                layoutParams =
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                useController = true
            }
        setContentView(view)
        playerView = view

        val mediaSource =
            ProgressiveMediaSource.Factory { ChromVoidVaultVideoDataSource(source) }
                .createMediaSource(
                    MediaItem.Builder()
                        .setUri(Uri.parse("chromvoid-video://${source.nativeSourceToken}"))
                        .setMimeType(source.mimeType)
                        .build(),
                )
        val loadControl =
            DefaultLoadControl.Builder()
                .setBufferDurationsMs(
                    VIDEO_MIN_BUFFER_MS,
                    VIDEO_MAX_BUFFER_MS,
                    VIDEO_BUFFER_FOR_PLAYBACK_MS,
                    VIDEO_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS,
                )
                .setPrioritizeTimeOverSizeThresholds(true)
                .build()
        val exoPlayer =
            ExoPlayer.Builder(this)
                .setLoadControl(loadControl)
                .build()
        player = exoPlayer
        view.player = exoPlayer
        exoPlayer.addListener(VideoPlayerEventListener(source) { finish() })
        exoPlayer.setMediaSource(mediaSource)
        exoPlayer.prepare()
        exoPlayer.playWhenReady = true
        trace("player_prepared", "nativeSourceToken" to redactIdentifier(source.nativeSourceToken))
    }

    override fun onStop() {
        trace("stop", "isFinishing" to isFinishing, "isChangingConfigurations" to isChangingConfigurations)
        // SPEC-231 I2: app background is a canonical release trigger for v1 video playback.
        if (!isFinishing && !isChangingConfigurations) {
            releasePlayer(notifyNative = true)
            finish()
        }
        super.onStop()
    }

    override fun onDestroy() {
        trace("destroy")
        releasePlayer(notifyNative = true)
        clearActiveActivity(this)
        super.onDestroy()
    }

    private fun releasePlayer(notifyNative: Boolean) {
        val currentSource = source
        trace(
            "release_player",
            "nativeSourceToken" to redactIdentifier(currentSource?.nativeSourceToken),
            "notifyNative" to notifyNative,
        )
        playerView?.player = null
        playerView = null
        player?.release()
        player = null
        if (notifyNative && currentSource != null) {
            VideoPlaybackNativeShell.onVideoPlayerEvent(currentSource, "released")
            VideoPlaybackNativeShell.releaseVideoSource(currentSource.nativeSourceToken)
            clearActiveActivity(this, currentSource.nativeSourceToken)
            source = null
        }
    }

    private inner class VideoPlayerEventListener(
        private val source: VideoSource,
        private val onTerminalError: () -> Unit,
    ) : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
            val event =
                when (playbackState) {
                    Player.STATE_READY -> "ready"
                    Player.STATE_ENDED -> "ended"
                    Player.STATE_BUFFERING -> "buffering"
                    Player.STATE_IDLE -> "idle"
                    else -> return
                }
            trace(
                "playback_state",
                "event" to event,
                "nativeSourceToken" to redactIdentifier(source.nativeSourceToken),
            )
            VideoPlaybackNativeShell.onVideoPlayerEvent(source, event)
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            val event = if (isPlaying) "playing" else "paused"
            trace(
                "playback_is_playing",
                "event" to event,
                "nativeSourceToken" to redactIdentifier(source.nativeSourceToken),
            )
            VideoPlaybackNativeShell.onVideoPlayerEvent(source, event)
        }

        override fun onPlayerError(error: PlaybackException) {
            val errorCode = error.findVideoErrorCode()
            Log.e(
                TAG,
                "Video player failed nativeSourceToken=${redactIdentifier(source.nativeSourceToken)} error=$errorCode message=${TracePrivacy.failureMessage(error)}",
            )
            trace(
                "player_error",
                "nativeSourceToken" to redactIdentifier(source.nativeSourceToken),
                "error" to errorCode,
                "message" to TracePrivacy.failureMessage(error),
            )
            VideoPlaybackNativeShell.onVideoPlayerEvent(
                source = source,
                event = "error",
                error = errorCode,
            )
            onTerminalError()
        }

        private fun Throwable.findVideoErrorCode(): String {
            var current: Throwable? = this
            while (current != null) {
                if (current is ChromVoidVaultVideoDataSource.VideoSourceIOException) return current.code
                current = current.cause
            }
            return if (this is PlaybackException) errorCodeName else "ERR_NATIVE_VIDEO_PLAYBACK"
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

    companion object {
        const val EXTRA_SOURCE_JSON = "com.chromvoid.app.extra.VIDEO_SOURCE_JSON"
        const val EXTRA_STOP_TOKEN = "com.chromvoid.app.extra.VIDEO_STOP_TOKEN"
        private const val TAG = "ChromVoid/VideoActivity"
        private const val VIDEO_MIN_BUFFER_MS = 5_000
        private const val VIDEO_MAX_BUFFER_MS = 30_000
        private const val VIDEO_BUFFER_FOR_PLAYBACK_MS = 500
        private const val VIDEO_BUFFER_FOR_PLAYBACK_AFTER_REBUFFER_MS = 1_000
        @Volatile private var activeActivityRef: WeakReference<ChromVoidVideoActivity>? = null
        @Volatile private var activeToken: String? = null

        fun finishActiveForToken(token: String): Boolean {
            if (token.isBlank() || activeToken != token) return false
            val activity = activeActivityRef?.get() ?: return false
            activity.runOnUiThread {
                if (!activity.isFinishing && !activity.isDestroyed) {
                    activity.finish()
                }
            }
            return true
        }

        private fun setActiveActivity(
            activity: ChromVoidVideoActivity,
            token: String,
        ) {
            activeActivityRef = WeakReference(activity)
            activeToken = token
        }

        private fun clearActiveActivity(
            activity: ChromVoidVideoActivity,
            token: String? = null,
        ) {
            if (activeActivityRef?.get() !== activity) return
            if (token != null && activeToken != token) return
            activeActivityRef = null
            activeToken = null
        }
    }
}
