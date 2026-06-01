package com.chromvoid.app

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import com.chromvoid.app.nativebridge.AudioPlaybackNativeShell

@OptIn(UnstableApi::class)
internal class ChromVoidAudioPlayerController(
    private val engine: AudioPlayerEngine,
    private val emitEvent: (String) -> Unit = AudioPlaybackNativeShell::onAudioPlayerEvent,
    private val releaseSource: (String) -> Unit = AudioPlaybackNativeShell::releaseAudioSource,
    private val progressTicker: ProgressTicker = HandlerProgressTicker(),
    private val onTerminal: () -> Unit = {},
) {
    private var nativeSessionId: String? = null
    private var tracks: List<AudioPlaybackCommand.AudioTrack> = emptyList()
    private var released = true
    private var traceSeq = 0L
    private var progressTickerRunning = false
    private var pendingMediaItemIndex: Int? = null

    init {
        engine.listener =
            object : AudioPlayerEngine.Listener {
                override fun onStateChanged() {
                    emitState()
                }

                override fun onError(error: Throwable) {
                    val code = error.findAudioErrorCode()
                    emitError(code)
                    release(stopEngine = true, notifyStopped = false, reason = "player_error")
                    onTerminal()
                }
            }
    }

    fun handle(command: AudioPlaybackCommand): CommandResult {
        val startedAt = SystemClock.elapsedRealtime()
        if (command is AudioPlaybackCommand.StartSession) {
            startSession(command)
            traceCommandHandled(command, accepted = true, terminal = false, startedAt = startedAt)
            return CommandResult(accepted = true, terminal = false)
        }

        if (!matchesActiveSession(command.nativeSessionId)) {
            trace(
                "command_ignored",
                "reason" to "stale_session",
                "command" to AudioPlaybackDiagnostics.commandName(command),
                "nativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(command.nativeSessionId),
                "activeNativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(nativeSessionId),
                "elapsedMs" to (SystemClock.elapsedRealtime() - startedAt),
            )
            return CommandResult(accepted = false, terminal = false)
        }

        val result =
            when (command) {
                is AudioPlaybackCommand.Play -> {
                    engine.play()
                    emitState(playbackIntent = "play")
                    CommandResult(accepted = true, terminal = false)
                }
                is AudioPlaybackCommand.Pause -> {
                    engine.pause()
                    emitState(playbackIntent = "pause")
                    CommandResult(accepted = true, terminal = false)
                }
                is AudioPlaybackCommand.SeekTo -> {
                    engine.seekTo(command.positionMs)
                    emitState()
                    CommandResult(accepted = true, terminal = false)
                }
                is AudioPlaybackCommand.NextTrack -> {
                    val targetIndex = engine.currentMediaItemIndex + 1
                    if (engine.hasNextMediaItem && targetIndex in tracks.indices) {
                        pendingMediaItemIndex = targetIndex
                        engine.seekToNextMediaItem()
                    }
                    CommandResult(accepted = true, terminal = false)
                }
                is AudioPlaybackCommand.PreviousTrack -> {
                    val targetIndex = engine.currentMediaItemIndex - 1
                    if (engine.hasPreviousMediaItem && targetIndex in tracks.indices) {
                        pendingMediaItemIndex = targetIndex
                        engine.seekToPreviousMediaItem()
                    }
                    CommandResult(accepted = true, terminal = false)
                }
                is AudioPlaybackCommand.SelectTrack -> {
                    if (command.index !in tracks.indices) {
                        traceCommandHandled(command, accepted = false, terminal = false, startedAt = startedAt)
                        return CommandResult(accepted = false, terminal = false)
                    }
                    pendingMediaItemIndex = command.index
                    engine.seekToDefaultPosition(command.index)
                    CommandResult(accepted = true, terminal = false)
                }
                is AudioPlaybackCommand.Stop -> {
                    release(stopEngine = true, notifyStopped = true)
                    CommandResult(accepted = true, terminal = true)
                }
                is AudioPlaybackCommand.StartSession -> error("startSession handled above")
            }
        traceCommandHandled(command, result.accepted, result.terminal, startedAt)
        return result
    }

    fun release() {
        release(stopEngine = true, notifyStopped = false, reason = "controller_release")
    }

    fun releaseWithTerminalEvent(reason: String) {
        release(
            stopEngine = true,
            notifyStopped = false,
            reason = reason,
            releaseEventReason = reason,
        )
    }

    fun activeNativeSessionId(): String? = nativeSessionId

    private fun startSession(command: AudioPlaybackCommand.StartSession) {
        release(stopEngine = true, notifyStopped = false, reason = "replace_session")
        released = false
        nativeSessionId = command.nativeSessionId
        tracks = command.tracks
        pendingMediaItemIndex = null
        trace(
            "session_start",
            "nativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(command.nativeSessionId),
            "trackCount" to command.tracks.size,
            "index" to command.index,
            "autoplay" to command.autoplay,
            "tracks" to command.tracks.map(AudioPlaybackDiagnostics::trackMeta),
        )

        val mediaSources =
            command.tracks.map { track ->
                ProgressiveMediaSource.Factory { ChromVoidVaultAudioDataSource(track) }
                    .createMediaSource(buildMediaItem(track))
            }
        engine.setMediaSources(mediaSources, command.index)
        engine.prepare()
        if (command.autoplay) {
            engine.play()
        } else {
            engine.pause()
        }
        emitState(playbackIntent = if (command.autoplay) "play" else "pause")
    }

    private fun release(
        stopEngine: Boolean,
        notifyStopped: Boolean,
        reason: String = "stop_command",
        releaseEventReason: String? = null,
    ) {
        if (released) return
        val sessionId = nativeSessionId
        val releaseTracks = tracks
        val releaseTrack =
            engine.currentMediaItemIndex
                .takeIf { it in releaseTracks.indices }
                ?.let(releaseTracks::get)
                ?: releaseTracks.firstOrNull()
        val startedAt = SystemClock.elapsedRealtime()
        released = true
        nativeSessionId = null
        tracks = emptyList()
        pendingMediaItemIndex = null
        syncProgressTicker()
        if (stopEngine) engine.stop()
        releaseTracks.forEach { releaseSource(it.sourceToken) }
        trace(
            "source_release",
            "reason" to reason,
            "nativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(sessionId),
            "trackCount" to releaseTracks.size,
            "tracks" to releaseTracks.map(AudioPlaybackDiagnostics::trackMeta),
            "elapsedMs" to (SystemClock.elapsedRealtime() - startedAt),
            "notifyStopped" to notifyStopped,
        )

        if (notifyStopped && sessionId != null) {
            val firstTrack = releaseTracks.firstOrNull()
            emitEvent(
                AudioPlaybackEvent.State(
                    nativeSessionId = sessionId,
                    trackId = firstTrack?.trackId ?: -1L,
                    sourceRevision = firstTrack?.sourceRevision ?: -1L,
                    index = 0,
                    playbackState = "stopped",
                    playbackIntent = "stop",
                    loadingState = "idle",
                    positionMs = 0L,
                    durationMs = 0L,
                    canSeek = false,
                    hasPrevious = false,
                    hasNext = false,
                ).toJson(),
            )
        }
        if (releaseEventReason != null && sessionId != null) {
            emitEvent(
                AudioPlaybackEvent.Released(
                    nativeSessionId = sessionId,
                    trackId = releaseTrack?.trackId,
                    sourceRevision = releaseTrack?.sourceRevision,
                    reason = releaseEventReason,
                ).toJson(),
            )
        }
    }

    private fun matchesActiveSession(sessionId: String): Boolean = nativeSessionId == sessionId

    private fun emitState(playbackIntent: String = if (engine.playWhenReady) "play" else "pause") {
        val sessionId =
            nativeSessionId
                ?: run {
                    syncProgressTicker()
                    return
                }
        val index =
            engine.currentMediaItemIndex.takeIf { it in tracks.indices }
                ?: run {
                    syncProgressTicker()
                    return
                }
        val pendingIndex = pendingMediaItemIndex
        if (pendingIndex != null) {
            if (index != pendingIndex) {
                trace(
                    "player_state_suppressed",
                    "reason" to "pending_track_transition",
                    "nativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(sessionId),
                    "currentIndex" to index,
                    "pendingIndex" to pendingIndex,
                    "playbackState" to engine.playbackStateName(),
                    "playbackIntent" to playbackIntent,
                    "loadingState" to engine.loadingStateName(),
                )
                syncProgressTicker()
                return
            }
            pendingMediaItemIndex = null
        }
        val track = tracks[index]
        val startedAt = SystemClock.elapsedRealtime()
        emitEvent(
            AudioPlaybackEvent.State(
                nativeSessionId = sessionId,
                trackId = track.trackId,
                sourceRevision = track.sourceRevision,
                index = index,
                playbackState = engine.playbackStateName(),
                playbackIntent = playbackIntent,
                loadingState = engine.loadingStateName(),
                positionMs = engine.currentPosition.coerceAtLeast(0L),
                durationMs = engine.duration.takeIf { it != C.TIME_UNSET }?.coerceAtLeast(0L) ?: 0L,
                canSeek = engine.isCurrentMediaItemSeekable,
                hasPrevious = engine.hasPreviousMediaItem,
                hasNext = engine.hasNextMediaItem,
            ).toJson(),
        )
        trace(
            "player_to_webview_event",
            "event" to "state",
            "nativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(sessionId),
            "trackId" to track.trackId,
            "sourceRevision" to track.sourceRevision,
            "index" to index,
            "playbackState" to engine.playbackStateName(),
            "playbackIntent" to playbackIntent,
            "loadingState" to engine.loadingStateName(),
            "positionMs" to engine.currentPosition.coerceAtLeast(0L),
            "durationMs" to engine.duration.takeIf { it != C.TIME_UNSET }?.coerceAtLeast(0L),
            "elapsedMs" to (SystemClock.elapsedRealtime() - startedAt),
        )
        syncProgressTicker()
    }

    private fun handleProgressTick() {
        if (released || nativeSessionId == null || !engine.isPlaying) {
            syncProgressTicker()
            return
        }
        emitState()
    }

    private fun syncProgressTicker() {
        val shouldRun = !released && nativeSessionId != null && engine.isPlaying
        if (shouldRun == progressTickerRunning) return

        progressTickerRunning = shouldRun
        if (shouldRun) {
            progressTicker.start(PROGRESS_TICK_INTERVAL_MS, ::handleProgressTick)
        } else {
            progressTicker.stop()
        }
    }

    private fun emitError(code: String) {
        val sessionId = nativeSessionId ?: return
        val index = engine.currentMediaItemIndex.takeIf { it in tracks.indices } ?: 0
        val track = tracks.getOrNull(index)
        val startedAt = SystemClock.elapsedRealtime()
        emitEvent(
            AudioPlaybackEvent.Error(
                nativeSessionId = sessionId,
                trackId = track?.trackId,
                sourceRevision = track?.sourceRevision,
                code = code,
            ).toJson(),
        )
        trace(
            "player_to_webview_event",
            "event" to "error",
            "nativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(sessionId),
            "trackId" to track?.trackId,
            "sourceRevision" to track?.sourceRevision,
            "code" to code,
            "elapsedMs" to (SystemClock.elapsedRealtime() - startedAt),
        )
    }

    private fun Throwable.findAudioErrorCode(): String {
        var current: Throwable? = this
        while (current != null) {
            if (current is ChromVoidVaultAudioDataSource.AudioSourceIOException) return current.code
            current = current.cause
        }
        return if (this is PlaybackException) errorCodeName else ChromVoidVaultAudioDataSource.ERR_SOURCE_READ
    }

    private fun traceCommandHandled(
        command: AudioPlaybackCommand,
        accepted: Boolean,
        terminal: Boolean,
        startedAt: Long,
    ) {
        trace(
            "command_to_player_state",
            "command" to AudioPlaybackDiagnostics.commandName(command),
            "nativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(command.nativeSessionId),
            "trackId" to AudioPlaybackDiagnostics.traceTrackId(command),
            "sourceRevision" to AudioPlaybackDiagnostics.traceSourceRevision(command),
            "index" to AudioPlaybackDiagnostics.traceIndex(command),
            "positionMs" to (command as? AudioPlaybackCommand.SeekTo)?.positionMs,
            "accepted" to accepted,
            "terminal" to terminal,
            "playbackState" to engine.playbackStateName(),
            "playbackIntent" to if (engine.playWhenReady) "play" else "pause",
            "loadingState" to engine.loadingStateName(),
            "elapsedMs" to (SystemClock.elapsedRealtime() - startedAt),
        )
    }

    private fun trace(event: String, vararg fields: Pair<String, Any?>) {
        val suffix =
            fields.joinToString(" ") { (key, value) ->
                "$key=${AudioPlaybackDiagnostics.traceValue(value)}"
            }
        val message =
            "seq=${++traceSeq} elapsedMs=${SystemClock.elapsedRealtime()} event=$event $suffix"
        if (BuildConfig.DEBUG) {
            Log.d(
                TAG,
                message,
            )
            return
        }
        Log.i(
            TAG,
            message,
        )
    }

    private fun AudioPlayerEngine.playbackStateName(): String =
        when (playbackState) {
            Player.STATE_BUFFERING -> "buffering"
            Player.STATE_READY -> if (isPlaying) "playing" else "paused"
            Player.STATE_ENDED -> "stopped"
            Player.STATE_IDLE -> "stopped"
            else -> "paused"
        }

    private fun AudioPlayerEngine.loadingStateName(): String =
        when (playbackState) {
            Player.STATE_BUFFERING -> "loading"
            Player.STATE_READY, Player.STATE_ENDED -> "loaded"
            else -> "idle"
        }

    data class CommandResult(
        val accepted: Boolean,
        val terminal: Boolean,
    )

    internal interface AudioPlayerEngine {
        var listener: Listener?
        val currentMediaItemIndex: Int
        val playbackState: Int
        val isPlaying: Boolean
        val playWhenReady: Boolean
        val currentPosition: Long
        val duration: Long
        val isCurrentMediaItemSeekable: Boolean
        val hasPreviousMediaItem: Boolean
        val hasNextMediaItem: Boolean

        fun setMediaSources(
            mediaSources: List<MediaSource>,
            startIndex: Int,
        )

        fun prepare()

        fun play()

        fun pause()

        fun seekTo(positionMs: Long)

        fun seekToDefaultPosition(index: Int)

        fun seekToNextMediaItem()

        fun seekToPreviousMediaItem()

        fun stop()

        interface Listener {
            fun onStateChanged()

            fun onError(error: Throwable)
        }
    }

    internal interface ProgressTicker {
        fun start(
            intervalMs: Long,
            callback: () -> Unit,
        )

        fun stop()
    }

    internal class HandlerProgressTicker(
        private val handler: Handler = Handler(Looper.getMainLooper()),
    ) : ProgressTicker {
        private var runnable: Runnable? = null

        override fun start(
            intervalMs: Long,
            callback: () -> Unit,
        ) {
            stop()
            val nextRunnable =
                object : Runnable {
                    override fun run() {
                        if (runnable !== this) return
                        callback()
                        if (runnable === this) {
                            handler.postDelayed(this, intervalMs)
                        }
                    }
                }
            runnable = nextRunnable
            handler.postDelayed(nextRunnable, intervalMs)
        }

        override fun stop() {
            runnable?.let(handler::removeCallbacks)
            runnable = null
        }
    }

    internal class ExoPlayerEngine(
        private val player: ExoPlayer,
    ) : AudioPlayerEngine {
        override var listener: AudioPlayerEngine.Listener? = null

        init {
            player.addListener(
                object : Player.Listener {
                    override fun onPlaybackStateChanged(playbackState: Int) {
                        traceEngine(
                            "exo_playback_state_changed",
                            "playbackState" to playbackStateLabel(playbackState),
                            "playbackStateRaw" to playbackState,
                            "playWhenReady" to player.playWhenReady,
                            "isPlaying" to player.isPlaying,
                        )
                        listener?.onStateChanged()
                    }

                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        traceEngine(
                            "exo_is_playing_changed",
                            "isPlaying" to isPlaying,
                            "playWhenReady" to player.playWhenReady,
                            "playbackState" to playbackStateLabel(player.playbackState),
                            "playbackStateRaw" to player.playbackState,
                        )
                        listener?.onStateChanged()
                    }

                    override fun onPlayWhenReadyChanged(
                        playWhenReady: Boolean,
                        reason: Int,
                    ) {
                        traceEngine(
                            "exo_play_when_ready_changed",
                            "playWhenReady" to playWhenReady,
                            "reason" to reason,
                            "isPlaying" to player.isPlaying,
                            "playbackState" to playbackStateLabel(player.playbackState),
                            "playbackStateRaw" to player.playbackState,
                        )
                    }

                    override fun onMediaItemTransition(
                        mediaItem: MediaItem?,
                        reason: Int,
                    ) {
                        traceEngine(
                            "exo_media_item_transition",
                            "reason" to reason,
                            "currentIndex" to player.currentMediaItemIndex,
                            "playWhenReady" to player.playWhenReady,
                            "isPlaying" to player.isPlaying,
                            "playbackState" to playbackStateLabel(player.playbackState),
                        )
                        listener?.onStateChanged()
                    }

                    override fun onPlayerError(error: PlaybackException) {
                        listener?.onError(error)
                    }
                },
            )
        }

        override val currentMediaItemIndex: Int get() = player.currentMediaItemIndex
        override val playbackState: Int get() = player.playbackState
        override val isPlaying: Boolean get() = player.isPlaying
        override val playWhenReady: Boolean get() = player.playWhenReady
        override val currentPosition: Long get() = player.currentPosition
        override val duration: Long get() = player.duration
        override val isCurrentMediaItemSeekable: Boolean get() = player.isCurrentMediaItemSeekable
        override val hasPreviousMediaItem: Boolean get() = player.hasPreviousMediaItem()
        override val hasNextMediaItem: Boolean get() = player.hasNextMediaItem()

        override fun setMediaSources(
            mediaSources: List<MediaSource>,
            startIndex: Int,
        ) {
            player.setMediaSources(mediaSources, startIndex, C.TIME_UNSET)
        }

        override fun prepare() = player.prepare()

        override fun play() = player.play()

        override fun pause() = player.pause()

        override fun seekTo(positionMs: Long) = player.seekTo(positionMs)

        override fun seekToDefaultPosition(index: Int) = player.seekToDefaultPosition(index)

        override fun seekToNextMediaItem() = player.seekToNextMediaItem()

        override fun seekToPreviousMediaItem() = player.seekToPreviousMediaItem()

        override fun stop() = player.stop()

        private fun traceEngine(
            event: String,
            vararg fields: Pair<String, Any?>,
        ) {
            val suffix =
                fields.joinToString(" ") { (key, value) ->
                    "$key=${AudioPlaybackDiagnostics.traceValue(value)}"
                }
            Log.i("ChromVoid/AudioPlayback", "event=$event $suffix")
        }

        private fun playbackStateLabel(playbackState: Int): String =
            when (playbackState) {
                Player.STATE_BUFFERING -> "buffering"
                Player.STATE_READY -> "ready"
                Player.STATE_ENDED -> "ended"
                Player.STATE_IDLE -> "idle"
                else -> playbackState.toString()
            }
    }

    companion object {
        private const val TAG = "ChromVoid/AudioPlayback"
        private const val PROGRESS_TICK_INTERVAL_MS = 1_000L

        internal fun buildMediaItem(track: AudioPlaybackCommand.AudioTrack): MediaItem =
            MediaItem.Builder()
                .setUri(Uri.parse("chromvoid-audio://track/${track.trackId}?revision=${track.sourceRevision}"))
                .setMimeType(track.mimeType)
                .setMediaMetadata(
                    MediaMetadata.Builder()
                        .setTitle(AudioPlaybackCommand.SYSTEM_TITLE)
                        .build(),
                )
                .setTag(track)
                .build()
    }
}
