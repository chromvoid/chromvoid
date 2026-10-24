package com.chromvoid.air.session

import android.content.ContentProvider
import android.content.ContentValues
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import java.io.FileNotFoundException

/**
 * Serves the copies [FileShares] offers, read-only, to the apps a share or a
 * viewer granted them to. It is not exported; another app reaches an offer only
 * through the one-time grant on the intent that named it.
 */
internal class FileShareProvider : ContentProvider() {
    private val shares: FileShares get() = AirAppGraph.of(checkNotNull(context)).shares

    override fun onCreate(): Boolean = true

    override fun getType(uri: Uri): String? = shares.offer(uri)?.let { it.mimeType ?: FileShares.GENERIC }

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?,
    ): Cursor? {
        val offer = shares.offer(uri) ?: return null
        val columns = projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE)
        return MatrixCursor(columns, 1).apply {
            addRow(
                columns.map { column ->
                    when (column) {
                        OpenableColumns.DISPLAY_NAME -> offer.name
                        OpenableColumns.SIZE -> offer.size
                        else -> null
                    }
                },
            )
        }
    }

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        if (mode != "r") throw FileNotFoundException("Copies are read-only")
        return shares.open(uri)
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int = 0

    override fun update(
        uri: Uri,
        values: ContentValues?,
        selection: String?,
        selectionArgs: Array<out String>?,
    ): Int = 0
}
