package com.chromvoid.app

import org.json.JSONArray
import org.json.JSONObject

internal sealed class AudioPlaybackCommand {
    abstract val nativeSessionId: String
    abstract val dispatchId: String?

    data class StartSession(
        override val nativeSessionId: String,
        val tracks: List<AudioTrack>,
        val index: Int,
        val autoplay: Boolean,
        override val dispatchId: String? = null,
    ) : AudioPlaybackCommand()

    data class Play(
        override val nativeSessionId: String,
        override val dispatchId: String? = null,
    ) : AudioPlaybackCommand()

    data class Pause(
        override val nativeSessionId: String,
        override val dispatchId: String? = null,
    ) : AudioPlaybackCommand()

    data class Stop(
        override val nativeSessionId: String,
        override val dispatchId: String? = null,
    ) : AudioPlaybackCommand()

    data class NextTrack(
        override val nativeSessionId: String,
        override val dispatchId: String? = null,
    ) : AudioPlaybackCommand()

    data class PreviousTrack(
        override val nativeSessionId: String,
        override val dispatchId: String? = null,
    ) : AudioPlaybackCommand()

    data class SeekTo(
        override val nativeSessionId: String,
        val positionMs: Long,
        override val dispatchId: String? = null,
    ) : AudioPlaybackCommand()

    data class SelectTrack(
        override val nativeSessionId: String,
        val index: Int,
        override val dispatchId: String? = null,
    ) : AudioPlaybackCommand()

    data class AudioTrack(
        val trackId: Long,
        val systemTitle: String,
        val mimeType: String,
        val size: Long,
        val sourceRevision: Long,
        val sourceToken: String,
    )

    companion object {
        const val SYSTEM_TITLE = "ChromVoid audio"

        fun fromJson(payload: String): AudioPlaybackCommand? =
            runCatching {
                if (payload.isBlank()) return null
                val json = JSONObject(payload)
                val command = json.optString("command", "")
                val nativeSessionId = json.requiredTrimmedString("nativeSessionId") ?: return null
                val dispatchId = json.optionalTrimmedString("dispatchId")

                when (command) {
                    "startSession" -> {
                        val tracks = json.optJSONArray("tracks")?.parseTracks() ?: return null
                        val index = json.optIntOrNull("index") ?: return null
                        if (tracks.isEmpty() || index !in tracks.indices) return null
                        StartSession(
                            nativeSessionId = nativeSessionId,
                            tracks = tracks,
                            index = index,
                            autoplay = json.optBoolean("autoplay", false),
                            dispatchId = dispatchId,
                        )
                    }
                    "play" -> Play(nativeSessionId, dispatchId)
                    "pause" -> Pause(nativeSessionId, dispatchId)
                    "stop" -> Stop(nativeSessionId, dispatchId)
                    "nextTrack" -> NextTrack(nativeSessionId, dispatchId)
                    "previousTrack" -> PreviousTrack(nativeSessionId, dispatchId)
                    "seekTo" -> {
                        val positionMs = json.optLongOrNull("positionMs") ?: return null
                        if (positionMs < 0L) return null
                        SeekTo(nativeSessionId, positionMs, dispatchId)
                    }
                    "selectTrack" -> {
                        val index = json.optIntOrNull("index") ?: return null
                        if (index < 0) return null
                        SelectTrack(nativeSessionId, index, dispatchId)
                    }
                    else -> null
                }
            }.getOrNull()

        fun dispatchIdFromJson(payload: String): String? =
            runCatching {
                if (payload.isBlank()) return null
                JSONObject(payload).optionalTrimmedString("dispatchId")
            }.getOrNull()

        fun commandNameFromJson(payload: String): String? =
            runCatching {
                if (payload.isBlank()) return null
                JSONObject(payload).optionalTrimmedString("command")
            }.getOrNull()

        fun nativeSessionIdFromJson(payload: String): String? =
            runCatching {
                if (payload.isBlank()) return null
                JSONObject(payload).optionalTrimmedString("nativeSessionId")
            }.getOrNull()

        private fun JSONArray.parseTracks(): List<AudioTrack>? {
            val result = ArrayList<AudioTrack>(length())
            for (index in 0 until length()) {
                val item = optJSONObject(index) ?: return null
                val track =
                    AudioTrack(
                        trackId = item.optLongOrNull("trackId") ?: return null,
                        systemTitle = item.requiredTrimmedString("systemTitle") ?: return null,
                        mimeType = item.requiredTrimmedString("mimeType") ?: return null,
                        size = item.optLongOrNull("size") ?: return null,
                        sourceRevision = item.optLongOrNull("sourceRevision") ?: return null,
                        sourceToken = item.requiredTrimmedString("sourceToken") ?: return null,
                    )
                if (
                    track.trackId < 0L ||
                    track.size <= 0L ||
                    track.sourceRevision < 0L ||
                    track.systemTitle != SYSTEM_TITLE
                ) {
                    return null
                }
                result.add(track)
            }
            return result
        }

        private fun JSONObject.requiredTrimmedString(key: String): String? {
            if (!has(key)) return null
            val value = optString(key, "").trim()
            return value.ifEmpty { null }
        }

        private fun JSONObject.optionalTrimmedString(key: String): String? {
            if (!has(key)) return null
            val value = optString(key, "").trim()
            return value.ifEmpty { null }
        }

        private fun JSONObject.optLongOrNull(key: String): Long? {
            if (!has(key)) return null
            return runCatching { getLong(key) }.getOrNull()
        }

        private fun JSONObject.optIntOrNull(key: String): Int? {
            if (!has(key)) return null
            return runCatching { getInt(key) }.getOrNull()
        }
    }
}
