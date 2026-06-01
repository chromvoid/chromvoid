package com.chromvoid.app

import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.session.PlaybackState
import android.os.Looper
import android.view.KeyEvent
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.shared.ForegroundServiceSupport
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MediaPlaybackForegroundServiceTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @After
    fun tearDown() {
        ForegroundServiceSupport.resetForTests()
    }

    @Test
    fun updateAction_entersForegroundWithMediaNotification() {
        val service =
            Robolectric.buildService(MediaPlaybackForegroundService::class.java)
                .create()
                .get()

        updateSnapshot(service, "Song A", "playing")

        val shadow = shadowOf(service)
        assertEquals(MediaPlaybackForegroundService.NOTIFICATION_ID, shadow.lastForegroundNotificationId)
        assertNotNull(shadow.lastForegroundNotification)
        assertFalse(shadow.isForegroundStopped)
        assertEquals(
            "Song A",
            shadow.lastForegroundNotification.extras.getString(Notification.EXTRA_TITLE),
        )
        assertEquals(Notification.CATEGORY_TRANSPORT, shadow.lastForegroundNotification.category)
    }

    @Test
    fun pausedSnapshotExposesTransportPlaybackStateActions() {
        val service =
            Robolectric.buildService(MediaPlaybackForegroundService::class.java)
                .create()
                .get()

        updateSnapshot(service, "Song A", "paused")

        val state = playbackState(service)
        assertEquals(PlaybackState.STATE_PAUSED, state.state)
        assertEquals(0f, state.playbackSpeed, 0f)
        assertPlaybackAction(state, PlaybackState.ACTION_PLAY)
        assertPlaybackAction(state, PlaybackState.ACTION_PAUSE)
        assertPlaybackAction(state, PlaybackState.ACTION_PLAY_PAUSE)
        assertTrue(state.lastPositionUpdateTime > 0L)
        assertTrue(notificationActionTitles(currentNotification(service)).contains("Play"))
        assertFalse(notificationActionTitles(currentNotification(service)).contains("Pause"))
    }

    @Test
    fun playingSnapshotExposesTransportPlaybackStateActions() {
        val service =
            Robolectric.buildService(MediaPlaybackForegroundService::class.java)
                .create()
                .get()

        updateSnapshot(service, "Song A", "playing")

        val state = playbackState(service)
        assertEquals(PlaybackState.STATE_PLAYING, state.state)
        assertEquals(1f, state.playbackSpeed, 0f)
        assertPlaybackAction(state, PlaybackState.ACTION_PLAY)
        assertPlaybackAction(state, PlaybackState.ACTION_PAUSE)
        assertPlaybackAction(state, PlaybackState.ACTION_PLAY_PAUSE)
        assertTrue(state.lastPositionUpdateTime > 0L)
        assertTrue(notificationActionTitles(currentNotification(service)).contains("Pause"))
        assertFalse(notificationActionTitles(currentNotification(service)).contains("Play"))
    }

    @Test
    fun pauseActionUpdatesForegroundNotificationImmediately() {
        val service =
            Robolectric.buildService(MediaPlaybackForegroundService::class.java)
                .create()
                .get()

        updateSnapshot(service, "Song A", "playing")

        service.onStartCommand(
            Intent(context, MediaPlaybackForegroundService::class.java).apply {
                action = MediaPlaybackForegroundService.ACTION_PAUSE
            },
            0,
            1,
        )

        val shadow = shadowOf(service)
        assertFalse(shadow.isStoppedBySelf)
        assertTrue(notificationActionTitles(currentNotification(service)).contains("Play"))
        assertFalse(notificationActionTitles(currentNotification(service)).contains("Pause"))
        assertEquals(android.R.drawable.ic_media_play, toggleAction(currentNotification(service)).icon)
        assertPlaybackAction(playbackState(service), PlaybackState.ACTION_PLAY)
        assertPlaybackAction(playbackState(service), PlaybackState.ACTION_PAUSE)
    }

    @Test
    fun playActionUpdatesForegroundNotificationImmediately() {
        val service =
            Robolectric.buildService(MediaPlaybackForegroundService::class.java)
                .create()
                .get()

        updateSnapshot(service, "Song A", "paused")

        service.onStartCommand(
            Intent(context, MediaPlaybackForegroundService::class.java).apply {
                action = MediaPlaybackForegroundService.ACTION_PLAY
            },
            0,
            2,
        )

        val shadow = shadowOf(service)
        assertFalse(shadow.isStoppedBySelf)
        assertTrue(notificationActionTitles(currentNotification(service)).contains("Pause"))
        assertFalse(notificationActionTitles(currentNotification(service)).contains("Play"))
        assertEquals(android.R.drawable.ic_media_pause, toggleAction(currentNotification(service)).icon)
        assertPlaybackAction(playbackState(service), PlaybackState.ACTION_PAUSE)
        assertPlaybackAction(playbackState(service), PlaybackState.ACTION_PLAY)
    }

    @Test
    fun singleTrackToggleUsesStablePendingIntentAcrossPlayPause() {
        val service =
            Robolectric.buildService(MediaPlaybackForegroundService::class.java)
                .create()
                .get()

        updateSnapshot(service, "Song A", "paused", hasPrevious = false, hasNext = false)

        val pausedNotification = currentNotification(service)
        assertEquals(listOf("Play", "Stop"), notificationActionTitles(pausedNotification))
        assertEquals(MediaPlaybackForegroundService.ACTION_TOGGLE, togglePendingIntentAction(pausedNotification))
        assertEquals(android.R.drawable.ic_media_play, toggleAction(pausedNotification).icon)

        service.onStartCommand(
            Intent(context, MediaPlaybackForegroundService::class.java).apply {
                action = MediaPlaybackForegroundService.ACTION_TOGGLE
            },
            0,
            3,
        )

        val playingNotification = currentNotification(service)
        assertEquals(listOf("Pause", "Stop"), notificationActionTitles(playingNotification))
        assertEquals(MediaPlaybackForegroundService.ACTION_TOGGLE, togglePendingIntentAction(playingNotification))
        assertEquals(android.R.drawable.ic_media_pause, toggleAction(playingNotification).icon)
        assertEquals(PlaybackState.STATE_PLAYING, playbackState(service).state)

        service.onStartCommand(
            Intent(context, MediaPlaybackForegroundService::class.java).apply {
                action = MediaPlaybackForegroundService.ACTION_TOGGLE
            },
            0,
            4,
        )

        val pausedAgainNotification = currentNotification(service)
        assertEquals(listOf("Play", "Stop"), notificationActionTitles(pausedAgainNotification))
        assertEquals(MediaPlaybackForegroundService.ACTION_TOGGLE, togglePendingIntentAction(pausedAgainNotification))
        assertEquals(android.R.drawable.ic_media_play, toggleAction(pausedAgainNotification).icon)
        assertEquals(PlaybackState.STATE_PAUSED, playbackState(service).state)
    }

    @Test
    fun mediaSessionPlayPauseTogglesPausedSnapshotToPlaying() {
        val service =
            Robolectric.buildService(MediaPlaybackForegroundService::class.java)
                .create()
                .get()

        updateSnapshot(service, "Song A", "paused")

        handleMediaButton(service, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)

        assertTrue(notificationActionTitles(currentNotification(service)).contains("Pause"))
        assertFalse(notificationActionTitles(currentNotification(service)).contains("Play"))
        assertEquals(android.R.drawable.ic_media_pause, toggleAction(currentNotification(service)).icon)
        assertPlaybackAction(playbackState(service), PlaybackState.ACTION_PAUSE)
        assertPlaybackAction(playbackState(service), PlaybackState.ACTION_PLAY)
    }

    @Test
    fun mediaButtonFromBackgroundThreadIsAppliedOnMainHandler() {
        val service =
            Robolectric.buildService(MediaPlaybackForegroundService::class.java)
                .create()
                .get()

        updateSnapshot(service, "Song A", "paused")

        assertTrue(handleMediaButtonFromBackground(service, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE))
        assertTrue(notificationActionTitles(currentNotification(service)).contains("Play"))

        shadowOf(Looper.getMainLooper()).idle()

        assertTrue(notificationActionTitles(currentNotification(service)).contains("Pause"))
        assertFalse(notificationActionTitles(currentNotification(service)).contains("Play"))
        assertEquals(PlaybackState.STATE_PLAYING, playbackState(service).state)
    }

    @Test
    fun mediaSessionPlayPauseTogglesPlayingSnapshotToPaused() {
        val service =
            Robolectric.buildService(MediaPlaybackForegroundService::class.java)
                .create()
                .get()

        updateSnapshot(service, "Song A", "playing")

        handleMediaButton(service, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)

        assertTrue(notificationActionTitles(currentNotification(service)).contains("Play"))
        assertFalse(notificationActionTitles(currentNotification(service)).contains("Pause"))
        assertEquals(android.R.drawable.ic_media_play, toggleAction(currentNotification(service)).icon)
        assertPlaybackAction(playbackState(service), PlaybackState.ACTION_PLAY)
        assertPlaybackAction(playbackState(service), PlaybackState.ACTION_PAUSE)
    }

    @Test
    fun staleSnapshotsDoNotOverrideNewerLocalPlayPauseRequests() {
        val service =
            Robolectric.buildService(MediaPlaybackForegroundService::class.java)
                .create()
                .get()

        updateSnapshot(service, "Song A", "playing")

        handleMediaButton(service, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)
        updateSnapshot(service, "Song A", "playing")

        assertTrue(notificationActionTitles(currentNotification(service)).contains("Play"))
        assertFalse(notificationActionTitles(currentNotification(service)).contains("Pause"))
        assertEquals(PlaybackState.STATE_PAUSED, playbackState(service).state)

        handleMediaButton(service, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)
        updateSnapshot(service, "Song A", "paused")

        assertTrue(notificationActionTitles(currentNotification(service)).contains("Pause"))
        assertFalse(notificationActionTitles(currentNotification(service)).contains("Play"))
        assertEquals(PlaybackState.STATE_PLAYING, playbackState(service).state)
    }

    @Test
    fun matchingSnapshotAfterLocalToggleDoesNotNotifyAgain() {
        val service =
            Robolectric.buildService(MediaPlaybackForegroundService::class.java)
                .create()
                .get()

        updateSnapshot(service, "Song A", "paused", hasPrevious = false, hasNext = false)
        handleMediaButton(service, KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE)

        val localNotification = currentNotification(service)

        updateSnapshot(service, "Song A", "playing", hasPrevious = false, hasNext = false)

        assertSame(localNotification, currentNotification(service))
        assertEquals(PlaybackState.STATE_PLAYING, playbackState(service).state)
    }

    @Test
    fun stopAction_stopsForegroundAndSelf() {
        val service =
            Robolectric.buildService(MediaPlaybackForegroundService::class.java)
                .create()
                .get()

        updateSnapshot(service, "Song A", "playing")

        service.onStartCommand(
            Intent(context, MediaPlaybackForegroundService::class.java).apply {
                action = MediaPlaybackForegroundService.ACTION_STOP
            },
            0,
            1,
        )

        val shadow = shadowOf(service)
        assertTrue(shadow.isForegroundStopped)
        assertTrue(shadow.isStoppedBySelf)
    }

    @Test
    fun internalStopStopsServiceWithoutUserStopIntent() {
        MediaPlaybackForegroundService.stop(context)

        val shadow = shadowOf(context as Application)
        val stoppedService = shadow.nextStoppedService
        assertEquals(MediaPlaybackForegroundService::class.java.name, stoppedService.component?.className)
        assertNull(stoppedService.action)
        assertNull(shadow.nextStartedService)
    }

    @Test
    fun inactiveSnapshot_stopsForegroundAndSelf() {
        val service =
            Robolectric.buildService(MediaPlaybackForegroundService::class.java)
                .create()
                .get()

        updateSnapshot(service, "Song A", "playing")

        service.onStartCommand(
            Intent(context, MediaPlaybackForegroundService::class.java).apply {
                action = MediaPlaybackForegroundService.ACTION_UPDATE
                putExtra(
                    MediaPlaybackForegroundService.EXTRA_SNAPSHOT,
                    """{"active":false,"title":"Song A","playbackState":"paused"}""",
                )
            },
            0,
            1,
        )

        val shadow = shadowOf(service)
        assertTrue(shadow.isForegroundStopped)
        assertTrue(shadow.isStoppedBySelf)
    }

    @Test
    fun updateActionStopsSelfWhenForegroundEntryFails() {
        ForegroundServiceSupport.setEnterForegroundForTests { _, _, _, _ ->
            throw SecurityException("denied")
        }
        val service =
            Robolectric.buildService(MediaPlaybackForegroundService::class.java)
                .create()
                .get()

        val mode =
            service.onStartCommand(
                Intent(context, MediaPlaybackForegroundService::class.java).apply {
                    action = MediaPlaybackForegroundService.ACTION_UPDATE
                    putExtra(
                        MediaPlaybackForegroundService.EXTRA_SNAPSHOT,
                        snapshotJson("Song A", "playing", hasPrevious = true, hasNext = true),
                    )
                },
                0,
                1,
            )

        val shadow = shadowOf(service)
        assertEquals(Service.START_NOT_STICKY, mode)
        assertTrue(shadow.isStoppedBySelf)
        assertNull(shadow.lastForegroundNotification)
    }

    private fun updateSnapshot(
        service: MediaPlaybackForegroundService,
        title: String,
        playbackState: String,
        hasPrevious: Boolean = true,
        hasNext: Boolean = true,
    ) {
        service.onStartCommand(
            Intent(context, MediaPlaybackForegroundService::class.java).apply {
                action = MediaPlaybackForegroundService.ACTION_UPDATE
                putExtra(
                    MediaPlaybackForegroundService.EXTRA_SNAPSHOT,
                    snapshotJson(title, playbackState, hasPrevious, hasNext),
                )
            },
            0,
            1,
        )
    }

    private fun snapshotJson(
        title: String,
        playbackState: String,
        hasPrevious: Boolean,
        hasNext: Boolean,
    ): String =
        """
        {
          "active": true,
          "trackId": 7,
          "title": "$title",
          "playbackState": "$playbackState",
          "positionMs": 1200,
          "durationMs": 60000,
          "canSeek": true,
          "hasPrevious": $hasPrevious,
          "hasNext": $hasNext
        }
        """.trimIndent()

    private fun notificationActionTitles(notification: Notification): List<String> {
        return notification.actions.map { action -> action.title.toString() }
    }

    private fun toggleAction(notification: Notification): Notification.Action {
        return notification.actions.first { action ->
            val title = action.title.toString()
            title == "Play" || title == "Pause"
        }
    }

    private fun togglePendingIntentAction(notification: Notification): String? {
        return shadowOf(toggleAction(notification).actionIntent).savedIntent.action
    }

    private fun currentNotification(service: MediaPlaybackForegroundService): Notification {
        val notificationManager = context.getSystemService(NotificationManager::class.java)
        return shadowOf(notificationManager).getNotification(MediaPlaybackForegroundService.NOTIFICATION_ID)
            ?: shadowOf(service).lastForegroundNotification
    }

    private fun playbackState(service: MediaPlaybackForegroundService): PlaybackState {
        return checkNotNull(service.playbackStateForTests())
    }

    private fun handleMediaButton(
        service: MediaPlaybackForegroundService,
        keyCode: Int,
    ): Boolean {
        return service.handleMediaButtonForTests(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
    }

    private fun handleMediaButtonFromBackground(
        service: MediaPlaybackForegroundService,
        keyCode: Int,
    ): Boolean {
        var handled = false
        val latch = CountDownLatch(1)
        Thread {
            handled = handleMediaButton(service, keyCode)
            latch.countDown()
        }.start()
        assertTrue(latch.await(2, TimeUnit.SECONDS))
        return handled
    }

    private fun assertPlaybackAction(state: PlaybackState, action: Long) {
        assertTrue(state.actions and action != 0L)
    }

}
