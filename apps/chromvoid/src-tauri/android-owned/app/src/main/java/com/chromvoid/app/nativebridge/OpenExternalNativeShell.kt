package com.chromvoid.app.nativebridge

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import java.io.File
import java.net.URLConnection

internal object OpenExternalNativeShell {
    @JvmStatic
    fun openFileInSystem(
        context: Context,
        absolutePath: String,
        mimeType: String?,
    ): String? {
        return try {
            val viewIntent = createViewIntent(context, absolutePath, mimeType)
            val fallbackViewIntent = createViewIntent(context, absolutePath, mimeType, "*/*")
            val typelessViewIntent = createTypelessViewIntent(context, absolutePath)
            // Package visibility can hide external handlers from resolveActivity; let the chooser decide.
            startOpenChooser(
                context,
                createChooserIntent(
                    context,
                    viewIntent,
                    arrayOf(fallbackViewIntent, typelessViewIntent),
                ),
            )
        } catch (error: Throwable) {
            val message = error.message?.trim().orEmpty()
            if (message.isNotEmpty()) {
                "Failed to open file: $message"
            } else {
                "Failed to open file."
            }
        }
    }

    @JvmStatic
    fun openUrlExternal(
        context: Context,
        url: String,
    ): String? {
        return try {
            val uri = Uri.parse(url)
            val scheme = uri.scheme?.lowercase()
            require(scheme == "http" || scheme == "https") {
                "Unsupported URL scheme: ${uri.scheme}"
            }

            val intent =
                Intent(Intent.ACTION_VIEW, uri).apply {
                    addCategory(Intent.CATEGORY_BROWSABLE)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
            startIntentForExternalAction(context, intent)
            null
        } catch (_: android.content.ActivityNotFoundException) {
            "No app can open this link."
        } catch (error: Throwable) {
            val message = error.message?.trim().orEmpty()
            if (message.isNotEmpty()) {
                "Failed to open link: $message"
            } else {
                "Failed to open link."
            }
        }
    }

    internal fun createChooserIntent(
        context: Context,
        absolutePath: String,
        mimeType: String?,
    ): Intent = createChooserIntent(context, createViewIntent(context, absolutePath, mimeType))

    internal fun createChooserIntent(
        context: Context,
        viewIntent: Intent,
        alternateViewIntents: Array<Intent> = emptyArray(),
    ): Intent {
        val contentUri = requireNotNull(viewIntent.data) { "Missing content URI for chooser intent" }
        return createChooserIntentWithReadAccess(
            context,
            viewIntent,
            listOf(contentUri),
            contentUri.lastPathSegment ?: "file",
            alternateViewIntents,
        )
    }

    internal fun createViewIntent(
        context: Context,
        absolutePath: String,
        mimeType: String?,
    ): Intent = createViewIntent(context, absolutePath, mimeType, null)

    private fun createViewIntent(
        context: Context,
        absolutePath: String,
        mimeType: String?,
        fallbackMimeType: String?,
    ): Intent {
        val file = requireOpenExternalStagedFile(context, absolutePath)
        val effectiveMimeType = fallbackMimeType ?: resolveMimeType(file, mimeType)
        val contentUri = createContentUri(context, file)

        return Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(contentUri, effectiveMimeType)
            addCategory(Intent.CATEGORY_DEFAULT)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }

    private fun createTypelessViewIntent(
        context: Context,
        absolutePath: String,
    ): Intent {
        val file = requireOpenExternalStagedFile(context, absolutePath)
        val contentUri = createContentUri(context, file)

        return Intent(Intent.ACTION_VIEW).apply {
            setData(contentUri)
            addCategory(Intent.CATEGORY_DEFAULT)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }

    private fun resolveMimeType(
        file: File,
        mimeType: String?,
    ): String =
        mimeType?.trim()?.takeIf { it.isNotEmpty() }
            ?: URLConnection.guessContentTypeFromName(file.name)
            ?: "application/octet-stream"

    private fun startOpenChooser(
        context: Context,
        chooserIntent: Intent,
    ): String? =
        try {
            startIntentForExternalAction(context, chooserIntent)
            null
        } catch (_: android.content.ActivityNotFoundException) {
            null
        }

    private fun requireOpenExternalStagedFile(
        context: Context,
        absolutePath: String,
    ): File =
        requireExternalIntentStagedFile(
            context = context,
            file = File(absolutePath),
            stagingDirName = OPEN_EXTERNAL_STAGING_DIR,
        )

    private fun createContentUri(
        context: Context,
        file: File,
    ): Uri =
        FileProvider.getUriForFile(
            context,
            "${context.packageName}.fileprovider",
            file,
        )
}
