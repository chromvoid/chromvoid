package com.chromvoid.app.nativebridge

import android.content.ContentValues
import android.content.Context
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import java.net.URLConnection

internal object GallerySaveNativeShell {
    @JvmStatic
    fun saveImageToGallery(
        context: Context,
        bytes: ByteArray,
        fileName: String,
        mimeType: String?,
    ): String {
        check(Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            "Saving images to gallery requires Android 10 or newer"
        }

        val effectiveName = fileName.trim().ifEmpty { "image" }
        val effectiveMimeType =
            mimeType?.trim()?.takeIf { it.isNotEmpty() }
                ?: URLConnection.guessContentTypeFromName(effectiveName)
                ?: "application/octet-stream"

        val resolver = context.contentResolver
        val values =
            ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, effectiveName)
                put(MediaStore.MediaColumns.MIME_TYPE, effectiveMimeType)
                put(
                    MediaStore.MediaColumns.RELATIVE_PATH,
                    "${Environment.DIRECTORY_PICTURES}/ChromVoid",
                )
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }

        val uri =
            resolver.insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), values)
                ?: error("Failed to create gallery entry")

        try {
            resolver.openOutputStream(uri)?.use { stream ->
                stream.write(bytes)
                stream.flush()
            } ?: error("Failed to open gallery output stream")

            val completeValues =
                ContentValues().apply {
                    put(MediaStore.MediaColumns.IS_PENDING, 0)
                }
            resolver.update(uri, completeValues, null, null)
            return uri.toString()
        } catch (error: Throwable) {
            runCatching { resolver.delete(uri, null, null) }
            throw error
        }
    }
}
