package com.chromvoid.app

import org.json.JSONObject

internal data class VideoSource(
    val streamId: String,
    val nativeSourceToken: String,
    val nodeId: Long,
    val name: String,
    val mimeType: String,
    val size: Long,
    val sourceRevision: Long,
    val mediaSourceGeneration: Long,
    val transportSessionGeneration: Long?,
    val appForegroundEpoch: Long,
) {
    companion object {
        fun fromJson(payload: String): VideoSource {
            val json = JSONObject(payload)
            val nativeSourceToken = json.firstNonBlank("nativeSourceToken", "native_source_token", "token")
            return VideoSource(
                streamId = json.firstNonBlankOrDefault(nativeSourceToken, "streamId", "stream_id"),
                nativeSourceToken = nativeSourceToken,
                nodeId = json.getLong("nodeId"),
                name = json.optString("name", ""),
                mimeType = json.getString("mimeType"),
                size = json.getLong("size"),
                sourceRevision = json.getLong("sourceRevision"),
                mediaSourceGeneration = json.optLong("mediaSourceGeneration", 1L).coerceAtLeast(1L),
                transportSessionGeneration = json.optionalPositiveLong("transportSessionGeneration"),
                appForegroundEpoch = json.optLong("appForegroundEpoch", 1L).coerceAtLeast(1L),
            )
        }

        private fun JSONObject.firstNonBlank(vararg keys: String): String {
            for (key in keys) {
                val value = optString(key, "").trim()
                if (value.isNotEmpty()) return value
            }
            throw IllegalArgumentException("Missing ${keys.first()} in video source payload")
        }

        private fun JSONObject.firstNonBlankOrDefault(
            defaultValue: String,
            vararg keys: String,
        ): String {
            for (key in keys) {
                val value = optString(key, "").trim()
                if (value.isNotEmpty()) return value
            }
            return defaultValue
        }

        private fun JSONObject.optionalPositiveLong(key: String): Long? {
            if (!has(key) || isNull(key)) return null
            val value = optLong(key, -1L)
            return if (value >= 0L) value else null
        }
    }
}
