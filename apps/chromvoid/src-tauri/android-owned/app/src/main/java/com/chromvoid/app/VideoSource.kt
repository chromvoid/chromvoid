package com.chromvoid.app

import org.json.JSONObject

internal data class VideoSource(
    val token: String,
    val nodeId: Long,
    val name: String,
    val mimeType: String,
    val size: Long,
    val sourceRevision: Long,
) {
    companion object {
        fun fromJson(payload: String): VideoSource {
            val json = JSONObject(payload)
            return VideoSource(
                token = json.getString("token"),
                nodeId = json.getLong("nodeId"),
                name = json.optString("name", ""),
                mimeType = json.getString("mimeType"),
                size = json.getLong("size"),
                sourceRevision = json.getLong("sourceRevision"),
            )
        }
    }
}
