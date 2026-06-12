package com.chromvoid.app.nativebridge

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.chromvoid.app.shared.AndroidRuntimeAccess
import java.io.File

internal const val SHARE_FILES_STAGING_DIR = "chromvoid-share"
internal const val OPEN_EXTERNAL_STAGING_DIR = "chromvoid-open"

internal fun buildUriClipData(
    context: Context,
    label: CharSequence,
    uris: List<Uri>,
): ClipData? {
    val firstUri = uris.firstOrNull() ?: return null

    return ClipData.newUri(context.contentResolver, label, firstUri).apply {
        uris.drop(1).forEach { uri ->
            addItem(ClipData.Item(uri))
        }
    }
}

internal fun createChooserIntentWithReadAccess(
    context: Context,
    targetIntent: Intent,
    uris: List<Uri>,
    label: CharSequence,
    alternateIntents: Array<Intent> = emptyArray(),
): Intent {
    val clipData = buildUriClipData(context, label, uris)
    if (clipData != null) {
        targetIntent.clipData = clipData
        targetIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        alternateIntents.forEach { intent ->
            intent.clipData = clipData
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
    }

    return Intent.createChooser(targetIntent, null).apply {
        if (alternateIntents.isNotEmpty()) {
            putExtra(Intent.EXTRA_ALTERNATE_INTENTS, alternateIntents)
        }
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (clipData != null) {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            this.clipData = clipData
        }
    }
}

internal fun requireExternalIntentStagedFile(
    context: Context,
    file: File,
    stagingDirName: String,
): File {
    val canonicalFile = file.canonicalFile
    val filePath = canonicalFile.path

    val stagingRoots =
        listOfNotNull(context.cacheDir, context.externalCacheDir)
            .map { cacheDir -> File(cacheDir, stagingDirName).canonicalFile }
    val isInAllowedStagingRoot =
        stagingRoots.any { stagingRoot ->
            filePath.startsWith(stagingRoot.path + File.separator)
        }

    require(isInAllowedStagingRoot) {
        "File is outside the allowed staging directory"
    }
    require(canonicalFile.isFile) {
        "File does not exist or is not a regular file"
    }
    return canonicalFile
}

internal fun resolveExternalIntentLaunchContext(context: Context): Context {
    val currentActivity = AndroidRuntimeAccess.appGraphOrNull()?.appGateActivityRegistry?.current()
    return currentActivity ?: context
}

internal fun startIntentForExternalAction(
    context: Context,
    intent: Intent,
) {
    // Prefer the foreground activity so Android treats the launch as a direct user action.
    resolveExternalIntentLaunchContext(context).startActivity(intent)
}
