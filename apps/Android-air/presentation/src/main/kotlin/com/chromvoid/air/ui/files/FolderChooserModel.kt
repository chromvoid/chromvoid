package com.chromvoid.air.ui.files

import com.chromvoid.air.bridge.wire.CatalogListItem
import com.chromvoid.air.ui.support.FailureKind
import com.chromvoid.air.ui.support.failureKind
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * A vault folder chosen by browsing, as iOS's folder pickers work: into a
 * folder and back, a new folder in the one shown, and the choice once it has
 * loaded. It chooses where note images go, and where shared files land.
 */
public class FolderChooserModel(
    private val store: FileStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    /** Whether the vault's root may be chosen; Core keeps attachments out of it. */
    private val allowsRoot: Boolean,
    private val onChosen: (String) -> Unit,
) {
    public enum class Issue {
        /** The folder shown has not loaded yet. */
        WAIT_FOR_FOLDER,

        /** The vault's root cannot be chosen here. */
        ROOT,
    }

    private val mutableFolders = MutableStateFlow(listOf(folder(FolderModel.ROOT)))

    /** The folders browsed, the root first; the last is the one shown. */
    public val folders: StateFlow<List<FolderModel>> = mutableFolders.asStateFlow()

    private val mutableIssue = MutableStateFlow<Issue?>(null)
    public val issue: StateFlow<Issue?> = mutableIssue.asStateFlow()

    private val mutableEdit = MutableStateFlow<FilesScope.NameEdit?>(null)

    /** The name of a new folder being created in the one shown. */
    public val edit: StateFlow<FilesScope.NameEdit?> = mutableEdit.asStateFlow()

    private var closed = false

    public fun openFolder(item: CatalogListItem) {
        val path = item.path ?: return
        if (closed || !item.isDir || mutableEdit.value != null) return
        mutableIssue.value = null
        mutableFolders.value = mutableFolders.value + folder(path)
    }

    public fun closeFolder() {
        val folders = mutableFolders.value
        if (folders.size <= 1) return
        folders.last().close()
        mutableFolders.value = folders.dropLast(1)
        mutableIssue.value = null
    }

    /** Chooses the folder shown. */
    public fun select() {
        if (closed) return
        val folder = mutableFolders.value.last()
        mutableIssue.value = when {
            folder.state.value.status != FolderModel.Status.READY -> Issue.WAIT_FOR_FOLDER
            folder.path == FolderModel.ROOT && !allowsRoot -> Issue.ROOT
            else -> null
        }
        if (mutableIssue.value != null) return
        onChosen(folder.path)
    }

    public fun beginCreateFolder() {
        if (closed || mutableEdit.value != null) return
        mutableEdit.value = FilesScope.NameEdit(item = null, name = "")
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

    /** Creates the folder in the one shown and stays there, so it can be opened and chosen. */
    public fun saveName() {
        val edit = mutableEdit.value ?: return
        if (edit.saving) return
        if (edit.name.isBlank()) {
            mutableEdit.value = edit.copy(issue = FileIssue.EMPTY_NAME, attempts = edit.attempts + 1)
            return
        }
        val folder = mutableFolders.value.last()
        mutableEdit.value = edit.copy(saving = true, issue = null)
        scope.launch {
            try {
                store.createFolder(edit.name, folder.path, generation)
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

    /** The runtime reported a change: the folders shown read again. */
    public fun synchronize() {
        if (mutableEdit.value?.saving == true) return
        mutableFolders.value.forEach { it.reload() }
    }

    public fun close() {
        closed = true
        mutableFolders.value.forEach(FolderModel::close)
        mutableEdit.value = null
        mutableIssue.value = null
    }

    private fun folder(path: String): FolderModel = FolderModel(store, generation, path, scope)
}
