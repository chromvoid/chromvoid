package com.chromvoid.air.ui.files

import com.chromvoid.air.bridge.wire.CatalogListItem
import com.chromvoid.air.bridge.wire.SourceMetadataResponse
import com.chromvoid.air.ui.documents.DocumentModel
import com.chromvoid.air.ui.documents.DocumentNavigator
import com.chromvoid.air.ui.media.ImageDecoding
import com.chromvoid.air.ui.media.ImageGalleryModel
import com.chromvoid.air.ui.media.ImagePosterCache
import com.chromvoid.air.ui.media.MediaPlayers
import com.chromvoid.air.ui.media.MediaPreviewModel
import com.chromvoid.air.ui.media.PdfPreviewModel
import com.chromvoid.air.ui.support.FailureKind
import com.chromvoid.air.ui.support.failureKind
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Everything the Files root shows for one unlocked generation: the folders
 * opened from the root, and the one sheet over the top folder - the name of a
 * new or renamed item, a file's information, a delete to confirm, a batch
 * move or delete, or a viewer or document opened from it. It is created when
 * the session unlocks and closed when it stops being unlocked, so a lock
 * leaves no listing, query, draft or selection behind.
 */
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
public class FilesScope(
    private val store: FileStore,
    public val generation: ULong,
    private val settings: FileSettings,
    dispatcher: CoroutineDispatcher = Dispatchers.Main.immediate,
    /** The device's documents, for import and export; null where there are none (tests, previews). */
    public val device: FileDevice? = null,
    /** Copies handed to other apps; null where there is no provider (tests, previews). */
    private val sharing: FileSharing? = null,
    /** Players for audio and video; null where there are none (tests, previews). */
    private val players: MediaPlayers? = null,
    /** The camera, for Take Photo in an import; null where there is none (tests, previews). */
    private val camera: PhotoCapture? = null,
    private val searchDelayMillis: Long = FolderModel.SEARCH_DELAY_MILLIS,
) {
    /** The name being chosen for a new folder or for a renamed item. */
    public data class NameEdit(
        /** The item renamed; null for a new folder. */
        val item: CatalogListItem?,
        val name: String,
        val saving: Boolean = false,
        val issue: FileIssue? = null,
        /** Increments on each refused save, so the field takes focus again. */
        val attempts: Int = 0,
    )

    /** A file's information and the folder it was opened from. */
    public data class FileInfo(val metadata: SourceMetadataResponse, val location: String)

    private val scope = CoroutineScope(SupervisorJob() + dispatcher)

    private val mutableLevels = MutableStateFlow(listOf(folder(FolderModel.ROOT)))

    /** The root first, then each folder opened from it. */
    public val levels: StateFlow<List<FolderModel>> = mutableLevels.asStateFlow()

    /** The folder on screen. */
    public val top: FolderModel get() = mutableLevels.value.last()

    private val mutableEdit = MutableStateFlow<NameEdit?>(null)
    public val edit: StateFlow<NameEdit?> = mutableEdit.asStateFlow()

    private val mutableInfo = MutableStateFlow<FileInfo?>(null)
    public val info: StateFlow<FileInfo?> = mutableInfo.asStateFlow()

    private val mutableDeleting = MutableStateFlow<CatalogListItem?>(null)

    /** The single item whose delete waits for confirmation. */
    public val deleting: StateFlow<CatalogListItem?> = mutableDeleting.asStateFlow()

    private val mutableOperation = MutableStateFlow<FileOperationModel?>(null)

    /** A batch move or delete, drawn in place of the folder. */
    public val operation: StateFlow<FileOperationModel?> = mutableOperation.asStateFlow()

    private val mutableImport = MutableStateFlow<FileImportModel?>(null)

    /** Files being imported into the folder on screen. */
    public val importing: StateFlow<FileImportModel?> = mutableImport.asStateFlow()

    private val mutableNote = MutableStateFlow<NoteCreationModel?>(null)

    /** A new note for the folder on screen. */
    public val note: StateFlow<NoteCreationModel?> = mutableNote.asStateFlow()

    private val mutableExport = MutableStateFlow<FileExportModel?>(null)

    /** Copies being saved outside the vault. */
    public val export: StateFlow<FileExportModel?> = mutableExport.asStateFlow()

    private val mutableOutgoing = MutableStateFlow<android.content.Intent?>(null)

    /** A share sheet or a viewer waiting to be started; the screen starts it once. */
    public val outgoing: StateFlow<android.content.Intent?> = mutableOutgoing.asStateFlow()

    private val mutableGallery = MutableStateFlow<ImageGalleryModel?>(null)

    /** The images of the folder on screen, opened at one of them. */
    public val gallery: StateFlow<ImageGalleryModel?> = mutableGallery.asStateFlow()

    private val mutablePdf = MutableStateFlow<PdfPreviewModel?>(null)

    /** A PDF opened from the folder on screen. */
    public val pdf: StateFlow<PdfPreviewModel?> = mutablePdf.asStateFlow()

    private val mutableMedia = MutableStateFlow<MediaPreviewModel?>(null)

    /** Audio or video opened from the folder on screen. */
    public val media: StateFlow<MediaPreviewModel?> = mutableMedia.asStateFlow()

    private val mutableDocument = MutableStateFlow<DocumentNavigator?>(null)

    /** A text or Markdown document opened from the folder on screen, with the documents its links led to. */
    public val document: StateFlow<DocumentNavigator?> = mutableDocument.asStateFlow()

    private val mutableAttachmentFolder = MutableStateFlow<FolderChooserModel?>(null)

    /** The picker for where note images go, opened from Settings. */
    public val attachmentFolder: StateFlow<FolderChooserModel?> = mutableAttachmentFolder.asStateFlow()

    private val mutableIncoming = MutableStateFlow<IncomingShareModel?>(null)

    /** Files another app shared, waiting for Save or Cancel. */
    public val incoming: StateFlow<IncomingShareModel?> = mutableIncoming.asStateFlow()

    /** Images decoded in this session; emptied when it closes. */
    private val posters = ImagePosterCache()

    private val mutableBusy = MutableStateFlow(false)

    /** A single delete is in flight. */
    public val busy: StateFlow<Boolean> = mutableBusy.asStateFlow()

    private val mutableIssue = MutableStateFlow<FileIssue?>(null)

    /** A change outside the name editor that did not happen, until read. */
    public val issue: StateFlow<FileIssue?> = mutableIssue.asStateFlow()

    private var infoRead: Job? = null
    private var synchronizedSequence: ULong? = null

    init {
        // A folder still showing the old default follows the setting; one the
        // user switched by hand keeps its choice.
        scope.launch {
            var previous = settings.state.value.showHidden
            settings.state.collect { state ->
                if (state.showHidden != previous) {
                    mutableLevels.value.forEach { it.followHiddenDefault(previous, state.showHidden) }
                    previous = state.showHidden
                }
            }
        }
    }

    /**
     * The runtime reported a change. Every open folder reads again; the first
     * call only records where this scope starts.
     */
    public fun synchronize(sequence: ULong) {
        val previous = synchronizedSequence
        synchronizedSequence = sequence
        if (previous == null || previous == sequence) return
        mutableAttachmentFolder.value?.synchronize()
        if (mutableEdit.value?.saving == true) return
        mutableLevels.value.forEach { it.reload() }
    }

    /**
     * Files another app shared, for this session to review and save. A share
     * that arrives while another is still importing is refused and left to
     * its app; one still under review is replaced.
     */
    public fun receiveShare(sources: List<FileSource>, onCredentials: (() -> Unit)?): Boolean {
        val current = mutableIncoming.value
        if (current?.import?.value?.state?.value?.busy == true) return false
        current?.revoke()
        val handOff = onCredentials?.let { toPasswords ->
            {
                mutableIncoming.value = null
                toPasswords()
            }
        }
        mutableIncoming.value = IncomingShareModel(store, generation, scope, sources, handOff) { destination ->
            mutableLevels.value.filter { it.path == destination }.forEach { it.reload() }
        }
        return true
    }

    /** Cancel or Done on the shared files; Stop comes first while they are written. */
    public fun closeIncoming() {
        val model = mutableIncoming.value ?: return
        model.close()
        if (model.state.value.phase == IncomingShareModel.Phase.CLOSED) mutableIncoming.value = null
    }

    /** Opens the picker for where note images go; it is Settings' own sheet, apart from the Files root. */
    public fun chooseAttachmentFolder() {
        if (mutableAttachmentFolder.value != null) return
        mutableAttachmentFolder.value = FolderChooserModel(store, generation, scope, allowsRoot = false) { path ->
            settings.setAttachmentFolder(path)
            dismissAttachmentFolder()
        }
    }

    public fun dismissAttachmentFolder() {
        mutableAttachmentFolder.value?.close()
        mutableAttachmentFolder.value = null
    }

    /** A folder opens as a new level; a file shows its information until it has a viewer. */
    public fun open(item: CatalogListItem) {
        if (hasSheet) return
        val top = top
        if (top.state.value.selection != null) {
            top.toggleSelection(item)
            return
        }
        when {
            item.isDir -> {
                val path = item.path ?: return
                mutableLevels.value = mutableLevels.value + folder(path)
            }
            ImageDecoding.supports(item.name, item.mimeType) -> {
                val folder = top
                mutableGallery.value = ImageGalleryModel(
                    store,
                    generation,
                    scope,
                    folder.state.value.items,
                    item.nodeID,
                    folder.continuation(),
                    posters,
                )
            }
            PdfPreviewModel.supports(item.name, item.mimeType) ->
                mutablePdf.value = PdfPreviewModel(store, item.nodeID, generation, item.name, scope)
            players != null && MediaPreviewModel.supports(item.name, item.mimeType) ->
                mutableMedia.value = MediaPreviewModel(store, item.nodeID, generation, item.name, scope, players)
            DocumentModel.supports(item.name, item.mimeType) -> {
                val folder = top
                mutableDocument.value = DocumentNavigator(
                    store,
                    item.nodeID,
                    generation,
                    scope,
                    players,
                    settings = settings,
                    posters = posters,
                    onSaved = folder::reload,
                )
            }
            else -> showInfo(item)
        }
    }

    public fun closeMedia() {
        mutableMedia.value?.close()
        mutableMedia.value = null
    }

    public fun closePdf() {
        mutablePdf.value?.close()
        mutablePdf.value = null
    }

    /** Whether opening [item] shows it rather than its information. */
    public fun opensViewer(item: CatalogListItem): Boolean =
        item.isDir ||
            ImageDecoding.supports(item.name, item.mimeType) ||
            PdfPreviewModel.supports(item.name, item.mimeType) ||
            (players != null && MediaPreviewModel.supports(item.name, item.mimeType)) ||
            DocumentModel.supports(item.name, item.mimeType)

    /** The document stack closed; the screen asked about unsaved changes first. */
    public fun closeDocument() {
        mutableDocument.value?.close()
        mutableDocument.value = null
    }

    public fun closeGallery() {
        mutableGallery.value?.close()
        mutableGallery.value = null
    }

    /** Back from a folder; the root stays. */
    public fun closeFolder() {
        val levels = mutableLevels.value
        if (levels.size <= 1) return
        levels.last().close()
        mutableLevels.value = levels.dropLast(1)
    }

    public fun beginCreateFolder() {
        if (hasSheet) return
        mutableEdit.value = NameEdit(item = null, name = "")
    }

    public fun beginRename(item: CatalogListItem) {
        if (hasSheet) return
        mutableEdit.value = NameEdit(item = item, name = item.name)
    }

    public fun setName(name: String) {
        val edit = mutableEdit.value ?: return
        if (edit.saving || edit.name == name) return
        mutableEdit.value = edit.copy(name = name, issue = null)
    }

    public fun cancelEdit() {
        if (mutableEdit.value?.saving == true) return
        mutableEdit.value = null
    }

    /** Creates the folder in the one on screen, or renames the item; a refusal keeps the editor open. */
    public fun saveName() {
        val edit = mutableEdit.value ?: return
        if (edit.saving) return
        if (edit.name.isBlank()) {
            mutableEdit.value = edit.copy(issue = FileIssue.EMPTY_NAME, attempts = edit.attempts + 1)
            return
        }
        val folder = top
        mutableEdit.value = edit.copy(saving = true, issue = null)
        scope.launch {
            try {
                val item = edit.item
                if (item == null) {
                    store.createFolder(edit.name, folder.path, generation)
                } else {
                    store.renameFile(item.nodeID, keepingMarkdownSuffix(edit.name, item), generation)
                }
                mutableEdit.value = null
                folder.reload()
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (error.failureKind == FailureKind.REVOKED) {
                    close()
                    return@launch
                }
                val current = mutableEdit.value ?: return@launch
                mutableEdit.value = current.copy(
                    saving = false,
                    issue = error.fileIssue,
                    attempts = current.attempts + 1,
                )
            }
        }
    }

    /** Deletes one item, asking first when Settings says so. */
    public fun requestDelete(item: CatalogListItem) {
        if (hasSheet || mutableBusy.value) return
        if (settings.state.value.confirmDeletion) {
            mutableDeleting.value = item
        } else {
            delete(item)
        }
    }

    public fun cancelDelete() {
        mutableDeleting.value = null
    }

    public fun confirmDelete() {
        val item = mutableDeleting.value ?: return
        mutableDeleting.value = null
        delete(item)
    }

    /**
     * Moves or deletes [item], or the items chosen in the folder on screen. A
     * delete without confirmation starts at once, as on iOS.
     */
    public fun beginOperation(kind: FileOperationModel.Kind, item: CatalogListItem? = null) {
        if (hasSheet) return
        val folder = top
        val items = item?.let(::listOf) ?: folder.state.value.selection?.values?.sortedBy { it.nodeID }.orEmpty()
        if (items.isEmpty()) return
        val operation = FileOperationModel(
            kind,
            items,
            store,
            generation,
            scope,
            includeHidden = settings.state.value.showHidden,
        ) { completed ->
            folder.deselect(completed)
            folder.reload()
        }
        mutableOperation.value = operation
        if (kind == FileOperationModel.Kind.DELETE && !settings.state.value.confirmDeletion) operation.start()
    }

    /** Closes the batch once it is not running; what finished stays done. */
    public fun closeOperation() {
        val operation = mutableOperation.value ?: return
        val state = operation.state.value
        if (state.busy) return
        operation.close()
        mutableOperation.value = null
        // A finished batch leaves nothing chosen to act on again.
        if (state.phase == FileOperationModel.Phase.FINISHED) top.endSelection()
    }

    public fun beginImport() {
        if (hasSheet) return
        val folder = top
        mutableImport.value = FileImportModel(store, folder.path, generation, scope, camera) { folder.reload() }
    }

    /** Closes the import once nothing is being written; what was imported stays. */
    public fun closeImport() {
        val model = mutableImport.value ?: return
        if (model.state.value.busy) return
        model.close()
        mutableImport.value = null
    }

    public fun beginNote() {
        if (hasSheet) return
        val folder = top
        mutableNote.value = NoteCreationModel(store, folder.path, generation, scope) {
            mutableNote.value = null
            folder.reload()
        }
    }

    /** Cancel or Back on the note: a draft with anything in it asks first. */
    public fun dismissNote() {
        val model = mutableNote.value ?: return
        if (model.requestDismiss()) discardNote()
    }

    /** The person chose to throw the draft away. */
    public fun discardNote() {
        mutableNote.value?.close()
        mutableNote.value = null
    }

    /** Exports [item], or the items chosen in the folder on screen. */
    public fun beginExport(item: CatalogListItem? = null) {
        if (hasSheet) return
        val items = item?.let(::listOf) ?: top.state.value.selection?.values?.sortedBy { it.nodeID }.orEmpty()
        if (items.isEmpty()) return
        mutableExport.value = FileExportModel(items, store, generation, scope)
    }

    /** Whether copies can be handed to other apps at all. */
    public val canShare: Boolean get() = sharing != null

    /** Shares [item], or the files chosen in the folder on screen; folders are left out. */
    public fun share(item: CatalogListItem? = null) {
        val sharing = sharing ?: return
        if (hasSheet) return
        val items = item?.let(::listOf) ?: top.state.value.selection?.values?.sortedBy { it.nodeID }.orEmpty()
        val files = items.filterNot { it.isDir }
        if (files.isEmpty()) return
        mutableOutgoing.value = sharing.share(files, generation)
    }

    /** Opens [item] in another app that can show it. */
    public fun openElsewhere(item: CatalogListItem) {
        val sharing = sharing ?: return
        if (hasSheet || item.isDir) return
        mutableOutgoing.value = sharing.view(item, generation)
    }

    /** The screen started what was waiting, or found no app for it. */
    public fun outgoingHandled(started: Boolean) {
        mutableOutgoing.value = null
        if (!started) mutableIssue.value = FileIssue.NO_APP
    }

    /** Whether [item] is something the gallery takes. */
    public fun savesToGallery(item: CatalogListItem): Boolean =
        !item.isDir && item.mimeType.orEmpty().let { it.startsWith("image/") || it.startsWith("video/") }

    /** Saves a copy of an image or a video into the device's gallery, showing its progress and result. */
    public fun saveToGallery(item: CatalogListItem) {
        val device = device ?: return
        if (hasSheet || !savesToGallery(item)) return
        val model = FileExportModel(listOf(item), store, generation, scope, gallery = true)
        mutableExport.value = model
        model.exportTo { file ->
            device.gallery(file.name, file.mimeType)
                ?: throw java.io.IOException("The gallery does not take ${file.name}")
        }
    }

    public fun closeExport() {
        val model = mutableExport.value ?: return
        if (model.state.value.phase == FileExportModel.Phase.RUNNING) return
        val finished = model.state.value.phase == FileExportModel.Phase.FINISHED
        model.close()
        mutableExport.value = null
        if (finished) top.endSelection()
    }

    public fun showInfo(item: CatalogListItem) {
        if (hasSheet) return
        val location = top.path
        infoRead?.cancel()
        infoRead = scope.launch {
            try {
                val metadata = store.fileInfo(item.nodeID, generation)
                // Another sheet may have opened while the information was loading; it keeps priority.
                if (!hasSheet) mutableInfo.value = FileInfo(metadata, item.parentPath ?: location)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (error.failureKind == FailureKind.REVOKED) close() else mutableIssue.value = error.fileIssue
            }
        }
    }

    public fun closeInfo() {
        infoRead?.cancel()
        mutableInfo.value = null
    }

    public fun dismissIssue() {
        mutableIssue.value = null
    }

    /** The session ended: drop every folder, sheet and selection. */
    public fun close() {
        mutableOperation.value?.close()
        mutableOperation.value = null
        mutableImport.value?.close()
        mutableImport.value = null
        mutableNote.value?.close()
        mutableNote.value = null
        mutableExport.value?.close()
        mutableExport.value = null
        mutableOutgoing.value = null
        closeGallery()
        closePdf()
        closeMedia()
        closeDocument()
        dismissAttachmentFolder()
        mutableIncoming.value?.revoke()
        mutableIncoming.value = null
        posters.clear()
        mutableEdit.value = null
        mutableInfo.value = null
        mutableDeleting.value = null
        mutableIssue.value = null
        mutableBusy.value = false
        mutableLevels.value.forEach(FolderModel::close)
        scope.cancel()
    }

    private val hasSheet: Boolean
        get() = mutableEdit.value != null ||
            mutableInfo.value != null ||
            mutableDeleting.value != null ||
            mutableOperation.value != null ||
            mutableImport.value != null ||
            mutableNote.value != null ||
            mutableExport.value != null ||
            mutableGallery.value != null ||
            mutablePdf.value != null ||
            mutableMedia.value != null ||
            mutableDocument.value != null

    private fun delete(item: CatalogListItem) {
        val folder = top
        mutableBusy.value = true
        scope.launch {
            try {
                store.deleteFile(item.nodeID, generation)
                folder.deselect(setOf(item.nodeID))
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (error.failureKind == FailureKind.REVOKED) {
                    close()
                    return@launch
                }
                mutableIssue.value = error.fileIssue
            }
            mutableBusy.value = false
            folder.reload()
        }
    }

    private fun folder(path: String): FolderModel =
        FolderModel(store, generation, path, scope, settings.state.value.showHidden, searchDelayMillis)

    public companion object {
        /**
         * A renamed note keeps its `.md`: the file stays Markdown either way, and
         * a name without it stops looking like the note it is.
         */
        public fun keepingMarkdownSuffix(name: String, item: CatalogListItem): String {
            val suffixes = listOf(".md", ".markdown")
            val lower = name.lowercase()
            if (item.isDir ||
                suffixes.none { item.name.lowercase().endsWith(it) } ||
                suffixes.any { lower.endsWith(it) }
            ) {
                return name
            }
            return "$name.md"
        }
    }
}
