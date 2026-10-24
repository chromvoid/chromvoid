package com.chromvoid.app

import androidx.media3.common.C
import androidx.media3.common.Player
import androidx.media3.exoplayer.source.MediaSource
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChromVoidAudioPlayerControllerTest {
    @Test
    fun mediaItemUsesGenericSystemTitleOnly() {
        val item = ChromVoidAudioPlayerController.buildMediaItem(track())

        assertEquals("ChromVoid audio", item.mediaMetadata.title.toString())
        assertFalse(item.mediaMetadata.title.toString().contains("opaque-token"))
        assertFalse(item.localConfiguration?.uri.toString().contains("opaque-token"))
    }

    @Test
    fun releasedEventSerializesReasonWithoutPrivateMetadata() {
        val event =
            AudioPlaybackEvent.Released(
                nativeSessionId = "native-1",
                trackId = 41L,
                sourceRevision = 77L,
                reason = "service_destroyed",
            )

        val json = JSONObject(event.toJson())

        assertEquals("released", json.getString("event"))
        assertEquals("native-1", json.getString("nativeSessionId"))
        assertEquals(41L, json.getLong("trackId"))
        assertEquals(77L, json.getLong("sourceRevision"))
        assertEquals("service_destroyed", json.getString("reason"))
        assertFalse(json.toString().contains("opaque-token"))
        assertFalse(json.toString().contains("private-track-name"))
    }

    @Test
    fun mapsCommandsToPlayerEngineAndEvents() {
        val engine = FakeAudioPlayerEngine()
        val events = mutableListOf<JSONObject>()
        val released = mutableListOf<String>()
        val controller =
            ChromVoidAudioPlayerController(
                engine = engine,
                emitEvent = { events.add(JSONObject(it)) },
                releaseSource = released::add,
            )

        val start = startCommand(autoplay = false)
        val startResult = controller.handle(start)
        assertTrue(startResult.accepted)
        assertEquals(1, engine.setMediaSourcesCount)
        assertEquals(0, engine.currentMediaItemIndex)
        assertEquals(1, engine.prepareCount)
        assertEquals(1, engine.pauseCount)
        assertEquals("paused", events.last().getString("playbackState"))

        controller.handle(AudioPlaybackCommand.Play("native-1"))
        assertEquals(1, engine.playCount)
        assertEquals("play", events.last().getString("playbackIntent"))

        controller.handle(AudioPlaybackCommand.SeekTo("native-1", 42_000L))
        assertEquals(42_000L, engine.lastSeekPositionMs)

        controller.handle(AudioPlaybackCommand.SelectTrack("native-1", 0))
        assertEquals(0, engine.lastSelectedIndex)

        val stop = controller.handle(AudioPlaybackCommand.Stop("native-1"))
        assertTrue(stop.terminal)
        assertEquals(listOf("opaque-token"), released)
        assertEquals("stopped", events.last().getString("playbackState"))
    }

    @Test
    fun emitsProgressTicksWhilePlayingAndStopsWhenPaused() {
        val engine = FakeAudioPlayerEngine()
        val events = mutableListOf<JSONObject>()
        val ticker = FakeProgressTicker()
        val controller =
            ChromVoidAudioPlayerController(
                engine = engine,
                emitEvent = { events.add(JSONObject(it)) },
                releaseSource = {},
                progressTicker = ticker,
            )

        controller.handle(startCommand(autoplay = true))
        assertTrue(ticker.active)
        assertEquals(1_000L, ticker.intervalMs)

        events.clear()
        engine.currentPosition = 1_250L
        ticker.tick()

        assertEquals(1, events.size)
        assertEquals(1_250L, events.last().getLong("positionMs"))

        engine.currentPosition = 2_500L
        ticker.tick()
        assertEquals(2_500L, events.last().getLong("positionMs"))

        controller.handle(AudioPlaybackCommand.Pause("native-1"))
        assertFalse(ticker.active)
        val eventCount = events.size
        ticker.tick()
        assertEquals(eventCount, events.size)
    }

    @Test
    fun suppressesStaleStateEventsWhileTrackTransitionIsPending() {
        val engine = FakeAudioPlayerEngine()
        val events = mutableListOf<JSONObject>()
        val controller =
            ChromVoidAudioPlayerController(
                engine = engine,
                emitEvent = { events.add(JSONObject(it)) },
                releaseSource = {},
            )

        controller.handle(
            startCommand(
                tracks = listOf(
                    track(trackId = 41L, sourceRevision = 77L, sourceToken = "token-1"),
                    track(trackId = 42L, sourceRevision = 78L, sourceToken = "token-2"),
                ),
            ),
        )
        engine.deferTrackNavigation = true
        events.clear()

        controller.handle(AudioPlaybackCommand.SelectTrack("native-1", 1))
        assertEquals(1, engine.lastSelectedIndex)
        assertTrue(events.isEmpty())

        engine.currentPosition = 5_000L
        engine.listener?.onStateChanged()
        assertTrue(events.isEmpty())

        engine.currentMediaItemIndex = 1
        engine.currentPosition = 0L
        engine.listener?.onStateChanged()

        assertEquals(1, events.size)
        assertEquals(1, events.last().getInt("index"))
        assertEquals(42L, events.last().getLong("trackId"))
        assertEquals(0L, events.last().getLong("positionMs"))
    }

    @Test
    fun ignoresStaleSessionCommands() {
        val engine = FakeAudioPlayerEngine()
        val controller = ChromVoidAudioPlayerController(engine = engine, emitEvent = {}, releaseSource = {})

        controller.handle(startCommand(autoplay = false))
        val result = controller.handle(AudioPlaybackCommand.Play("stale-session"))

        assertFalse(result.accepted)
        assertEquals(0, engine.playCount)
    }

    @Test
    fun emitsStableErrorAndReleasesOnPlayerError() {
        val engine = FakeAudioPlayerEngine()
        val events = mutableListOf<JSONObject>()
        val released = mutableListOf<String>()
        var terminal = false
        val controller =
            ChromVoidAudioPlayerController(
                engine = engine,
                emitEvent = { events.add(JSONObject(it)) },
                releaseSource = released::add,
                onTerminal = { terminal = true },
            )

        controller.handle(startCommand())
        engine.listener?.onError(
            RuntimeException(
                "source failed",
                ChromVoidVaultAudioDataSource.AudioSourceIOException(
                    ChromVoidVaultAudioDataSource.ERR_SOURCE_STALE,
                ),
            ),
        )

        assertEquals("error", events[1].getString("event"))
        assertEquals(ChromVoidVaultAudioDataSource.ERR_SOURCE_STALE, events[1].getString("code"))
        assertEquals(listOf("opaque-token"), released)
        assertTrue(terminal)
    }

    private fun startCommand(
        autoplay: Boolean = true,
        tracks: List<AudioPlaybackCommand.AudioTrack> = listOf(track()),
    ): AudioPlaybackCommand.StartSession =
        AudioPlaybackCommand.StartSession(
            nativeSessionId = "native-1",
            tracks = tracks,
            index = 0,
            autoplay = autoplay,
        )

    private fun track(
        trackId: Long = 41L,
        sourceRevision: Long = 77L,
        sourceToken: String = "opaque-token",
    ): AudioPlaybackCommand.AudioTrack =
        AudioPlaybackCommand.AudioTrack(
            trackId = trackId,
            systemTitle = "ChromVoid audio",
            mimeType = "audio/mpeg",
            size = 1234L,
            sourceRevision = sourceRevision,
            sourceToken = sourceToken,
        )

    private class FakeAudioPlayerEngine : ChromVoidAudioPlayerController.AudioPlayerEngine {
        override var listener: ChromVoidAudioPlayerController.AudioPlayerEngine.Listener? = null
        override var currentMediaItemIndex: Int = 0
        override var playbackState: Int = Player.STATE_READY
        override var isPlaying: Boolean = false
        override var playWhenReady: Boolean = false
        override var currentPosition: Long = 0L
        override var duration: Long = 60_000L
        override var isCurrentMediaItemSeekable: Boolean = true
        override var hasPreviousMediaItem: Boolean = false
        override var hasNextMediaItem: Boolean = false
        var setMediaSourcesCount = 0
        var prepareCount = 0
        var playCount = 0
        var pauseCount = 0
        var stopCount = 0
        var lastSeekPositionMs = C.TIME_UNSET
        var lastSelectedIndex = -1
        var deferTrackNavigation = false

        override fun setMediaSources(
            mediaSources: List<MediaSource>,
            startIndex: Int,
        ) {
            setMediaSourcesCount += 1
            currentMediaItemIndex = startIndex
        }

        override fun prepare() {
            prepareCount += 1
        }

        override fun play() {
            playCount += 1
            isPlaying = true
            playWhenReady = true
        }

        override fun pause() {
            pauseCount += 1
            isPlaying = false
            playWhenReady = false
        }

        override fun seekTo(positionMs: Long) {
            lastSeekPositionMs = positionMs
            currentPosition = positionMs
        }

        override fun seekToDefaultPosition(index: Int) {
            lastSelectedIndex = index
            if (!deferTrackNavigation) {
                currentMediaItemIndex = index
                currentPosition = 0L
            }
        }

        override fun seekToNextMediaItem() {
            if (!deferTrackNavigation) {
                currentMediaItemIndex += 1
            }
        }

        override fun seekToPreviousMediaItem() {
            if (!deferTrackNavigation) {
                currentMediaItemIndex -= 1
            }
        }

        override fun stop() {
            stopCount += 1
            playbackState = Player.STATE_IDLE
            isPlaying = false
            playWhenReady = false
        }
    }

    private class FakeProgressTicker : ChromVoidAudioPlayerController.ProgressTicker {
        var active = false
        var intervalMs = 0L
        private var callback: (() -> Unit)? = null

        override fun start(
            intervalMs: Long,
            callback: () -> Unit,
        ) {
            active = true
            this.intervalMs = intervalMs
            this.callback = callback
        }

        override fun stop() {
            active = false
            callback = null
        }

        fun tick() {
            callback?.invoke()
        }
    }
}
