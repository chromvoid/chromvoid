package com.chromvoid.app

import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.annotation.OptIn
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionResult
import com.chromvoid.app.nativebridge.AudioPlaybackNativeShell

@OptIn(UnstableApi::class)
internal class ChromVoidAudioSessionService : MediaSessionService() {
    private var player: ExoPlayer? = null
    private var mediaSession: MediaSession? = null
    private var controller: ChromVoidAudioPlayerController? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var traceSeq = 0L
    private var sessionAdded = false
    private var playbackOngoingCheckerForTests: (() -> Boolean)? = null
    private val warmupIdleStop =
        Runnable {
            if (controller?.activeNativeSessionId() != null) return@Runnable
            trace("warmup_idle_stop")
            stopAudioService()
        }

    override fun onCreate() {
        super.onCreate()
        createController()
    }

    override fun onStartCommand(
        intent: Intent?,
        flags: Int,
        startId: Int,
    ): Int {
        val startedAt = SystemClock.elapsedRealtime()
        if (intent?.action == ACTION_WARMUP) {
            trace("service_warmup")
            scheduleWarmupIdleStop()
            return START_NOT_STICKY
        }
        if (intent?.action != ACTION_COMMAND) {
            return super.onStartCommand(intent, flags, startId)
        }
        cancelWarmupIdleStop()

        val commandJson = intent.getStringExtra(EXTRA_COMMAND_JSON)
        trace(
            "service_start",
            "command" to commandJson?.let(AudioPlaybackCommand::commandNameFromJson),
            "nativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(commandJson?.let(AudioPlaybackCommand::nativeSessionIdFromJson)),
            "dispatchId" to AudioPlaybackDiagnostics.redactIdentifier(commandJson?.let(AudioPlaybackCommand::dispatchIdFromJson)),
        )
        val command = commandJson?.let(AudioPlaybackCommand::fromJson)
        if (command == null) {
            Log.w(TAG, "Ignoring invalid audio command")
            trace("command_ignored", "reason" to "invalid_json")
            AudioPlaybackNativeShell.reportCommandHandled(
                dispatchId = commandJson?.let(AudioPlaybackCommand::dispatchIdFromJson),
                accepted = false,
                terminal = true,
                errorCode = ERR_NATIVE_AUDIO_COMMAND_INVALID_JSON,
            )
            return START_NOT_STICKY
        }

        val activeController = controller
        if (activeController == null) {
            Log.w(TAG, "Ignoring audio command after service release")
            trace(
                "command_rejected",
                "reason" to "service_released",
                "command" to AudioPlaybackDiagnostics.commandName(command),
                "nativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(command.nativeSessionId),
                "elapsedMs" to (SystemClock.elapsedRealtime() - startedAt),
            )
            AudioPlaybackNativeShell.reportCommandHandled(
                dispatchId = command.dispatchId,
                accepted = false,
                terminal = true,
                errorCode = ERR_NATIVE_AUDIO_COMMAND_REJECTED,
            )
            return START_NOT_STICKY
        }
        val result =
            runCatching { activeController.handle(command) }
                .getOrElse { error ->
                    Log.w(TAG, "Audio command handling failed", error)
                    trace(
                        "command_rejected",
                        "command" to AudioPlaybackDiagnostics.commandName(command),
                        "nativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(command.nativeSessionId),
                        "errorCode" to ERR_NATIVE_AUDIO_COMMAND_FAILED,
                        "elapsedMs" to (SystemClock.elapsedRealtime() - startedAt),
                    )
                    AudioPlaybackNativeShell.reportCommandHandled(
                        dispatchId = command.dispatchId,
                        accepted = false,
                        terminal = true,
                        errorCode = ERR_NATIVE_AUDIO_COMMAND_FAILED,
                    )
                    return START_NOT_STICKY
                }
        AudioPlaybackNativeShell.reportCommandHandled(
            dispatchId = command.dispatchId,
            accepted = result.accepted,
            terminal = result.terminal,
            errorCode = if (result.accepted) null else ERR_NATIVE_AUDIO_COMMAND_REJECTED,
        )
        trace(
            "command_dispatched",
            "command" to AudioPlaybackDiagnostics.commandName(command),
            "nativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(command.nativeSessionId),
            "trackId" to AudioPlaybackDiagnostics.traceTrackId(command),
            "sourceRevision" to AudioPlaybackDiagnostics.traceSourceRevision(command),
            "index" to AudioPlaybackDiagnostics.traceIndex(command),
            "accepted" to result.accepted,
            "terminal" to result.terminal,
            "elapsedMs" to (SystemClock.elapsedRealtime() - startedAt),
        )
        if (command is AudioPlaybackCommand.StartSession && result.accepted) {
            addMediaSessionIfNeeded()
        }
        if (result.terminal) {
            stopAudioService()
            return START_NOT_STICKY
        }
        return if (result.accepted && activeController.activeNativeSessionId() != null) START_STICKY else START_NOT_STICKY
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onTaskRemoved(rootIntent: Intent?) {
        val ongoing = playbackOngoingCheckerForTests?.invoke() ?: isPlaybackOngoing()
        trace(
            "task_removed",
            "playbackOngoing" to ongoing,
            "nativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(controller?.activeNativeSessionId()),
        )
        if (ongoing) return
        stopAudioService(releaseEventReason = "system_stop")
    }

    override fun onDestroy() {
        stopAudioService(releaseEventReason = "service_destroyed")
        super.onDestroy()
    }

    private fun createController() {
        val exoPlayer = ExoPlayer.Builder(this).build()
        val session =
            MediaSession.Builder(this, exoPlayer)
                .setId("ChromVoidAudioSession")
                .setCallback(
                    object : MediaSession.Callback {
                        @Deprecated("Media3 deprecates this callback but still invokes it for player command gating.")
                        @Suppress("DEPRECATION")
                        override fun onPlayerCommandRequest(
                            session: MediaSession,
                            controllerInfo: MediaSession.ControllerInfo,
                            playerCommand: Int,
                        ): Int {
                            trace(
                                "player_command_request",
                                "playerCommand" to playerCommand,
                                "playWhenReady" to player?.playWhenReady,
                                "isPlaying" to player?.isPlaying,
                                "playbackState" to player?.playbackState,
                                "nativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(controller?.activeNativeSessionId()),
                            )
                            if (playerCommand == Player.COMMAND_STOP) {
                                handleSystemStop()
                                return SessionResult.RESULT_SUCCESS
                            }
                            return SessionResult.RESULT_SUCCESS
                        }
                    },
                )
                .build()
        player = exoPlayer
        mediaSession = session
        controller = ChromVoidAudioPlayerController(
            engine = ChromVoidAudioPlayerController.ExoPlayerEngine(exoPlayer),
            onTerminal = { stopAudioService() },
        )
    }

    private fun addMediaSessionIfNeeded() {
        val session = mediaSession ?: return
        if (sessionAdded) return
        if (isSessionAdded(session)) {
            sessionAdded = true
            return
        }
        addSession(session)
        sessionAdded = true
    }

    private fun scheduleWarmupIdleStop() {
        cancelWarmupIdleStop()
        mainHandler.postDelayed(warmupIdleStop, WARMUP_IDLE_STOP_MS)
    }

    private fun cancelWarmupIdleStop() {
        mainHandler.removeCallbacks(warmupIdleStop)
    }

    private fun handleSystemStop() {
        val sessionId = controller?.activeNativeSessionId()
        if (sessionId != null) {
            trace(
                "system_stop",
                "nativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(sessionId),
            )
            controller?.releaseWithTerminalEvent("system_stop")
        }
        stopAudioService()
    }

    private fun stopAudioService(releaseEventReason: String? = null) {
        cancelWarmupIdleStop()
        trace(
            "service_stop",
            "nativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(controller?.activeNativeSessionId()),
            "releaseEventReason" to releaseEventReason,
        )
        if (releaseEventReason != null) {
            controller?.releaseWithTerminalEvent(releaseEventReason)
        } else {
            controller?.release()
        }
        controller = null
        mediaSession?.let { session ->
            if (sessionAdded) {
                removeSession(session)
                sessionAdded = false
            }
            session.release()
        }
        mediaSession = null
        player?.release()
        player = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    internal fun setPlaybackOngoingCheckerForTests(checker: (() -> Boolean)?) {
        playbackOngoingCheckerForTests = checker
    }

    internal fun handleSystemStopForTests() {
        handleSystemStop()
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

    companion object {
        const val ACTION_WARMUP = "com.chromvoid.app.audio.WARMUP"
        const val ACTION_COMMAND = "com.chromvoid.app.audio.COMMAND"
        const val EXTRA_COMMAND_JSON = "com.chromvoid.app.extra.AUDIO_COMMAND_JSON"
        internal const val WARMUP_IDLE_STOP_MS = 60_000L
        private const val TAG = "ChromVoid/AudioPlayback"
        private const val ERR_NATIVE_AUDIO_COMMAND_FAILED = "ERR_NATIVE_AUDIO_COMMAND_FAILED"
        private const val ERR_NATIVE_AUDIO_COMMAND_INVALID_JSON = "ERR_NATIVE_AUDIO_COMMAND_INVALID_JSON"
        private const val ERR_NATIVE_AUDIO_COMMAND_REJECTED = "ERR_NATIVE_AUDIO_COMMAND_REJECTED"
    }
}
