package com.chromvoid.app

import android.app.Service
import android.content.Intent
import android.os.Bundle
import android.os.Looper
import androidx.media3.session.MediaSession
import com.chromvoid.app.nativebridge.AudioPlaybackNativeShell
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.android.controller.ServiceController
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.util.concurrent.TimeUnit

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChromVoidAudioSessionServiceTest {
    @Before
    fun setUp() {
        AudioPlaybackNativeShell.setAudioSourceReleaserForTests {}
        AudioPlaybackNativeShell.setAudioPlayerEventEmitterForTests {}
    }

    @After
    fun tearDown() {
        AudioPlaybackNativeShell.resetPendingDispatchAcksForTests()
    }

    @Test
    fun onCreateCreatesSingleSessionExposedToMedia3Controllers() {
        withService { service ->
            val controllerInfo = testControllerInfo()

            val first = service.onGetSession(controllerInfo)
            val second = service.onGetSession(controllerInfo)

            assertNotNull(first)
            assertSame(first, second)
            assertTrue(service.getSessions().size <= 1)
        }
    }

    @Test
    fun acceptedStartCommandAddsMediaSessionOnceAndReturnsSticky() {
        withService { service ->
            val startMode = service.onStartCommand(commandIntent(startSessionJson()), 0, 1)
            val secondStartMode = service.onStartCommand(commandIntent(playJson()), 0, 2)

            assertEquals(Service.START_STICKY, startMode)
            assertEquals(Service.START_STICKY, secondStartMode)
            assertEquals(1, service.getSessions().distinct().size)
            assertSame(service.onGetSession(testControllerInfo()), service.getSessions().distinct().single())
        }
    }

    @Test
    fun warmupCreatesSessionWithoutAddingActiveMediaSession() {
        withService { service ->
            val mode = service.onStartCommand(warmupIntent(), 0, 1)

            assertEquals(Service.START_NOT_STICKY, mode)
            assertNotNull(service.onGetSession(testControllerInfo()))
            assertTrue(service.getSessions().isEmpty())
            assertFalse(shadowOf(service).isStoppedBySelf)
        }
    }

    @Test
    fun warmupIdleStopReleasesServiceWhenPlaybackNeverStarts() {
        withService { service ->
            service.onStartCommand(warmupIntent(), 0, 1)

            shadowOf(Looper.getMainLooper())
                .idleFor(ChromVoidAudioSessionService.WARMUP_IDLE_STOP_MS + 1, TimeUnit.MILLISECONDS)

            assertTrue(shadowOf(service).isStoppedBySelf)
            assertTrue(service.getSessions().isEmpty())
        }
    }

    @Test
    fun onTaskRemovedLeavesActivePlaybackServiceRunning() {
        withService { service ->
            service.setPlaybackOngoingCheckerForTests { true }

            service.onTaskRemoved(Intent())

            assertFalse(shadowOf(service).isStoppedBySelf)
        }
    }

    @Test
    fun onTaskRemovedStopsWhenPlaybackIsNotOngoing() {
        withService { service ->
            service.setPlaybackOngoingCheckerForTests { false }

            service.onTaskRemoved(Intent())

            assertTrue(shadowOf(service).isStoppedBySelf)
            assertTrue(service.getSessions().isEmpty())
        }
    }

    @Test
    fun terminalStopReleasesSessionAndStopsService() {
        withService { service ->
            service.onStartCommand(commandIntent(startSessionJson()), 0, 1)
            val stopMode = service.onStartCommand(commandIntent(stopJson()), 0, 2)

            assertEquals(Service.START_NOT_STICKY, stopMode)
            assertTrue(service.getSessions().isEmpty())
            assertTrue(shadowOf(service).isStoppedBySelf)
        }
    }

    @Test
    fun onDestroyEmitsServiceDestroyedReleaseForActiveSessionOnce() {
        val events = mutableListOf<JSONObject>()
        AudioPlaybackNativeShell.setAudioPlayerEventEmitterForTests { events.add(JSONObject(it)) }

        withService { service ->
            service.onStartCommand(commandIntent(startSessionJson()), 0, 1)
            events.clear()

            service.onDestroy()
            service.onDestroy()

            val released = events.filter { it.optString("event") == "released" }
            assertEquals(1, released.size)
            assertEquals("service_destroyed", released.single().getString("reason"))
            assertEquals(41L, released.single().getLong("trackId"))
            assertEquals(77L, released.single().getLong("sourceRevision"))
        }
    }

    @Test
    fun systemStopEmitsReleasedReasonAndStopsService() {
        val events = mutableListOf<JSONObject>()
        AudioPlaybackNativeShell.setAudioPlayerEventEmitterForTests { events.add(JSONObject(it)) }

        withService { service ->
            service.onStartCommand(commandIntent(startSessionJson()), 0, 1)
            events.clear()

            service.handleSystemStopForTests()

            val released = events.filter { it.optString("event") == "released" }
            assertEquals(1, released.size)
            assertEquals("system_stop", released.single().getString("reason"))
            assertEquals(Service.START_NOT_STICKY, service.onStartCommand(commandIntent(stopJson()), 0, 2))
            assertTrue(service.getSessions().isEmpty())
            assertTrue(shadowOf(service).isStoppedBySelf)
        }
    }

    private fun withService(block: (ChromVoidAudioSessionService) -> Unit) {
        val controller: ServiceController<ChromVoidAudioSessionService> =
            Robolectric.buildService(ChromVoidAudioSessionService::class.java)
        val service = controller.create().get()
        try {
            block(service)
        } finally {
            controller.destroy()
        }
    }

    private fun testControllerInfo(): MediaSession.ControllerInfo =
        MediaSession.ControllerInfo.createTestOnlyControllerInfo(
            "com.chromvoid.test",
            1,
            1,
            1,
            0,
            true,
            Bundle.EMPTY,
            true,
        )

    private fun commandIntent(commandJson: String): Intent =
        Intent()
            .setAction(ChromVoidAudioSessionService.ACTION_COMMAND)
            .putExtra(ChromVoidAudioSessionService.EXTRA_COMMAND_JSON, commandJson)

    private fun warmupIntent(): Intent =
        Intent()
            .setAction(ChromVoidAudioSessionService.ACTION_WARMUP)

    private fun startSessionJson(): String =
        JSONObject()
            .put("command", "startSession")
            .put("nativeSessionId", "native-1")
            .put("tracks", JSONArray().put(trackJson()))
            .put("index", 0)
            .put("autoplay", true)
            .toString()

    private fun playJson(): String =
        JSONObject()
            .put("command", "play")
            .put("nativeSessionId", "native-1")
            .toString()

    private fun stopJson(): String =
        JSONObject()
            .put("command", "stop")
            .put("nativeSessionId", "native-1")
            .toString()

    private fun trackJson(): JSONObject =
        JSONObject()
            .put("trackId", 41L)
            .put("systemTitle", AudioPlaybackCommand.SYSTEM_TITLE)
            .put("mimeType", "audio/mpeg")
            .put("size", 1234L)
            .put("sourceRevision", 77L)
            .put("sourceToken", "opaque-token")
}
