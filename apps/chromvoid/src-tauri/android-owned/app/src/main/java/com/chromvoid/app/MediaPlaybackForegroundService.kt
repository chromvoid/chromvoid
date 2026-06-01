package com.chromvoid.app

import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import android.view.KeyEvent
import com.chromvoid.app.shared.ForegroundServiceSupport
import com.chromvoid.app.shared.NativeBridgeTaskDispatcher
import com.chromvoid.app.shared.NativeRuntimeLoader
import java.util.concurrent.atomic.AtomicLong

class MediaPlaybackForegroundService : Service() {
    private lateinit var mediaSession: MediaSession
    private val mainHandler = Handler(Looper.getMainLooper())
    private val traceSeq = AtomicLong()
    private val playbackStateStore = MediaPlaybackStateStore(LOCAL_PLAYBACK_STATE_TIMEOUT_MS)
    private var lastNotificationKey: String? = null
    private var foregroundStarted = false
    private val notificationBuilder by lazy { MediaPlaybackNotificationBuilder(this) }

    override fun onCreate() {
        super.onCreate()
        notificationBuilder.ensureChannel()
        mediaSession =
            MediaSession(this, "ChromVoidMediaPlayback").apply {
                setCallback(
                    object : MediaSession.Callback() {
                        override fun onPlay() {
                            runOnMainThread {
                                applyLocalPlaybackStateRequestAndEmit("playing", NATIVE_ACTION_PLAY)
                            }
                        }

                        override fun onPause() {
                            runOnMainThread {
                                applyLocalPlaybackStateRequestAndEmit("paused", NATIVE_ACTION_PAUSE)
                            }
                        }

                        override fun onMediaButtonEvent(mediaButtonIntent: Intent): Boolean {
                            val event =
                                mediaButtonIntent.getParcelableExtra<KeyEvent>(Intent.EXTRA_KEY_EVENT)
                                    ?: return super.onMediaButtonEvent(mediaButtonIntent)
                            return handleMediaButton(event) || super.onMediaButtonEvent(mediaButtonIntent)
                        }

                        override fun onSkipToNext() =
                            runOnMainThread { emitNativeAction(NATIVE_ACTION_NEXT) }

                        override fun onSkipToPrevious() =
                            runOnMainThread { emitNativeAction(NATIVE_ACTION_PREVIOUS) }

                        override fun onSeekTo(pos: Long) {
                            runOnMainThread {
                                applyLocalPosition(pos)
                                emitNativeAction(NATIVE_ACTION_SEEK_TO, pos)
                            }
                        }

                        override fun onStop() {
                            runOnMainThread {
                                emitNativeAction(NATIVE_ACTION_STOP)
                                stopPlaybackService()
                            }
                        }
                    },
                    mainHandler,
                )
            }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        trace("startCommand", "action" to action, "startId" to startId)

        when (action) {
            ACTION_UPDATE -> {
                val snapshot = intent.getStringExtra(EXTRA_SNAPSHOT)?.let(MediaSnapshot::fromJson)
                trace(
                    "actionUpdate",
                    "parsed" to (snapshot != null),
                    "active" to snapshot?.active,
                    "trackId" to snapshot?.trackId,
                    "playbackState" to snapshot?.playbackState,
                    "pendingState" to playbackStateStore.pendingPlaybackState,
                )
                if (snapshot == null || !snapshot.active) {
                    trace("actionUpdateStop", "reason" to "inactive_or_invalid")
                    stopPlaybackService()
                    return START_NOT_STICKY
                }
                val reconciled =
                    playbackStateStore.reconcileIncomingSnapshot(
                        snapshot,
                        SystemClock.elapsedRealtime(),
                    )
                traceReconcileDecision(reconciled.decision)
                if (!applySnapshot(reconciled.snapshot)) {
                    return START_NOT_STICKY
                }
            }
            ACTION_PLAY -> {
                trace("controlAction", "source" to "pendingIntent", "requestedState" to "playing")
                applyLocalPlaybackStateRequestAndEmit("playing", NATIVE_ACTION_PLAY)
            }
            ACTION_PAUSE -> {
                trace("controlAction", "source" to "pendingIntent", "requestedState" to "paused")
                applyLocalPlaybackStateRequestAndEmit("paused", NATIVE_ACTION_PAUSE)
            }
            ACTION_TOGGLE -> {
                trace("controlAction", "source" to "pendingIntent", "requestedState" to "toggle")
                applyTogglePlaybackStateRequest("pendingIntent")
            }
            ACTION_NEXT -> emitNativeAction(NATIVE_ACTION_NEXT)
            ACTION_PREVIOUS -> emitNativeAction(NATIVE_ACTION_PREVIOUS)
            ACTION_STOP -> {
                trace("controlAction", "source" to "pendingIntent", "requestedState" to "stopped")
                emitNativeAction(NATIVE_ACTION_STOP)
                stopPlaybackService()
                return START_NOT_STICKY
            }
            else -> {
                trace("startCommandStop", "reason" to "unknown_action")
                stopPlaybackService()
                return START_NOT_STICKY
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        mainHandler.removeCallbacksAndMessages(null)
        playbackStateStore.clear()
        lastNotificationKey = null
        stopForegroundIfStarted()
        if (::mediaSession.isInitialized) {
            mediaSession.isActive = false
            mediaSession.release()
        }
        super.onDestroy()
    }

    private fun applySnapshot(snapshot: MediaSnapshot): Boolean {
        applyMediaSessionSnapshot(snapshot, "applySnapshot")
        return updateForegroundNotification(snapshot)
    }

    private fun applyMediaSessionSnapshot(
        snapshot: MediaSnapshot,
        traceEvent: String,
    ) {
        playbackStateStore.applySnapshot(snapshot)
        trace(
            traceEvent,
            "trackId" to snapshot.trackId,
            "playbackState" to snapshot.playbackState,
            "nativeState" to MediaPlaybackStateFactory.toNativePlaybackState(snapshot.playbackState),
            "toggleAction" to if (snapshot.isActivelyPlaying()) "Pause" else "Play",
            "pendingState" to playbackStateStore.pendingPlaybackState,
        )
        mediaSession.setMetadata(
            MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, snapshot.title)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, snapshot.durationMs)
                .build(),
        )
        mediaSession.setPlaybackState(MediaPlaybackStateFactory.build(snapshot, SystemClock.elapsedRealtime()))
        mediaSession.isActive = true
    }

    private fun updateForegroundNotification(snapshot: MediaSnapshot): Boolean {
        val notificationKey = snapshot.notificationKey()
        if (foregroundStarted && notificationKey == lastNotificationKey) {
            trace(
                "notificationSkipped",
                "reason" to "same_key",
                "trackId" to snapshot.trackId,
                "playbackState" to snapshot.playbackState,
            )
            return true
        }

        val notification = notificationBuilder.build(snapshot, mediaSession.sessionToken)
        if (foregroundStarted) {
            getSystemService(NotificationManager::class.java)?.notify(NOTIFICATION_ID, notification)
            lastNotificationKey = notificationKey
            return true
        }

        val started =
            ForegroundServiceSupport.enterForeground(
                this,
                NOTIFICATION_ID,
                notification,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                } else {
                    null
                },
                TAG,
            )
        if (!started) {
            trace("notificationStartFailed", "trackId" to snapshot.trackId)
            stopPlaybackService()
            return false
        }
        lastNotificationKey = notificationKey
        foregroundStarted = true
        return true
    }

    private fun applyLocalPlaybackStateRequestAndEmit(
        playbackState: String,
        nativeAction: String,
    ) {
        if (!applyLocalPlaybackStateRequest(playbackState, updateNotification = false)) return

        emitNativeAction(nativeAction)
        playbackStateStore.currentSnapshot?.let(::updateForegroundNotification)
    }

    private fun applyLocalPlaybackStateRequest(
        playbackState: String,
        updateNotification: Boolean = true,
    ): Boolean {
        val result =
            playbackStateStore.requestLocalPlaybackState(
                playbackState,
                SystemClock.elapsedRealtime(),
            )
        if (result == MediaPlaybackLocalStateResult.Ignored) {
            trace(
                "localPlaybackStateRequest",
                "requestedState" to playbackState,
                "decision" to "ignored_no_snapshot",
            )
            return false
        }
        val applied = result as MediaPlaybackLocalStateResult.Applied
        trace(
            "localPlaybackStateRequest",
            "requestedState" to playbackState,
            "trackId" to applied.previousSnapshot.trackId,
            "previousState" to applied.previousSnapshot.playbackState,
            "pendingState" to applied.pending.playbackState,
        )
        if (updateNotification) {
            return applySnapshot(applied.snapshot)
        } else {
            applyLocalPlaybackStateSnapshot(applied.snapshot)
        }
        return true
    }

    private fun applyLocalPlaybackStateSnapshot(snapshot: MediaSnapshot) {
        playbackStateStore.applySnapshot(snapshot)
        trace(
            "applyLocalSnapshot",
            "trackId" to snapshot.trackId,
            "playbackState" to snapshot.playbackState,
            "nativeState" to MediaPlaybackStateFactory.toNativePlaybackState(snapshot.playbackState),
            "toggleAction" to if (snapshot.isActivelyPlaying()) "Pause" else "Play",
            "pendingState" to playbackStateStore.pendingPlaybackState,
        )
        mediaSession.setPlaybackState(MediaPlaybackStateFactory.build(snapshot, SystemClock.elapsedRealtime()))
        mediaSession.isActive = true
    }

    private fun applyLocalPosition(positionMs: Long) {
        val snapshot = playbackStateStore.applyLocalPosition(positionMs) ?: return
        applySnapshot(snapshot)
    }

    private fun handleMediaButton(event: KeyEvent): Boolean {
        if (
            event.keyCode != KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE &&
            event.keyCode != KeyEvent.KEYCODE_MEDIA_PLAY &&
            event.keyCode != KeyEvent.KEYCODE_MEDIA_PAUSE
        ) {
            return false
        }

        trace(
            "mediaButton",
            "keyCode" to keyCodeLabel(event.keyCode),
            "eventAction" to keyEventActionLabel(event.action),
            "currentState" to playbackStateStore.currentSnapshot?.playbackState,
            "pendingState" to playbackStateStore.pendingPlaybackState,
        )

        if (event.action != KeyEvent.ACTION_DOWN) {
            return true
        }

        runOnMainThread { applyMediaButtonAction(event.keyCode) }
        return true
    }

    private fun applyMediaButtonAction(keyCode: Int) {
        when (keyCode) {
            KeyEvent.KEYCODE_MEDIA_PLAY -> {
                trace(
                    "mediaButtonAction",
                    "keyCode" to keyCodeLabel(keyCode),
                    "requestedState" to "playing",
                    "currentState" to playbackStateStore.currentSnapshot?.playbackState,
                )
                applyLocalPlaybackStateRequestAndEmit("playing", NATIVE_ACTION_PLAY)
            }
            KeyEvent.KEYCODE_MEDIA_PAUSE -> {
                trace(
                    "mediaButtonAction",
                    "keyCode" to keyCodeLabel(keyCode),
                    "requestedState" to "paused",
                    "currentState" to playbackStateStore.currentSnapshot?.playbackState,
                )
                applyLocalPlaybackStateRequestAndEmit("paused", NATIVE_ACTION_PAUSE)
            }
            else -> {
                trace(
                    "mediaButtonAction",
                    "keyCode" to keyCodeLabel(keyCode),
                    "requestedState" to "toggle",
                    "currentState" to playbackStateStore.currentSnapshot?.playbackState,
                )
                applyTogglePlaybackStateRequest("mediaButton")
            }
        }
    }

    private fun applyTogglePlaybackStateRequest(source: String) {
        if (playbackStateStore.currentSnapshot?.isActivelyPlaying() == true) {
            trace(
                "togglePlaybackStateRequest",
                "source" to source,
                "requestedState" to "paused",
                "currentState" to playbackStateStore.currentSnapshot?.playbackState,
            )
            applyLocalPlaybackStateRequestAndEmit("paused", NATIVE_ACTION_PAUSE)
            return
        }

        trace(
            "togglePlaybackStateRequest",
            "source" to source,
            "requestedState" to "playing",
            "currentState" to playbackStateStore.currentSnapshot?.playbackState,
        )
        applyLocalPlaybackStateRequestAndEmit("playing", NATIVE_ACTION_PLAY)
    }

    private fun traceReconcileDecision(decision: MediaPlaybackReconcileDecision?) {
        if (decision == null) return
        when (decision.decision) {
            "track_changed" ->
            trace(
                "reconcileSnapshot",
                "decision" to "track_changed",
                "trackId" to decision.trackId,
                "incomingState" to decision.incomingState,
                "pendingTrackId" to decision.pendingTrackId,
                "pendingState" to decision.pendingState,
            )
            "expired" ->
            trace(
                "reconcileSnapshot",
                "decision" to "expired",
                "trackId" to decision.trackId,
                "incomingState" to decision.incomingState,
                "pendingState" to decision.pendingState,
                "expiredByMs" to decision.expiredByMs,
            )
            "match" ->
            trace(
                "reconcileSnapshot",
                "decision" to "match",
                "trackId" to decision.trackId,
                "incomingState" to decision.incomingState,
                "pendingState" to decision.pendingState,
                "remainingMs" to decision.remainingMs,
            )
            "hold_pending" ->
                trace(
                    "reconcileSnapshot",
                    "decision" to "hold_pending",
                    "trackId" to decision.trackId,
                    "incomingState" to decision.incomingState,
                    "pendingState" to decision.pendingState,
                    "remainingMs" to decision.remainingMs,
                )
        }
    }

    private fun keyCodeLabel(keyCode: Int): String =
        when (keyCode) {
            KeyEvent.KEYCODE_MEDIA_PLAY -> "MEDIA_PLAY"
            KeyEvent.KEYCODE_MEDIA_PAUSE -> "MEDIA_PAUSE"
            KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> "MEDIA_PLAY_PAUSE"
            else -> keyCode.toString()
        }

    private fun keyEventActionLabel(action: Int): String =
        when (action) {
            KeyEvent.ACTION_DOWN -> "ACTION_DOWN"
            KeyEvent.ACTION_UP -> "ACTION_UP"
            else -> action.toString()
        }

    private fun runOnMainThread(action: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            action()
        } else {
            mainHandler.post(action)
        }
    }

    private fun stopPlaybackService() {
        trace(
            "stopPlaybackService",
            "trackId" to playbackStateStore.currentSnapshot?.trackId,
            "playbackState" to playbackStateStore.currentSnapshot?.playbackState,
            "pendingState" to playbackStateStore.pendingPlaybackState,
        )
        mainHandler.removeCallbacksAndMessages(null)
        playbackStateStore.clear()
        lastNotificationKey = null
        if (::mediaSession.isInitialized) {
            mediaSession.isActive = false
        }
        stopForegroundIfStarted()
        stopSelf()
    }

    private fun stopForegroundIfStarted() {
        if (!foregroundStarted) return
        runCatching {
            stopForeground(STOP_FOREGROUND_REMOVE)
        }.onFailure { error ->
            Log.w(TAG, "Failed to stop media playback foreground notification", error)
        }
        foregroundStarted = false
    }

    private fun emitNativeAction(action: String, positionMs: Long = POSITION_UNSET) {
        trace(
            "emitNativeAction",
            "action" to action,
            "positionMs" to positionMs,
            "trackId" to playbackStateStore.currentSnapshot?.trackId,
            "playbackState" to playbackStateStore.currentSnapshot?.playbackState,
            "pendingState" to playbackStateStore.pendingPlaybackState,
        )
        NativeBridgeTaskDispatcher.execute("media_playback.$action") {
            NativeRuntimeLoader.runWhenLoaded(TAG) { nativeOnMediaSessionAction(action, positionMs) }
        }.also { accepted ->
            if (!accepted) {
                Log.w(TAG, "Dropped media session action because bridge dispatcher is full: $action")
            }
        }
    }

    private fun trace(event: String, vararg fields: Pair<String, Any?>) {
        if (!BuildConfig.DEBUG) return

        val suffix =
            fields.joinToString(" ") { (key, value) ->
                "$key=${traceValue(value)}"
            }
        Log.i(
            TAG,
            "seq=${traceSeq.incrementAndGet()} elapsedMs=${SystemClock.elapsedRealtime()} " +
                "thread=${traceValue(Thread.currentThread().name)} event=$event $suffix",
        )
    }

    private fun traceValue(value: Any?): String = value?.toString()?.replace('\n', ' ') ?: "null"

    internal fun playbackStateForTests(): PlaybackState? =
        playbackStateStore.currentSnapshot?.let {
            MediaPlaybackStateFactory.build(it, SystemClock.elapsedRealtime())
        }

    internal fun handleMediaButtonForTests(event: KeyEvent): Boolean = handleMediaButton(event)

    private external fun nativeOnMediaSessionAction(action: String, positionMs: Long)

    companion object {
        private const val TAG = "ChromVoid/MediaPlayback"
        const val CHANNEL_ID = "chromvoid_media_playback"
        const val NOTIFICATION_ID = 1002

        const val ACTION_UPDATE = "com.chromvoid.app.ACTION_UPDATE_MEDIA_PLAYBACK"
        const val ACTION_PLAY = "com.chromvoid.app.ACTION_MEDIA_PLAY"
        const val ACTION_PAUSE = "com.chromvoid.app.ACTION_MEDIA_PAUSE"
        const val ACTION_TOGGLE = "com.chromvoid.app.ACTION_MEDIA_TOGGLE_PLAY_PAUSE"
        const val ACTION_NEXT = "com.chromvoid.app.ACTION_MEDIA_NEXT"
        const val ACTION_PREVIOUS = "com.chromvoid.app.ACTION_MEDIA_PREVIOUS"
        const val ACTION_STOP = "com.chromvoid.app.ACTION_MEDIA_STOP"

        const val EXTRA_SNAPSHOT = "snapshot"

        private const val LOCAL_PLAYBACK_STATE_TIMEOUT_MS = 1_500L
        private const val POSITION_UNSET = -1L

        private const val NATIVE_ACTION_PLAY = "play"
        private const val NATIVE_ACTION_PAUSE = "pause"
        private const val NATIVE_ACTION_STOP = "stop"
        private const val NATIVE_ACTION_NEXT = "next"
        private const val NATIVE_ACTION_PREVIOUS = "previous"
        private const val NATIVE_ACTION_SEEK_TO = "seekTo"

        @JvmStatic
        fun update(context: Context, snapshotJson: String) {
            val intent =
                Intent(context, MediaPlaybackForegroundService::class.java).apply {
                    action = ACTION_UPDATE
                    putExtra(EXTRA_SNAPSHOT, snapshotJson)
                }
            ForegroundServiceSupport.startForegroundService(context, intent, TAG)
        }

        @JvmStatic
        fun stop(context: Context) {
            context.stopService(Intent(context, MediaPlaybackForegroundService::class.java))
        }

    }
}
