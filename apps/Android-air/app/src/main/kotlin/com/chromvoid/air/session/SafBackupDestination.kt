package com.chromvoid.air.session

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import com.chromvoid.air.ui.maintenance.BackupDestination
import java.io.IOException
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * A backup written into a folder the person picked through the system picker.
 * Each backup gets its own subfolder, because its files only restore together;
 * an interrupted backup removes that folder rather than leaving something that
 * looks restorable.
 */
internal class SafBackupDestination(
    private val context: Context,
    private val tree: Uri,
    private val now: () -> Date = { Date() },
) : BackupDestination {
    private val resolver = context.contentResolver
    private val folderName = "chromvoid-backup-" + FOLDER_TIME.format(now())
    private var folder: Uri? = null

    override val label: String get() = folderName

    override suspend fun writeArtifact(name: String, next: suspend () -> ByteArray) {
        val parent = folder ?: createFolder().also { folder = it }
        val file = withContext(Dispatchers.IO) {
            DocumentsContract.createDocument(resolver, parent, MIME_BINARY, name)
        } ?: throw IOException("The backup destination did not accept $name")
        try {
            val output = withContext(Dispatchers.IO) { resolver.openOutputStream(file) }
                ?: throw IOException("The backup destination could not be written")
            output.use {
                while (true) {
                    val chunk = next()
                    if (chunk.isEmpty()) break
                    withContext(Dispatchers.IO) { it.write(chunk) }
                }
                withContext(Dispatchers.IO) { it.flush() }
            }
        } catch (error: Throwable) {
            // A partial file would be read as a complete one; it goes with the failure.
            withContext(Dispatchers.IO) { runCatching { DocumentsContract.deleteDocument(resolver, file) } }
            throw error
        }
    }

    override suspend fun discard() {
        val created = folder ?: return
        folder = null
        withContext(Dispatchers.IO) { DocumentsContract.deleteDocument(resolver, created) }
    }

    private suspend fun createFolder(): Uri = withContext(Dispatchers.IO) {
        val parent = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
        DocumentsContract.createDocument(resolver, parent, DocumentsContract.Document.MIME_TYPE_DIR, folderName)
            ?: throw IOException("The chosen folder did not accept a new backup folder")
    }

    private companion object {
        const val MIME_BINARY = "application/octet-stream"
        val FOLDER_TIME: SimpleDateFormat = SimpleDateFormat("yyyyMMdd-HHmmss", Locale.US)
    }
}
