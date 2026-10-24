package com.chromvoid.air.ui.files

import com.chromvoid.air.bridge.wire.CatalogDocumentLinkKind
import com.chromvoid.air.bridge.wire.CatalogDocumentLinkResponse
import com.chromvoid.air.bridge.wire.CatalogFolderPageRequest
import com.chromvoid.air.bridge.wire.CatalogFolderPageResponse
import com.chromvoid.air.bridge.wire.CatalogListItem
import com.chromvoid.air.bridge.wire.SourceMetadataResponse
import com.chromvoid.air.bridge.wire.UploadResponse

/**
 * What the Files screens may ask of the vault's catalog. Core owns paths,
 * filtering, ordering, versions and every write; each call names the
 * generation it belongs to, so an answer from a session that has since locked
 * is refused by Rust instead of reaching a screen.
 */
public interface FileStore {
    /** One page of a folder, or of a recursive search below it. */
    public suspend fun filePage(request: CatalogFolderPageRequest, generation: ULong): CatalogFolderPageResponse

    public suspend fun createFolder(name: String, parent: String, generation: ULong)

    public suspend fun renameFile(id: Long, name: String, generation: ULong)

    /** Moves an item into [parent]; an item already named the same there is not replaced. */
    public suspend fun moveFile(id: Long, parent: String, generation: ULong)

    /** Deletes a file, or a folder with everything in it. */
    public suspend fun deleteFile(id: Long, generation: ULong)

    public suspend fun fileInfo(id: Long, generation: ULong): SourceMetadataResponse

    /** The largest note, in UTF-8 bytes, the editor may save. */
    public val documentByteLimit: Long

    /**
     * Streams [source] into a new file in [parent]; returns only after Core
     * confirmed it or the writer was released. [progress] gets bytes sent and total.
     */
    public suspend fun importFile(
        source: FileSource,
        parent: String,
        generation: ULong,
        progress: (Long, Long) -> Unit,
    ): UploadResponse

    /**
     * Imports an image for a note: Core names it inside [folder], creating the
     * folder when needed, the bytes go through the same create-only writer as
     * any import, and the Markdown that links it comes back only once the
     * write is confirmed.
     */
    public suspend fun importAttachment(
        source: FileSource,
        folder: String,
        generation: ULong,
        progress: (Long, Long) -> Unit,
    ): String

    /** Writes [text] as a new Markdown file; the draft never enters a command envelope. */
    public suspend fun createNote(name: String, text: String, parent: String, generation: ULong): UploadResponse

    /**
     * Reads a whole file into memory for a viewer, refusing one larger than
     * [maximumBytes] before reading it. [head] receives the first chunk once,
     * before the rest arrives, when there is more than one. The caller clears
     * the returned bytes when done.
     */
    public suspend fun readFile(
        id: Long,
        generation: ULong,
        maximumBytes: Long,
        head: (ByteArray) -> Unit = {},
    ): FileContent

    /**
     * A text document read whole, with the revision a save must name. Refuses
     * a file larger than [documentByteLimit] or one that is not UTF-8 text.
     */
    public suspend fun readDocument(id: Long, generation: ULong): OpenedDocument

    /**
     * Replaces a document's text, naming the revision it was read at; Core
     * refuses with `ERR_STALE_SOURCE` when the file changed since.
     */
    public suspend fun saveDocument(id: Long, sourceRevision: Long, text: String, generation: ULong): Long

    /** Resolves a link in the document [sourceId] against the catalog; nothing is read or changed. */
    public suspend fun resolveLink(
        sourceId: Long,
        path: String,
        kind: CatalogDocumentLinkKind,
        generation: ULong,
    ): CatalogDocumentLinkResponse

    /**
     * A reader of one file pinned to its current revision, for a player that
     * reads ranges as it plays. The caller cancels it.
     */
    public fun openReader(id: Long, generation: ULong): FileReader

    /** The first chunk of a file, where a camera keeps its records. The caller clears it. */
    public suspend fun readHead(id: Long, generation: ULong): ByteArray

    /**
     * A stored, vault-encrypted image derivative. [ensure] has Core convert and
     * store a missing one; without it a missing one is Core's refusal.
     */
    public suspend fun derivative(
        id: Long,
        sourceRevision: Long,
        tier: DerivativeTier,
        ensure: Boolean,
        generation: ULong,
    ): ByteArray

    /**
     * Streams a file out of the vault into [destination], chunk by chunk; a
     * failure abandons the destination rather than leave half a copy.
     */
    public suspend fun exportFile(
        id: Long,
        destination: FileDestination,
        generation: ULong,
        progress: (Long, Long) -> Unit,
    ): SourceMetadataResponse
}

/** A document as read, and the revision its text belongs to. */
public data class OpenedDocument(
    val nodeId: Long,
    val sourceRevision: Long,
    val name: String,
    val text: String,
    val mimeType: String?,
)

/** The file is not UTF-8 text the editor can hold. */
public class NotText : Exception("The file is not UTF-8 text")

/** Positioned reads of one file under the revision it had when opened. */
public interface FileReader {
    /** The most one read returns. */
    public val maximumChunkBytes: Long

    /** One chunk from [offset]; the caller clears its bytes. */
    public suspend fun read(offset: Long, length: Long): FileContent

    public fun cancel()
}

/** A whole file read for a viewer, and the revision it was read at. The caller clears [bytes]. */
public class FileContent(public val metadata: SourceMetadataResponse, public val bytes: ByteArray)

/** A file larger than a viewer may hold in memory. */
public class FileTooLarge : Exception("The file is too large to open in memory")

/** The file changed while it was read; reading it again shows the new one. */
public class FileChanged : Exception("The file changed while it was read")

/** Core's image derivative sizes: `preview` up to 1920 px on the long edge, `thumbnail` up to 256. */
public enum class DerivativeTier(public val wire: String) { PREVIEW("preview"), THUMBNAIL("thumbnail") }

/** What a picked document says about itself before it is read. */
public data class FileSourceInfo(val name: String, val size: Long, val mimeType: String?)

/** A document the person picked on the device, read once from start to end. */
public interface FileSource {
    /** A name to show before the document is opened. */
    public val label: String

    public suspend fun open(): FileSourceInfo

    /** The next bytes, at most [maximum]; empty at the end. */
    public suspend fun read(maximum: Int): ByteArray

    public suspend fun close()
}

/** A document on the device receiving an exported copy. */
public interface FileDestination {
    public suspend fun write(bytes: ByteArray)

    /** Completes the copy. */
    public suspend fun finish()

    /** Closes and removes what was written: the copy is incomplete. */
    public suspend fun abandon()
}

/**
 * The device's side of a transfer: the documents the system pickers hand
 * back, opened by the app. Presentation launches the pickers and never touches
 * a file-system path.
 */
public interface FileDevice {
    public fun source(document: android.net.Uri): FileSource

    /**
     * An image the app may read only now - pasted or dropped into a note, its grant ending with
     * the gesture - opened before this returns. Null when it is no image or cannot be read.
     */
    public fun openImageNow(document: android.net.Uri): FileSource?

    /** The document the save picker created. */
    public fun destination(document: android.net.Uri): FileDestination

    /** A new document named [name] in a folder the folder picker granted. */
    public fun destination(folder: android.net.Uri, name: String, mimeType: String?): FileDestination

    /** A new item in the device's gallery for an image or a video; null for anything else. */
    public fun gallery(name: String, mimeType: String?): FileDestination?
}

/**
 * Copies handed to another app. The other app reads each file while it is
 * sent - from memory or a pipe, never from a file the app wrote - and the
 * offer ends when the vault locks.
 */
public interface FileSharing {
    /** The system share sheet for copies of [files]. */
    public fun share(files: List<CatalogListItem>, generation: ULong): android.content.Intent

    /** Opens a copy of [file] in an app that can show it. */
    public fun view(file: CatalogListItem, generation: ULong): android.content.Intent
}

/** The page size iOS uses; Core caps a page anyway. */
public const val FILE_PAGE_SIZE: Long = 50
