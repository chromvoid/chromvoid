package com.chromvoid.air.ui.files

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Files another app shared into ChromVoid: what came, where it goes - the
 * vault's root unless another folder is chosen - and Save, which imports them
 * one after another as any import does. Cancel stores nothing. A single
 * credential export can go to the Passwords import instead, which reviews it
 * before anything changes. Nothing is read before Save, and nothing shared is
 * kept anywhere but here, in memory, for this unlocked session.
 */
public class IncomingShareModel(
    private val store: FileStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val sources: List<FileSource>,
    /** Hands the one shared file to the Passwords import; null where that import is not available. */
    private val onCredentials: (() -> Unit)?,
    /** The files landed in [destination]; the folder reads again. */
    private val onImported: (String) -> Unit = {},
) {
    public enum class Phase { REVIEW, IMPORTING, CLOSED }

    public data class State(
        val phase: Phase = Phase.REVIEW,
        val destination: String = FolderModel.ROOT,
        /** The shared files' names, as their apps name them. */
        val names: List<String> = emptyList(),
    )

    private val mutableState = MutableStateFlow(State(names = sources.map { it.label }))
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private val mutableChooser = MutableStateFlow<FolderChooserModel?>(null)

    /** The folder browser for where the files go. */
    public val chooser: StateFlow<FolderChooserModel?> = mutableChooser.asStateFlow()

    private val mutableImport = MutableStateFlow<FileImportModel?>(null)

    /** The import, once Save started it. */
    public val import: StateFlow<FileImportModel?> = mutableImport.asStateFlow()

    /** One shared file that looks like a credential export Core reads. */
    public val offersCredentials: Boolean =
        onCredentials != null && sources.size == 1 && isCredentialExport(sources.single().label)

    public fun chooseDestination() {
        if (mutableState.value.phase != Phase.REVIEW || mutableChooser.value != null) return
        mutableChooser.value = FolderChooserModel(store, generation, scope, allowsRoot = true) { path ->
            mutableState.value = mutableState.value.copy(destination = path)
            dismissChooser()
        }
    }

    public fun dismissChooser() {
        mutableChooser.value?.close()
        mutableChooser.value = null
    }

    /** Imports every shared file into the destination. */
    public fun save() {
        val current = mutableState.value
        if (current.phase != Phase.REVIEW || sources.isEmpty()) return
        dismissChooser()
        val destination = current.destination
        val model = FileImportModel(store, destination, generation, scope) { onImported(destination) }
        mutableImport.value = model
        mutableState.value = current.copy(phase = Phase.IMPORTING)
        model.receive(sources)
    }

    /** The shared file goes to the Passwords import instead of Files. */
    public fun importCredentials() {
        if (mutableState.value.phase != Phase.REVIEW || !offersCredentials) return
        val handOff = onCredentials ?: return
        finish()
        handOff()
    }

    /** Cancel, or Done once the import settled; a running import is stopped first with Stop. */
    public fun close() {
        if (mutableImport.value?.state?.value?.busy == true) return
        finish()
    }

    /** The session ended: nothing shared stays, whatever was running. */
    public fun revoke() {
        finish()
    }

    private fun finish() {
        if (mutableState.value.phase == Phase.CLOSED) return
        val unread = mutableState.value.phase == Phase.REVIEW
        dismissChooser()
        mutableImport.value?.close()
        mutableImport.value = null
        mutableState.value = mutableState.value.copy(phase = Phase.CLOSED)
        // The import closes what it read; files never read are let go here,
        // even when a lock is cancelling everything else in this session.
        if (unread) {
            scope.launch(NonCancellable, start = CoroutineStart.UNDISPATCHED) {
                sources.forEach { runCatching { it.close() } }
            }
        }
    }

    public companion object {
        private val CREDENTIAL_EXPORTS = setOf("1pux", "kdbx", "csv", "json")

        public fun isCredentialExport(name: String): Boolean =
            name.substringAfterLast('.', "").lowercase() in CREDENTIAL_EXPORTS
    }
}
