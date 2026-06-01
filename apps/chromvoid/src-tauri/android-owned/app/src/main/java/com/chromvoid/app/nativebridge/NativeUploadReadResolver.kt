package com.chromvoid.app.nativebridge

import android.Manifest
import android.content.ContentUris
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import android.provider.MediaStore
import android.util.Log
import androidx.core.content.ContextCompat
import com.chromvoid.app.shared.TracePrivacy
import java.util.Locale

internal object NativeUploadReadResolver {
    private const val TAG = "ChromVoid/NativeUpload"

    fun shouldRequestMediaLocationPermission(
        context: Context,
        files: List<PickedFile>,
    ): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q &&
            !hasMediaLocationPermission(context) &&
            files.any(::isImageUploadCandidate)

    fun shouldRequestMediaLocationPermissionForTests(
        context: Context,
        name: String,
        mimeType: String,
    ): Boolean =
        shouldRequestMediaLocationPermission(
            context.applicationContext,
            listOf(
                PickedFile(
                    fileId = "test-file",
                    uri = Uri.parse("content://com.chromvoid.test/$name"),
                    name = name,
                    size = 1,
                    mimeType = mimeType,
                ),
            ),
        )

    fun uploadReadProvenanceForTests(
        context: Context,
        name: String,
        mimeType: String,
        uri: String,
        requireOriginalStatus: String,
        originalStreamUsed: Boolean,
        regularStreamFallback: Boolean,
        capturedAtMs: Long = 1L,
    ): UploadReadProvenance {
        val pickedFile = PickedFile(
            fileId = "test-file",
            uri = Uri.parse(uri),
            name = name,
            size = 1,
            mimeType = mimeType,
        )
        return buildUploadReadProvenance(
            context = context.applicationContext,
            file = pickedFile,
            readUri = pickedFile.uri,
            requireOriginalStatus = requireOriginalStatus,
            originalStreamUsed = originalStreamUsed,
            regularStreamFallback = regularStreamFallback,
            capturedAtMs = capturedAtMs,
        )
    }

    fun originalMediaUriForTests(
        context: Context,
        uri: String,
        imageCandidate: Boolean,
        permissionStatus: String,
    ): OriginalMediaUriDebugSnapshot {
        val result = originalMediaUriForRead(
            context = context.applicationContext,
            uri = Uri.parse(uri),
            imageCandidate = imageCandidate,
            permissionStatus = permissionStatus,
        )
        return OriginalMediaUriDebugSnapshot(
            uri = result.uri.toString(),
            requireOriginalStatus = result.requireOriginalStatus,
            shouldOpenOriginal = result.shouldOpenOriginal,
        )
    }

    fun isImageUploadCandidate(file: PickedFile): Boolean {
        if (file.mimeType.lowercase(Locale.US).startsWith("image/")) return true
        val name = file.name.lowercase(Locale.US)
        return name.endsWith(".jpg") ||
            name.endsWith(".jpeg") ||
            name.endsWith(".heic") ||
            name.endsWith(".heif") ||
            name.endsWith(".png") ||
            name.endsWith(".webp") ||
            name.endsWith(".tif") ||
            name.endsWith(".tiff")
    }

    fun hasMediaLocationPermission(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.ACCESS_MEDIA_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
    }

    fun openInputStreamForUpload(
        context: Context,
        file: PickedFile,
    ): OpenedUploadStream {
        val uri = file.uri
        val imageCandidate = isImageUploadCandidate(file)
        val permissionStatus = uploadPermissionStatus(context, imageCandidate)
        var originalResult = originalMediaUriForRead(context, uri, imageCandidate, permissionStatus)
        if (originalResult.shouldOpenOriginal) {
            val originalStream = runCatching {
                context.contentResolver.openInputStream(originalResult.uri)
            }.onFailure { error ->
                Log.d(
                    TAG,
                    "open_original_media_uri_failed error=${TracePrivacy.failureMessage(error)}",
                )
            }.getOrNull()
            if (originalStream != null) {
                return OpenedUploadStream(
                    readUri = originalResult.uri,
                    stream = originalStream,
                    provenance = buildUploadReadProvenance(
                        context = context,
                        file = file,
                        readUri = originalResult.uri,
                        requireOriginalStatus = "attempted_used",
                        originalStreamUsed = true,
                        regularStreamFallback = false,
                        capturedAtMs = System.currentTimeMillis(),
                    ),
                )
            }
            originalResult = originalResult.copy(requireOriginalStatus = "attempted_open_original_failed")
        }

        val stream = context.contentResolver.openInputStream(uri)
            ?: throw IllegalStateException("Failed to open upload stream")
        return OpenedUploadStream(
            readUri = uri,
            stream = stream,
            provenance = buildUploadReadProvenance(
                context = context,
                file = file,
                readUri = uri,
                requireOriginalStatus = originalResult.requireOriginalStatus,
                originalStreamUsed = false,
                regularStreamFallback = imageCandidate && originalResult.requireOriginalStatus != "not_applicable",
                capturedAtMs = System.currentTimeMillis(),
            ),
        )
    }

    fun resolveUploadFile(
        context: Context,
        uploadId: String,
        index: Int,
        input: NativeUploadUriInput,
        source: String,
    ): PickedFile {
        val uri = input.uri
        val fallbackName =
            if (source == "android_share") {
                "shared-file-${index + 1}"
            } else {
                uri.lastPathSegment?.substringAfterLast('/')?.takeIf { it.isNotEmpty() }
                    ?: "upload-${index + 1}"
            }
        val metadata = NativeUriFileMetadataResolver.resolve(
            context = context,
            uri = uri,
            displayName = input.displayName,
            size = input.size,
            mimeType = input.mimeType,
            fallbackName = fallbackName,
            defaultMimeType = "application/octet-stream",
            guessMimeTypeFromUriPath = false,
            queryFailureLog = null,
            sizeFailureLog = { failedUri, error ->
                Log.d(
                    TAG,
                    "resolve_upload_size_failed uri=${TracePrivacy.redactUri(failedUri.toString())} error=${TracePrivacy.failureMessage(error)}",
                )
            },
        )

        return PickedFile(
            fileId = "$uploadId-$index",
            uri = uri,
            name = metadata.name,
            size = metadata.size ?: -1L,
            mimeType = metadata.mimeType ?: "application/octet-stream",
        )
    }

    private fun originalMediaUriForRead(
        context: Context,
        uri: Uri,
        imageCandidate: Boolean,
        permissionStatus: String,
    ): OriginalMediaUriResult {
        if (!imageCandidate || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            return OriginalMediaUriResult(uri, "not_applicable", shouldOpenOriginal = false)
        }
        if (
            permissionStatus != "granted"
        ) {
            return OriginalMediaUriResult(
                uri,
                "not_attempted_permission_missing",
                shouldOpenOriginal = false,
            )
        }

        val mediaUri = mediaStoreUriForOriginalRead(context, uri)
        val originalUri = runCatching {
            MediaStore.setRequireOriginal(mediaUri)
        }.onFailure { error ->
            Log.d(TAG, "require_original_media_uri_failed error=${TracePrivacy.failureMessage(error)}")
        }.getOrNull()

        if (originalUri == null) {
            return OriginalMediaUriResult(
                uri,
                "attempted_set_require_original_failed",
                shouldOpenOriginal = false,
            )
        }
        return OriginalMediaUriResult(
            originalUri,
            "attempted_regular_fallback",
            shouldOpenOriginal = true,
        )
    }

    private fun mediaStoreUriForOriginalRead(
        context: Context,
        uri: Uri,
    ): Uri =
        runCatching {
            MediaStore.getMediaUri(context, uri)
        }.onFailure { error ->
            Log.d(TAG, "resolve_media_store_uri_failed error=${TracePrivacy.failureMessage(error)}")
        }.getOrNull()?.takeIf(::isMediaStoreUri)
            // MediaStore.getMediaUri grants access on real devices; the fallback keeps the
            // standard MediaDocumentsProvider path covered in tests and best-effort providers.
            ?: mediaStoreUriFromDocumentUri(uri)
            ?: uri

    private fun isMediaStoreUri(uri: Uri): Boolean = uri.authority == MediaStore.AUTHORITY

    private fun mediaStoreUriFromDocumentUri(uri: Uri): Uri? {
        if (uri.authority != "com.android.providers.media.documents") return null
        val documentId = runCatching {
            DocumentsContract.getDocumentId(uri)
        }.getOrNull() ?: return null
        val parts = documentId.split(':', limit = 2)
        val type = parts.getOrNull(0) ?: return null
        val id = parts.getOrNull(1)?.toLongOrNull() ?: return null
        val contentUri = when (type) {
            "image" -> MediaStore.Images.Media.EXTERNAL_CONTENT_URI
            "video" -> MediaStore.Video.Media.EXTERNAL_CONTENT_URI
            "audio" -> MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            else -> return null
        }
        return ContentUris.withAppendedId(contentUri, id)
    }

    private fun uploadPermissionStatus(
        context: Context,
        imageCandidate: Boolean,
    ): String {
        if (!imageCandidate || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "not_required"
        return if (hasMediaLocationPermission(context)) "granted" else "denied"
    }

    private fun buildUploadReadProvenance(
        context: Context,
        file: PickedFile,
        readUri: Uri,
        requireOriginalStatus: String,
        originalStreamUsed: Boolean,
        regularStreamFallback: Boolean,
        capturedAtMs: Long,
    ): UploadReadProvenance {
        val imageCandidate = isImageUploadCandidate(file)
        return UploadReadProvenance(
            imageCandidate = imageCandidate,
            permissionStatus = uploadPermissionStatus(context, imageCandidate),
            requireOriginalStatus = requireOriginalStatus,
            originalStreamUsed = originalStreamUsed,
            regularStreamFallback = regularStreamFallback,
            uriScheme = readUri.scheme.orEmpty(),
            uriAuthority = readUri.authority.orEmpty(),
            capturedAtMs = capturedAtMs,
        )
    }
}
