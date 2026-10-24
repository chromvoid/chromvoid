package com.chromvoid.app

import android.util.Log
import org.json.JSONObject

internal data class MediaSnapshot(
    val active: Boolean,
    val trackId: Long,
    val title: String,
    val playbackState: String,
    val positionMs: Long,
    val durationMs: Long,
    val canSeek: Boolean,
    val hasPrevious: Boolean,
    val hasNext: Boolean,
) {
    fun isActivelyPlaying(): Boolean = playbackState == "playing" || playbackState == "buffering"

    fun matchesPlaybackState(expectedPlaybackState: String): Boolean {
        return if (expectedPlaybackState == "playing") {
            isActivelyPlaying()
        } else {
            playbackState == expectedPlaybackState
        }
    }

    fun notificationKey(): String =
        listOf(
            trackId,
            title,
            playbackState,
            hasPrevious,
            hasNext,
        ).joinToString("|")

    companion object {
        private const val TAG = "ChromVoid/MediaSnapshot"

        fun fromJson(raw: String): MediaSnapshot? =
            runCatching {
                val json = JSONObject(raw)
                MediaSnapshot(
                    active = json.optBoolean("active", false),
                    trackId = json.optLong("trackId", -1L),
                    title = json.optString("title", ""),
                    playbackState = json.optString("playbackState", "paused"),
                    positionMs = json.optLong("positionMs", 0L).coerceAtLeast(0L),
                    durationMs = json.optLong("durationMs", 0L).coerceAtLeast(0L),
                    canSeek = json.optBoolean("canSeek", false),
                    hasPrevious = json.optBoolean("hasPrevious", false),
                    hasNext = json.optBoolean("hasNext", false),
                )
            }
                .onFailure { Log.w(TAG, "Failed to parse media snapshot", it) }
                .getOrNull()
    }
}

internal data class PendingLocalPlaybackState(
    val playbackState: String,
    val trackId: Long,
    val expiresAtMs: Long,
)
