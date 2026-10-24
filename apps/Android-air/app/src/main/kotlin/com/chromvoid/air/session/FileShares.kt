package com.chromvoid.air.session

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.ParcelFileDescriptor
import android.system.Os
import android.system.OsConstants
import com.chromvoid.air.bridge.wire.CatalogListItem
import com.chromvoid.air.ui.files.FileDestination
import com.chromvoid.air.ui.files.FileSharing
import com.chromvoid.air.ui.files.FileStore
import java.io.FileNotFoundException
import java.io.FileOutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

/**
 * Copies of vault files offered to other apps through [FileShareProvider].
 *
 * An offer is a random token naming one file of one generation. When the other
 * app opens it, the file streams from Core's reader: into an anonymous memory
 * file the reader can seek in, when the device has them and the file is small
 * enough, and otherwise into a pipe. Nothing is written to storage. A lock
 * withdraws every offer and stops every copy in flight; Core would refuse the
 * old generation anyway.
 */
internal class FileShares(
    private val context: Context,
    private val files: () -> FileStore,
    private val scope: CoroutineScope,
    /** Files up to this size are copied into memory so a viewer can seek; larger ones stream. */
    private val memoryLimitBytes: Long = MEMORY_LIMIT_BYTES,
) : FileSharing {
    class Offer(val generation: ULong, val nodeId: Long, val name: String, val mimeType: String?, val size: Long?)

    private val offers = ConcurrentHashMap<String, Offer>()
    private val pumps = ConcurrentHashMap.newKeySet<Job>()

    private val authority: String get() = context.packageName + AUTHORITY_SUFFIX

    override fun share(files: List<CatalogListItem>, generation: ULong): Intent {
        val uris = files.map { publish(it, generation) }
        val send = if (uris.size == 1) {
            Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, uris.single())
        } else {
            Intent(Intent.ACTION_SEND_MULTIPLE).putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(uris))
        }
        send.type = files.map { it.mimeType ?: GENERIC }.distinct().singleOrNull() ?: GENERIC
        send.clipData = clip(uris)
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        return Intent.createChooser(send, null)
    }

    override fun view(file: CatalogListItem, generation: ULong): Intent {
        val uri = publish(file, generation)
        return Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, file.mimeType ?: GENERIC)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    fun offer(uri: Uri): Offer? = uri.pathSegments.firstOrNull()?.let(offers::get)

    /** Opens an offer for reading; blocks the provider's binder thread only for a memory copy. */
    fun open(uri: Uri): ParcelFileDescriptor {
        val offer = offer(uri) ?: throw FileNotFoundException("This copy is no longer offered")
        val size = offer.size
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && size != null && size <= memoryLimitBytes) {
            memory(offer)
        } else {
            pipe(offer)
        }
    }

    /** Withdraws every offer and stops every copy in flight. */
    fun revoke() {
        offers.clear()
        pumps.forEach(Job::cancel)
        pumps.clear()
    }

    private fun publish(file: CatalogListItem, generation: ULong): Uri {
        val token = UUID.randomUUID().toString()
        offers[token] = Offer(generation, file.nodeID, file.name, file.mimeType, file.size)
        return Uri.Builder().scheme("content").authority(authority).appendPath(token).appendPath(file.name).build()
    }

    private fun clip(uris: List<Uri>): ClipData =
        ClipData.newRawUri(null, uris.first()).apply { uris.drop(1).forEach { addItem(ClipData.Item(it)) } }

    @androidx.annotation.RequiresApi(Build.VERSION_CODES.R)
    private fun memory(offer: Offer): ParcelFileDescriptor {
        val descriptor = Os.memfd_create("chromvoid-copy", OsConstants.MFD_CLOEXEC)
        try {
            FileOutputStream(descriptor).use { out ->
                runBlocking(Dispatchers.IO) {
                    files().exportFile(offer.nodeId, StreamDestination(out), offer.generation) { _, _ -> }
                }
            }
            Os.lseek(descriptor, 0, OsConstants.SEEK_SET)
            return ParcelFileDescriptor.dup(descriptor)
        } catch (error: Exception) {
            throw FileNotFoundException("The copy could not be made").apply { initCause(error) }
        } finally {
            runCatching { Os.close(descriptor) }
        }
    }

    private fun pipe(offer: Offer): ParcelFileDescriptor {
        val (read, write) = ParcelFileDescriptor.createReliablePipe()
        val job = scope.launch(Dispatchers.IO) {
            val out = FileOutputStream(write.fileDescriptor)
            try {
                files().exportFile(offer.nodeId, StreamDestination(out), offer.generation) { _, _ -> }
                write.close()
            } catch (error: Throwable) {
                // The reader learns the copy stopped rather than taking a short file for a whole one.
                runCatching { write.closeWithError("The copy stopped") }
                if (error is kotlinx.coroutines.CancellationException) throw error
            }
        }
        pumps += job
        job.invokeOnCompletion { pumps -= job }
        return read
    }

    /** The receiving end of a copy; closing is left to the stream's owner. */
    private class StreamDestination(private val out: java.io.OutputStream) : FileDestination {
        override suspend fun write(bytes: ByteArray) {
            out.write(bytes)
        }

        override suspend fun finish() {
            out.flush()
        }

        override suspend fun abandon() = Unit
    }

    companion object {
        const val AUTHORITY_SUFFIX: String = ".files"
        const val GENERIC: String = "application/octet-stream"

        const val MEMORY_LIMIT_BYTES: Long = 64L * 1024 * 1024
    }
}
