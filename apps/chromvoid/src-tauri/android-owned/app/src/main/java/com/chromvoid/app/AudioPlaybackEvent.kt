package com.chromvoid.app

import org.json.JSONObject

internal sealed class AudioPlaybackEvent {
    abstract val nativeSessionId: String

    data class State(
        override val nativeSessionId: String,
        val trackId: Long,
        val sourceRevision: Long,
        val index: Int,
        val playbackState: String,
        val playbackIntent: String,
        val loadingState: String,
        val positionMs: Long,
        val durationMs: Long,
        val canSeek: Boolean,
        val hasPrevious: Boolean,
        val hasNext: Boolean,
    ) : AudioPlaybackEvent()

    data class Error(
        override val nativeSessionId: String,
        val trackId: Long?,
        val sourceRevision: Long?,
        val code: String,
        val recoverable: Boolean = false,
    ) : AudioPlaybackEvent()

    data class Released(
        override val nativeSessionId: String,
        val trackId: Long?,
        val sourceRevision: Long?,
        val reason: String?,
    ) : AudioPlaybackEvent()

    fun toJson(): String {
        val json =
            when (this) {
                is State ->
                    JSONObject()
                        .put("event", "state")
                        .put("nativeSessionId", nativeSessionId)
                        .put("trackId", trackId)
                        .put("sourceRevision", sourceRevision)
                        .put("index", index)
                        .put("playbackState", playbackState)
                        .put("playbackIntent", playbackIntent)
                        .put("loadingState", loadingState)
                        .put("positionMs", positionMs)
                        .put("durationMs", durationMs)
                        .put("canSeek", canSeek)
                        .put("hasPrevious", hasPrevious)
                        .put("hasNext", hasNext)
                is Error ->
                    JSONObject()
                        .put("event", "error")
                        .put("nativeSessionId", nativeSessionId)
                        .put("code", code)
                        .put("recoverable", recoverable)
                is Released ->
                    JSONObject()
                        .put("event", "released")
                        .put("nativeSessionId", nativeSessionId)
            }

        when (this) {
            is Error -> {
                trackId?.let { json.put("trackId", it) }
                sourceRevision?.let { json.put("sourceRevision", it) }
            }
            is Released -> {
                trackId?.let { json.put("trackId", it) }
                sourceRevision?.let { json.put("sourceRevision", it) }
                reason?.let { json.put("reason", it) }
            }
            is State -> Unit
        }
        return json.toString()
    }
}
