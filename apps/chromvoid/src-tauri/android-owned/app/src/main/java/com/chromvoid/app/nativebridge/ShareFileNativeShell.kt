package com.chromvoid.app.nativebridge

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File
import java.net.URLConnection

internal object ShareFileNativeShell {
    @JvmStatic
    fun shareFilesInSystem(
        context: Context,
        absolutePaths: Array<String>,
        mimeTypes: Array<String?>?,
    ): String? {
        return try {
            val shareIntent = createShareIntent(context, absolutePaths, mimeTypes)
            if (shareIntent.resolveActivity(context.packageManager) == null) {
                return "No app can share these files."
            }

            startIntentForExternalAction(context, createChooserIntent(context, shareIntent))
            null
        } catch (_: android.content.ActivityNotFoundException) {
            "No app can share these files."
        } catch (error: Throwable) {
            val message = error.message?.trim().orEmpty()
            if (message.isNotEmpty()) {
                "Failed to share files: $message"
            } else {
                "Failed to share files."
            }
        }
    }

    internal fun createShareIntent(
        context: Context,
        absolutePaths: Array<String>,
        mimeTypes: Array<String?>?,
    ): Intent {
        require(absolutePaths.isNotEmpty()) {
            "No files provided for sharing"
        }

        val shareableFiles =
            absolutePaths.mapIndexed { index, absolutePath ->
                val file = requireExternalIntentStagedFile(
                    context = context,
                    file = File(absolutePath),
                    stagingDirName = SHARE_FILES_STAGING_DIR,
                )

                val effectiveMimeType =
                    mimeTypes
                        ?.getOrNull(index)
                        ?.trim()
                        ?.takeIf { it.isNotEmpty() }
                        ?: URLConnection.guessContentTypeFromName(file.name)
                        ?: "application/octet-stream"

                ShareableFile(
                    contentUri =
                        FileProvider.getUriForFile(
                            context,
                            "${context.packageName}.fileprovider",
                            file,
                        ),
                    mimeType = effectiveMimeType,
                )
            }

        val uris = shareableFiles.map(ShareableFile::contentUri)
        val action =
            if (shareableFiles.size == 1) {
                Intent.ACTION_SEND
            } else {
                Intent.ACTION_SEND_MULTIPLE
            }

        return Intent(action).apply {
            type = resolveShareMimeType(shareableFiles.map(ShareableFile::mimeType))
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

            if (shareableFiles.size == 1) {
                putExtra(Intent.EXTRA_STREAM, uris.first())
            } else {
                putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(uris))
            }
        }
    }

    internal fun createChooserIntent(
        context: Context,
        shareIntent: Intent,
    ): Intent {
        val uris = extractShareUris(shareIntent)
        val label = uris.firstOrNull()?.lastPathSegment ?: "file"
        return createChooserIntentWithReadAccess(context, shareIntent, uris, label)
    }

    private fun extractShareUris(intent: Intent): List<Uri> {
        val single = intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
        if (single != null) {
            return listOf(single)
        }

        return intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java) ?: emptyList()
    }

    private fun resolveShareMimeType(mimeTypes: List<String>): String {
        val normalizedMimeTypes =
            mimeTypes
                .map { it.trim().lowercase() }
                .filter { it.isNotEmpty() }
                .distinct()

        if (normalizedMimeTypes.isEmpty()) {
            return "*/*"
        }

        if (normalizedMimeTypes.size == 1) {
            return normalizedMimeTypes.first()
        }

        val topLevelTypes = normalizedMimeTypes.map { it.substringBefore('/') }.distinct()
        return if (topLevelTypes.size == 1) {
            "${topLevelTypes.first()}/*"
        } else {
            "*/*"
        }
    }

    private data class ShareableFile(
        val contentUri: Uri,
        val mimeType: String,
    )
}
