package com.chromvoid.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Test

class MediaPlaybackStateStoreTest {
    @Test
    fun localPlaybackStateRequestWithoutSnapshotIsIgnored() {
        val store = MediaPlaybackStateStore(localPlaybackStateTimeoutMs = 1_500L)

        val result = store.requestLocalPlaybackState("playing", nowMs = 10L)

        assertSame(MediaPlaybackLocalStateResult.Ignored, result)
        assertNull(store.currentSnapshot)
        assertNull(store.pendingPlaybackState)
    }

    @Test
    fun localPlaybackStateRequestStoresPendingState() {
        val store = MediaPlaybackStateStore(localPlaybackStateTimeoutMs = 1_500L)
        store.applySnapshot(snapshot(playbackState = "paused"))

        val result = store.requestLocalPlaybackState("playing", nowMs = 10L)
            as MediaPlaybackLocalStateResult.Applied

        assertEquals("paused", result.previousSnapshot.playbackState)
        assertEquals("playing", result.snapshot.playbackState)
        assertEquals("playing", store.pendingPlaybackState)
        assertEquals(1_510L, result.pending.expiresAtMs)
    }

    @Test
    fun reconcileWithoutPendingReturnsIncomingSnapshot() {
        val store = MediaPlaybackStateStore(localPlaybackStateTimeoutMs = 1_500L)
        val incoming = snapshot(playbackState = "playing")

        val result = store.reconcileIncomingSnapshot(incoming, nowMs = 10L)

        assertSame(incoming, result.snapshot)
        assertNull(result.decision)
    }

    @Test
    fun reconcileClearsPendingWhenTrackChanged() {
        val store = MediaPlaybackStateStore(localPlaybackStateTimeoutMs = 1_500L)
        store.applySnapshot(snapshot(trackId = 7L, playbackState = "paused"))
        store.requestLocalPlaybackState("playing", nowMs = 10L)

        val result = store.reconcileIncomingSnapshot(snapshot(trackId = 8L, playbackState = "paused"), nowMs = 20L)

        assertEquals("track_changed", result.decision?.decision)
        assertEquals(8L, result.snapshot.trackId)
        assertNull(store.pendingPlaybackState)
    }

    @Test
    fun reconcileClearsPendingWhenExpired() {
        val store = MediaPlaybackStateStore(localPlaybackStateTimeoutMs = 1_500L)
        store.applySnapshot(snapshot(playbackState = "paused"))
        store.requestLocalPlaybackState("playing", nowMs = 10L)

        val result = store.reconcileIncomingSnapshot(snapshot(playbackState = "paused"), nowMs = 1_511L)

        assertEquals("expired", result.decision?.decision)
        assertEquals("paused", result.snapshot.playbackState)
        assertEquals(1L, result.decision?.expiredByMs)
        assertNull(store.pendingPlaybackState)
    }

    @Test
    fun reconcileClearsPendingWhenIncomingMatchesPending() {
        val store = MediaPlaybackStateStore(localPlaybackStateTimeoutMs = 1_500L)
        store.applySnapshot(snapshot(playbackState = "paused"))
        store.requestLocalPlaybackState("playing", nowMs = 10L)

        val result = store.reconcileIncomingSnapshot(snapshot(playbackState = "buffering"), nowMs = 20L)

        assertEquals("match", result.decision?.decision)
        assertEquals("buffering", result.snapshot.playbackState)
        assertNull(store.pendingPlaybackState)
    }

    @Test
    fun reconcileHoldsPendingWhenIncomingDoesNotMatchYet() {
        val store = MediaPlaybackStateStore(localPlaybackStateTimeoutMs = 1_500L)
        store.applySnapshot(snapshot(playbackState = "playing"))
        store.requestLocalPlaybackState("paused", nowMs = 10L)

        val result = store.reconcileIncomingSnapshot(snapshot(playbackState = "playing"), nowMs = 20L)

        assertEquals("hold_pending", result.decision?.decision)
        assertEquals("paused", result.snapshot.playbackState)
        assertEquals("paused", store.pendingPlaybackState)
    }

    @Test
    fun localPositionIsCoercedAndStored() {
        val store = MediaPlaybackStateStore(localPlaybackStateTimeoutMs = 1_500L)
        store.applySnapshot(snapshot(positionMs = 100L))

        val result = store.applyLocalPosition(-50L)

        assertEquals(0L, result?.positionMs)
        assertEquals(0L, store.currentSnapshot?.positionMs)
    }

    private fun snapshot(
        trackId: Long = 7L,
        playbackState: String = "paused",
        positionMs: Long = 1_200L,
    ): MediaSnapshot =
        MediaSnapshot(
            active = true,
            trackId = trackId,
            title = "Song A",
            playbackState = playbackState,
            positionMs = positionMs,
            durationMs = 60_000L,
            canSeek = true,
            hasPrevious = true,
            hasNext = true,
        )
}
