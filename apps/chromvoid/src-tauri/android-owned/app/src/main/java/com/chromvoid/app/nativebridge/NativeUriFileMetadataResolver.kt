package com.chromvoid.app.nativebridge

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import java.net.URLConnection

internal data class NativeUriFileMetadata(
    val name: String,
    val size: Long?,
    val mimeType: String?,
)

internal object NativeUriFileMetadataResolver {
    fun resolve(
        context: Context,
        uri: Uri,
        displayName: String?,
        size: Long?,
        mimeType: String?,
        fallbackName: String,
        defaultMimeType: String?,
        guessMimeTypeFromUriPath: Boolean,
        queryFailureLog: ((Uri, Throwable) -> Unit)?,
        sizeFailureLog: (Uri, Throwable) -> Unit,
    ): NativeUriFileMetadata {
        var resolvedName = displayName.normalizedText()
        var resolvedSize = size?.takeIf { it >= 0 }

        if (resolvedName == null || resolvedSize == null) {
            val queryMetadata = {
                context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    val sizeIndex = cursor.getColumnIndex(OpenableColumns.SIZE)
                    if (cursor.moveToFirst()) {
                        if (resolvedName == null && nameIndex >= 0 && !cursor.isNull(nameIndex)) {
                            resolvedName = cursor.getString(nameIndex).normalizedText()
                        }
                        if (resolvedSize == null && sizeIndex >= 0 && !cursor.isNull(sizeIndex)) {
                            resolvedSize = cursor.getLong(sizeIndex).takeIf { it >= 0 }
                        }
                    }
                }
            }
            if (queryFailureLog == null) {
                queryMetadata()
            } else {
                runCatching(queryMetadata).onFailure { error ->
                    queryFailureLog(uri, error)
                }
            }
        }

        if (resolvedSize == null) {
            runCatching {
                context.contentResolver.openAssetFileDescriptor(uri, "r")?.use { descriptor ->
                    resolvedSize = descriptor.length.takeIf { it >= 0 }
                }
            }.onFailure { error ->
                sizeFailureLog(uri, error)
            }
        }

        val effectiveName = resolvedName ?: fallbackName
        val resolvedMimeType = mimeType.normalizedText()
            ?: context.contentResolver.getType(uri)
            ?: URLConnection.guessContentTypeFromName(effectiveName)
            ?: if (guessMimeTypeFromUriPath) {
                URLConnection.guessContentTypeFromName(uri.lastPathSegment.orEmpty())
            } else {
                null
            }
            ?: defaultMimeType

        return NativeUriFileMetadata(
            name = effectiveName,
            size = resolvedSize,
            mimeType = resolvedMimeType,
        )
    }

    private fun String?.normalizedText(): String? =
        this?.trim()?.takeIf { it.isNotEmpty() }
}
