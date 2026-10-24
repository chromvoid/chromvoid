package com.chromvoid.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MediaSnapshotTest {
    @Test
    fun fromJson_parsesAllFields() {
        val snapshot =
            MediaSnapshot.fromJson(
                """
                {
                  "active": true,
                  "trackId": 7,
                  "title": "Song A",
                  "playbackState": "playing",
                  "positionMs": 1200,
                  "durationMs": 60000,
                  "canSeek": true,
                  "hasPrevious": true,
                  "hasNext": false
                }
                """.trimIndent(),
            )

        checkNotNull(snapshot)
        assertTrue(snapshot.active)
        assertEquals(7L, snapshot.trackId)
        assertEquals("Song A", snapshot.title)
        assertEquals("playing", snapshot.playbackState)
        assertEquals(1200L, snapshot.positionMs)
        assertEquals(60000L, snapshot.durationMs)
        assertTrue(snapshot.canSeek)
        assertTrue(snapshot.hasPrevious)
        assertFalse(snapshot.hasNext)
    }

    @Test
    fun fromJson_returnsNullForMalformedInput() {
        assertNull(MediaSnapshot.fromJson("not json"))
    }

    @Test
    fun fromJson_clampsNegativePositionAndDurationToZero() {
        val snapshot =
            MediaSnapshot.fromJson(
                """{"active":true,"trackId":1,"title":"x","playbackState":"paused","positionMs":-500,"durationMs":-1}""",
            )

        checkNotNull(snapshot)
        assertEquals(0L, snapshot.positionMs)
        assertEquals(0L, snapshot.durationMs)
    }

    @Test
    fun isActivelyPlaying_treatsBufferingAsActive() {
        assertTrue(snapshot(playbackState = "playing").isActivelyPlaying())
        assertTrue(snapshot(playbackState = "buffering").isActivelyPlaying())
        assertFalse(snapshot(playbackState = "paused").isActivelyPlaying())
        assertFalse(snapshot(playbackState = "stopped").isActivelyPlaying())
    }

    @Test
    fun matchesPlaybackState_treatsPlayingAsAnyActiveState() {
        assertTrue(snapshot(playbackState = "buffering").matchesPlaybackState("playing"))
        assertTrue(snapshot(playbackState = "playing").matchesPlaybackState("playing"))
        assertFalse(snapshot(playbackState = "paused").matchesPlaybackState("playing"))
    }

    @Test
    fun matchesPlaybackState_requiresExactMatchForOtherStates() {
        assertTrue(snapshot(playbackState = "paused").matchesPlaybackState("paused"))
        assertFalse(snapshot(playbackState = "playing").matchesPlaybackState("paused"))
    }

    @Test
    fun notificationKey_changesWhenAnyComponentChanges() {
        val baseline = snapshot(playbackState = "playing").notificationKey()
        assertEquals(baseline, snapshot(playbackState = "playing").notificationKey())
        assertFalse(baseline == snapshot(playbackState = "paused").notificationKey())
        assertFalse(baseline == snapshot(title = "Song B").notificationKey())
        assertFalse(baseline == snapshot(hasNext = false).notificationKey())
    }

    private fun snapshot(
        title: String = "Song A",
        playbackState: String = "playing",
        hasPrevious: Boolean = true,
        hasNext: Boolean = true,
    ): MediaSnapshot =
        MediaSnapshot(
            active = true,
            trackId = 7L,
            title = title,
            playbackState = playbackState,
            positionMs = 0L,
            durationMs = 60_000L,
            canSeek = true,
            hasPrevious = hasPrevious,
            hasNext = hasNext,
        )
}
