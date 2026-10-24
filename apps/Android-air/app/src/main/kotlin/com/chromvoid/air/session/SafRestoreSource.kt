package com.chromvoid.air.session

import android.content.Context
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import com.chromvoid.air.ui.maintenance.RestoreArtifact
import com.chromvoid.air.ui.maintenance.RestoreSource
import java.io.FileNotFoundException
import java.io.IOException
import java.io.InputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * A backup read from the folder the person picked through the system picker:
 * the folder a backup was saved in, holding its files by the names Core gave
 * them. Each file is streamed, never read whole, and held to the size Core
 * allows it both from what the folder reports and from what is actually read.
 */
internal class SafRestoreSource(private val context: Context, private val tree: Uri) : RestoreSource {
    private class Open(val stream: InputStream, val maximumBytes: Long, var read: Long = 0)

    private val resolver = context.contentResolver
    private var files: List<Open?> = emptyList()

    override val label: String by lazy { displayName() ?: tree.lastPathSegment.orEmpty() }

    override suspend fun open(artifacts: List<RestoreArtifact>): Long = withContext(Dispatchers.IO) {
        close()
        val children = children()
        var total = 0L
        val opened = mutableListOf<Open?>()
        try {
            artifacts.forEach { artifact ->
                val child = children[artifact.name]
                if (child == null) {
                    if (artifact.required) throw FileNotFoundException("The backup has no ${artifact.name}")
                    opened += null
                    return@forEach
                }
                if (child.directory) throw IOException("${artifact.name} is a folder, not a backup file")
                if (child.size > artifact.maximumBytes) {
                    throw IOException("${artifact.name} is larger than a backup allows")
                }
                val stream = resolver.openInputStream(child.uri)
                    ?: throw IOException("${artifact.name} could not be opened")
                opened += Open(stream, artifact.maximumBytes)
                total += child.size
            }
        } catch (error: Throwable) {
            opened.forEach { runCatching { it?.stream?.close() } }
            throw error
        }
        files = opened
        total
    }

    override suspend fun read(artifact: Int, maximum: Int): ByteArray? = withContext(Dispatchers.IO) {
        check(artifact in files.indices) { "The backup folder is not open" }
        val file = files[artifact] ?: return@withContext null
        val buffer = ByteArray(maximum)
        var filled = 0
        while (filled < maximum) {
            val count = file.stream.read(buffer, filled, maximum - filled)
            if (count < 0) break
            filled += count
        }
        file.read += filled
        // The folder's own report of a file's size is not trusted to stop a longer one.
        if (file.read > file.maximumBytes) throw IOException("A backup file is larger than a backup allows")
        if (filled == maximum) buffer else buffer.copyOf(filled)
    }

    override suspend fun close() {
        val open = files
        files = emptyList()
        withContext(Dispatchers.IO) {
            var failure: Throwable? = null
            open.forEach { file -> runCatching { file?.stream?.close() }.onFailure { failure = failure ?: it } }
            failure?.let { throw it }
        }
    }

    private class Child(val uri: Uri, val directory: Boolean, val size: Long)

    /** The folder's files by name. */
    private fun children(): Map<String, Child> {
        val folder = DocumentsContract.getTreeDocumentId(tree)
        val listing = DocumentsContract.buildChildDocumentsUriUsingTree(tree, folder)
        val columns = arrayOf(
            Document.COLUMN_DOCUMENT_ID,
            Document.COLUMN_DISPLAY_NAME,
            Document.COLUMN_MIME_TYPE,
            Document.COLUMN_SIZE,
        )
        val children = mutableMapOf<String, Child>()
        resolver.query(listing, columns, null, null, null)?.use { cursor ->
            while (cursor.moveToNext()) {
                val name = cursor.getString(1) ?: continue
                children[name] = Child(
                    uri = DocumentsContract.buildDocumentUriUsingTree(tree, cursor.getString(0)),
                    directory = cursor.getString(2) == Document.MIME_TYPE_DIR,
                    size = if (cursor.isNull(3)) 0 else cursor.getLong(3),
                )
            }
        } ?: throw IOException("The backup folder could not be read")
        return children
    }

    private fun displayName(): String? = runCatching {
        val document = DocumentsContract.buildDocumentUriUsingTree(tree, DocumentsContract.getTreeDocumentId(tree))
        resolver.query(document, arrayOf(Document.COLUMN_DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }
    }.getOrNull()
}
