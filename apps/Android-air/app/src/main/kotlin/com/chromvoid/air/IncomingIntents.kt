package com.chromvoid.air

import android.content.ContentResolver
import android.content.Intent
import android.net.Uri
import android.os.Build

/**
 * The documents another app hands ChromVoid: a share of one or several files,
 * or a credential export opened with it. Only `content:` addresses are taken -
 * the other app grants each one - so a share can never point the app at a
 * file of its own.
 */
internal object IncomingIntents {
    /**
     * The shared documents, empty for a share without files; null when
     * [intent] is no share. Recents relaunches a task with the intent that
     * started it, so a share replayed from history is no share.
     */
    fun sharedDocuments(intent: Intent): List<Uri>? {
        if (intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0) return null
        val documents = when (intent.action) {
            Intent.ACTION_SEND -> listOfNotNull(stream(intent)).ifEmpty { clipped(intent) }
            Intent.ACTION_SEND_MULTIPLE -> streams(intent).ifEmpty { clipped(intent) }
            Intent.ACTION_VIEW -> listOfNotNull(intent.data)
            else -> return null
        }
        return documents.filter { it.scheme == ContentResolver.SCHEME_CONTENT }.distinct()
    }

    private fun stream(intent: Intent): Uri? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
        @Suppress("DEPRECATION")
        intent.getParcelableExtra(Intent.EXTRA_STREAM)
    }

    private fun streams(intent: Intent): List<Uri> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java).orEmpty()
    } else {
        @Suppress("DEPRECATION")
        intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM).orEmpty()
    }

    private fun clipped(intent: Intent): List<Uri> {
        val clip = intent.clipData ?: return emptyList()
        return (0 until clip.itemCount).mapNotNull { clip.getItemAt(it).uri }
    }
}
