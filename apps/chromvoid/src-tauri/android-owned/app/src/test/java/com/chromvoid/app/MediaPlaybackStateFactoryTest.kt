package com.chromvoid.app

import android.media.session.PlaybackState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MediaPlaybackStateFactoryTest {
    @Test
    fun playingSnapshotBuildsPlayingStateWithActiveSpeed() {
        val state = MediaPlaybackStateFactory.build(snapshot(playbackState = "playing"), nowMs = 123L)

        assertEquals(PlaybackState.STATE_PLAYING, state.state)
        assertEquals(1f, state.playbackSpeed, 0f)
        assertEquals(1_200L, state.position)
        assertEquals(123L, state.lastPositionUpdateTime)
    }

    @Test
    fun bufferingSnapshotBuildsBufferingStateWithActiveSpeed() {
        val state = MediaPlaybackStateFactory.build(snapshot(playbackState = "buffering"), nowMs = 123L)

        assertEquals(PlaybackState.STATE_BUFFERING, state.state)
        assertEquals(1f, state.playbackSpeed, 0f)
    }

    @Test
    fun pausedSnapshotBuildsPausedStateWithInactiveSpeed() {
        val state = MediaPlaybackStateFactory.build(snapshot(playbackState = "paused"), nowMs = 123L)

        assertEquals(PlaybackState.STATE_PAUSED, state.state)
        assertEquals(0f, state.playbackSpeed, 0f)
    }

    @Test
    fun errorAndStoppedSnapshotsUseExplicitNativeStates() {
        assertEquals(
            PlaybackState.STATE_ERROR,
            MediaPlaybackStateFactory.toNativePlaybackState("error"),
        )
        assertEquals(
            PlaybackState.STATE_STOPPED,
            MediaPlaybackStateFactory.toNativePlaybackState("stopped"),
        )
    }

    @Test
    fun actionFlagsReflectSnapshotCapabilities() {
        val state =
            MediaPlaybackStateFactory.build(
                snapshot(canSeek = true, hasPrevious = true, hasNext = true),
                nowMs = 123L,
            )

        assertAction(state, PlaybackState.ACTION_PLAY)
        assertAction(state, PlaybackState.ACTION_PAUSE)
        assertAction(state, PlaybackState.ACTION_PLAY_PAUSE)
        assertAction(state, PlaybackState.ACTION_STOP)
        assertAction(state, PlaybackState.ACTION_SEEK_TO)
        assertAction(state, PlaybackState.ACTION_SKIP_TO_PREVIOUS)
        assertAction(state, PlaybackState.ACTION_SKIP_TO_NEXT)
    }

    @Test
    fun disabledCapabilitiesAreNotExposedAsActions() {
        val state =
            MediaPlaybackStateFactory.build(
                snapshot(canSeek = false, hasPrevious = false, hasNext = false),
                nowMs = 123L,
            )

        assertEquals(0L, state.actions and PlaybackState.ACTION_SEEK_TO)
        assertEquals(0L, state.actions and PlaybackState.ACTION_SKIP_TO_PREVIOUS)
        assertEquals(0L, state.actions and PlaybackState.ACTION_SKIP_TO_NEXT)
    }

    private fun assertAction(
        state: PlaybackState,
        action: Long,
    ) {
        assertTrue(state.actions and action != 0L)
    }

    private fun snapshot(
        playbackState: String = "paused",
        canSeek: Boolean = true,
        hasPrevious: Boolean = true,
        hasNext: Boolean = true,
    ): MediaSnapshot =
        MediaSnapshot(
            active = true,
            trackId = 7L,
            title = "Song A",
            playbackState = playbackState,
            positionMs = 1_200L,
            durationMs = 60_000L,
            canSeek = canSeek,
            hasPrevious = hasPrevious,
            hasNext = hasNext,
        )
}
