package com.chromvoid.app

import android.media.session.PlaybackState

internal object MediaPlaybackStateFactory {
    fun build(
        snapshot: MediaSnapshot,
        nowMs: Long,
    ): PlaybackState {
        val activePlayback = snapshot.isActivelyPlaying()
        var actions =
            PlaybackState.ACTION_PLAY_PAUSE or
                PlaybackState.ACTION_PLAY or
                PlaybackState.ACTION_PAUSE or
                PlaybackState.ACTION_STOP
        if (snapshot.hasNext) actions = actions or PlaybackState.ACTION_SKIP_TO_NEXT
        if (snapshot.hasPrevious) actions = actions or PlaybackState.ACTION_SKIP_TO_PREVIOUS
        if (snapshot.canSeek) actions = actions or PlaybackState.ACTION_SEEK_TO

        return PlaybackState.Builder()
            .setActions(actions)
            .setState(
                toNativePlaybackState(snapshot.playbackState),
                snapshot.positionMs,
                if (activePlayback) 1f else 0f,
                nowMs,
            )
            .build()
    }

    fun toNativePlaybackState(playbackState: String): Int =
        when (playbackState) {
            "playing" -> PlaybackState.STATE_PLAYING
            "buffering" -> PlaybackState.STATE_BUFFERING
            "error" -> PlaybackState.STATE_ERROR
            "stopped" -> PlaybackState.STATE_STOPPED
            else -> PlaybackState.STATE_PAUSED
        }
}
