package com.chromvoid.air.session

import android.content.ContentValues
import android.content.Context
import android.os.Environment
import android.provider.MediaStore
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.webkit.MimeTypeMap
import com.chromvoid.air.ui.files.FileDestination
import com.chromvoid.air.ui.files.FileDevice
import com.chromvoid.air.ui.files.FileSource
import com.chromvoid.air.ui.files.FileSourceInfo
import java.io.FileNotFoundException
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The documents the system pickers hand back, opened through the content
 * resolver. Nothing is copied to the app's own storage: an import streams from
 * the picked document into Core, an export streams from Core into the document
 * the person chose.
 */
internal class SafFileDevice(context: Context) : FileDevice {
    private val context = context.applicationContext

    override fun source(document: Uri): FileSource = SafFileSource(context, document)

    override fun openImageNow(document: Uri): FileSource? {
        val source = SafFileSource(context, document)
        val info = runCatching { source.openNow() }.getOrNull() ?: return null
        if (info.mimeType?.startsWith("image/") == true) return source
        source.closeNow()
        return null
    }

    override fun destination(document: Uri): FileDestination = SafFileDestination(context) { document }

    override fun destination(folder: Uri, name: String, mimeType: String?): FileDestination =
        SafFileDestination(context) {
            val parent = DocumentsContract.buildDocumentUriUsingTree(
                folder,
                DocumentsContract.getTreeDocumentId(folder),
            )
            DocumentsContract.createDocument(
                context.contentResolver,
                parent,
                mimeType ?: "application/octet-stream",
                name,
            ) ?: throw FileNotFoundException("The folder did not take $name")
        }

    /**
     * An image or a video in the ChromVoid album of the shared gallery. The item
     * stays pending, invisible to other apps, until the copy is complete, and an
     * unfinished copy is deleted rather than left half-written. Android 10 and
     * later need no storage permission for items the app adds itself.
     */
    override fun gallery(name: String, mimeType: String?): FileDestination? {
        val type = mimeType ?: return null
        val (collection, folder) = when {
            type.startsWith("image/") -> MediaStore.Images.Media.getContentUri(VOLUME) to Environment.DIRECTORY_PICTURES
            type.startsWith("video/") -> MediaStore.Video.Media.getContentUri(VOLUME) to Environment.DIRECTORY_MOVIES
            else -> return null
        }
        val resolver = context.contentResolver
        return GalleryDestination(context) {
            val values = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, name)
                put(MediaStore.MediaColumns.MIME_TYPE, type)
                put(MediaStore.MediaColumns.RELATIVE_PATH, "$folder/$ALBUM")
                put(MediaStore.MediaColumns.IS_PENDING, 1)
            }
            resolver.insert(collection, values) ?: throw FileNotFoundException("The gallery did not take $name")
        }
    }

    private companion object {
        const val ALBUM = "ChromVoid"
        const val VOLUME = MediaStore.VOLUME_EXTERNAL_PRIMARY
    }
}

/** A gallery item written while pending and published only when complete. */
private class GalleryDestination(private val context: Context, create: () -> Uri) : FileDestination {
    private val document = SafFileDestination(context, create)

    override suspend fun write(bytes: ByteArray) = document.write(bytes)

    override suspend fun finish() {
        document.finish()
        val item = checkNotNull(document.created)
        withContext(Dispatchers.IO) {
            val published = ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }
            context.contentResolver.update(item, published, null, null)
        }
    }

    override suspend fun abandon() = document.abandon()
}

/** A picked document, its size taken from the provider and held to while it is read. */
private class SafFileSource(private val context: Context, private val document: Uri) : FileSource {
    private var stream: InputStream? = null
    private var opened: FileSourceInfo? = null

    override val label: String by lazy { query()?.first ?: document.lastPathSegment.orEmpty() }

    override suspend fun open(): FileSourceInfo = withContext(Dispatchers.IO) { openNow() }

    /** Opens the document on this thread, while a grant that ends with the caller still holds. */
    fun openNow(): FileSourceInfo {
        opened?.let { return it }
        val resolver = context.contentResolver
        // A provider that answers no query still names the document in its URI.
        val (name, reported) = query() ?: (document.lastPathSegment.orEmpty() to null)
        if (name.isBlank()) throw FileNotFoundException("The document has no name")
        // A provider that does not report a size is asked for its descriptor's length.
        val size = reported ?: resolver.openAssetFileDescriptor(document, "r")?.use { it.length }
            ?.takeIf { it >= 0 }
            ?: throw IOException("The document does not tell its size")
        stream = resolver.openInputStream(document) ?: throw FileNotFoundException("The document could not be opened")
        // A provider that names no type is read by the name's extension, as iOS reads a file's type.
        val type = resolver.getType(document)
            ?: MimeTypeMap.getSingleton().getMimeTypeFromExtension(name.substringAfterLast('.', "").lowercase())
        return FileSourceInfo(name, size, type).also { opened = it }
    }

    override suspend fun read(maximum: Int): ByteArray = withContext(Dispatchers.IO) {
        val input = stream ?: throw IOException("The document is not open")
        val buffer = ByteArray(maximum)
        var filled = 0
        while (filled < maximum) {
            val count = input.read(buffer, filled, maximum - filled)
            if (count < 0) break
            filled += count
        }
        if (filled == maximum) buffer else buffer.copyOf(filled).also { buffer.fill(0) }
    }

    override suspend fun close() {
        withContext(Dispatchers.IO) { closeNow() }
    }

    fun closeNow() {
        val input = stream ?: return
        stream = null
        runCatching { input.close() }
    }

    private fun query(): Pair<String, Long?>? =
        context.contentResolver.query(
            document,
            arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE),
            null,
            null,
            null,
        )?.use { cursor ->
            if (!cursor.moveToFirst()) return@use null
            val name = cursor.getString(0)?.takeIf { it.isNotBlank() } ?: document.lastPathSegment.orEmpty()
            val size = if (cursor.isNull(1)) null else cursor.getLong(1)
            name to size
        }
}

/** A document receiving an exported copy; created when the first bytes arrive. */
private class SafFileDestination(private val context: Context, private val create: () -> Uri) : FileDestination {
    private var document: Uri? = null

    /** The document once the first bytes created it. */
    val created: Uri? get() = document
    private var stream: OutputStream? = null

    override suspend fun write(bytes: ByteArray): Unit = withContext(Dispatchers.IO) { output().write(bytes) }

    override suspend fun finish(): Unit = withContext(Dispatchers.IO) {
        // An empty file still needs its document.
        val out = output()
        stream = null
        out.flush()
        out.close()
    }

    override suspend fun abandon(): Unit = withContext(Dispatchers.IO) {
        runCatching { stream?.close() }
        stream = null
        val created = document ?: return@withContext
        document = null
        runCatching { DocumentsContract.deleteDocument(context.contentResolver, created) }
    }

    private fun output(): OutputStream {
        stream?.let { return it }
        val target = document ?: create().also { document = it }
        val out = context.contentResolver.openOutputStream(target, "wt")
            ?: throw FileNotFoundException("The copy could not be written")
        return out.also { stream = it }
    }
}
