package com.chromvoid.app.nativebridge

import android.os.SystemClock
import android.util.Log

internal object ImageMetadataNativeShell {
    private const val TAG = "ChromVoid/ImageMetadata"

    @JvmStatic
    fun extractMetadata(bytes: ByteArray): String? {
        if (bytes.isEmpty()) return null

        val startedAt = SystemClock.elapsedRealtime()
        val payload = ImageMetadataExtractor.extract(bytes)

        if (payload.length() == 0) {
            Log.i(
                TAG,
                "image_metadata android_native empty elapsed_ms=${SystemClock.elapsedRealtime() - startedAt}",
            )
            return null
        }

        Log.i(
            TAG,
            "image_metadata android_native fields=${payload.length()} width=${payload.has("width")} height=${payload.has("height")} date_taken=${payload.has("dateTaken")} camera=${payload.has("cameraMake") || payload.has("cameraModel")} gps=${payload.has("gps")} elapsed_ms=${SystemClock.elapsedRealtime() - startedAt}",
        )
        return payload.toString()
    }
}
