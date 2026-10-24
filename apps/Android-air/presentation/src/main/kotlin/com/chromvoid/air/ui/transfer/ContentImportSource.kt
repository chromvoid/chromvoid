package com.chromvoid.air.ui.transfer

import android.content.Context
import android.net.Uri
import android.provider.OpenableColumns
import java.io.IOException
import java.io.InputStream

/**
 * A document the person chose or another app shared, read through the
 * content resolver each time Core asks for it; nothing is copied aside.
 */
public class ContentImportSource(private val context: Context, private val uri: Uri) : ImportSource {
    override val name: String = runCatching {
        context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use {
            if (it.moveToFirst()) it.getString(0) else null
        }
    }.getOrNull() ?: uri.lastPathSegment.orEmpty()

    override fun open(): InputStream = context.contentResolver.openInputStream(uri) ?: throw IOException("unreadable")
}
