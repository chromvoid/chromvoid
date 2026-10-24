package com.chromvoid.air.ui.ssh

import com.chromvoid.air.bridge.wire.PassmanagerSSHEditRequest
import com.chromvoid.air.bridge.wire.PassmanagerSSHExportRequest
import com.chromvoid.air.bridge.wire.SSHKeySummary
import com.chromvoid.air.ui.credentials.CredentialClipboard
import com.chromvoid.air.ui.support.FailureKind
import com.chromvoid.air.ui.support.failureKind
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * One SSH key: its metadata, a rename, deletion, and export. The public key
 * is copied or saved as a file; the private key is saved as a file only, and
 * without a passphrase only after the person confirms an unprotected copy.
 * Exported text lives in this state only until the file is written.
 */
public class SshDetailModel(
    row: SSHKeySummary,
    private val store: SshStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val clipboard: CredentialClipboard,
    private val onDeleted: () -> Unit,
) {
    public enum class Status { READY, WORKING, UNCERTAIN, REVOKED }

    public enum class ExportKind { PUBLIC_KEY, PRIVATE_KEY }

    public enum class Issue { UPDATE_REFUSED, UNCERTAIN, EXPORT_FAILED, FILE_NOT_SAVED }

    /** Exported text waiting to be written to the file the person chooses. */
    public data class Document(val filename: String, val content: String)

    public data class State(
        val row: SSHKeySummary? = null,
        val status: Status = Status.READY,
        val editing: Boolean = false,
        val name: String = "",
        val issue: Issue? = null,
        val focusRequest: Int = 0,
        val exportKind: ExportKind? = null,
        val passphrase: String = "",
        val confirmingPlaintext: Boolean = false,
        val confirmingDelete: Boolean = false,
        val document: Document? = null,
        val copies: Int = 0,
    )

    private val mutableState = MutableStateFlow(State(row))
    public val state: StateFlow<State> = mutableState.asStateFlow()
    private var work: Job? = null

    public fun beginEdit() {
        val current = mutableState.value
        val row = current.row ?: return
        if (current.status != Status.READY || current.exportKind != null) return
        mutableState.value = current.copy(editing = true, name = row.key.name.orEmpty(), issue = null)
    }

    public fun changeName(name: String) {
        if (mutableState.value.status == Status.READY) {
            mutableState.value = mutableState.value.copy(name = name, issue = null)
        }
    }

    public fun cancelEdit() {
        mutableState.value = mutableState.value.copy(editing = false, name = "", issue = null)
    }

    /** Renames the key under the revision it was read with; its linked record stays linked. */
    public fun save() {
        val current = mutableState.value
        val row = current.row ?: return
        if (current.status != Status.READY || !current.editing) return
        val request = PassmanagerSSHEditRequest(
            keyID = row.key.id,
            name = current.name.trim(),
            revision = row.revision,
            sourceEntryID = row.key.sourceEntryID,
        )
        mutate {
            val updated = store.editSsh(request, generation)
            mutableState.value = mutableState.value.copy(row = updated, editing = false, name = "")
        }
    }

    public fun requestDelete() {
        val current = mutableState.value
        if (current.status == Status.READY && current.exportKind == null) {
            mutableState.value = current.copy(confirmingDelete = true)
        }
    }

    public fun cancelDelete() {
        mutableState.value = mutableState.value.copy(confirmingDelete = false)
    }

    public fun confirmDelete() {
        val current = mutableState.value
        val row = current.row ?: return
        if (!current.confirmingDelete) return
        mutableState.value = current.copy(confirmingDelete = false)
        mutate {
            store.deleteSsh(row.key.id, generation)
            onDeleted()
        }
    }

    public fun beginExport(kind: ExportKind) {
        val current = mutableState.value
        if (current.status != Status.READY || current.editing) return
        mutableState.value = current.copy(exportKind = kind, passphrase = "", issue = null)
    }

    public fun changePassphrase(passphrase: String) {
        mutableState.value = mutableState.value.copy(passphrase = passphrase, issue = null)
    }

    public fun cancelPlaintext() {
        mutableState.value = mutableState.value.copy(confirmingPlaintext = false)
    }

    /** Reads the export from Core; a private key without a passphrase asks first. */
    public fun export(allowPlaintext: Boolean = false) {
        val current = mutableState.value
        val kind = current.exportKind ?: return
        if (current.status != Status.READY) return
        if (kind == ExportKind.PRIVATE_KEY && current.passphrase.isEmpty() && !allowPlaintext) {
            mutableState.value = current.copy(confirmingPlaintext = true)
            return
        }
        mutableState.value = current.copy(confirmingPlaintext = false)
        read(kind == ExportKind.PRIVATE_KEY, copy = false)
    }

    public fun copyPublicKey() {
        if (mutableState.value.status == Status.READY) read(privateKey = false, copy = true)
    }

    /** The screen wrote the file, or could not; either way the exported text is dropped. */
    public fun finishExport(saved: Boolean) {
        cancelExport()
        if (!saved && mutableState.value.status != Status.REVOKED) {
            mutableState.value = mutableState.value.copy(issue = Issue.FILE_NOT_SAVED)
        }
    }

    public fun cancelExport() {
        val current = mutableState.value
        if (current.exportKind == null && current.document == null) return
        if (current.status == Status.WORKING) work?.cancel()
        mutableState.value = current.copy(
            status = if (current.status == Status.WORKING) Status.READY else current.status,
            exportKind = null,
            passphrase = "",
            confirmingPlaintext = false,
            document = null,
        )
    }

    public fun close() {
        work?.cancel()
        mutableState.value = State(status = Status.REVOKED)
    }

    private fun read(privateKey: Boolean, copy: Boolean) {
        val current = mutableState.value
        val row = current.row ?: return
        val request = PassmanagerSSHExportRequest(
            format = if (privateKey) "openssh_private" else "openssh_public",
            keyID = row.key.id,
            passphrase = current.passphrase.takeIf { privateKey && it.isNotEmpty() },
        )
        mutableState.value = current.copy(status = Status.WORKING, issue = null)
        work = scope.launch {
            try {
                val result = store.exportSsh(request, generation)
                val expected = if (privateKey) row.key.id else "${row.key.id}.pub"
                if (result.filename != expected || result.content.toByteArray().size > SSH_KEY_FILE_LIMIT_BYTES) {
                    throw IllegalStateException("export for another key")
                }
                val after = mutableState.value
                mutableState.value = if (copy) {
                    clipboard.copy(result.content, sensitive = false)
                    after.copy(status = Status.READY, copies = after.copies + 1)
                } else {
                    after.copy(
                        status = Status.READY,
                        passphrase = "",
                        document = Document(result.filename, result.content),
                    )
                }
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (error.failureKind == FailureKind.REVOKED) {
                    close()
                } else {
                    mutableState.value = mutableState.value.copy(
                        status = Status.READY,
                        passphrase = "",
                        issue = Issue.EXPORT_FAILED,
                    )
                }
            }
        }
    }

    private fun mutate(action: suspend () -> Unit) {
        mutableState.value = mutableState.value.copy(status = Status.WORKING, issue = null)
        work = scope.launch {
            try {
                action()
                if (mutableState.value.status == Status.WORKING) {
                    mutableState.value = mutableState.value.copy(status = Status.READY)
                }
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                mutableState.value = when (error.failureKind) {
                    FailureKind.REVOKED -> State(status = Status.REVOKED)
                    FailureKind.INVALID_INPUT, FailureKind.DENIED -> mutableState.value.copy(
                        status = Status.READY,
                        issue = Issue.UPDATE_REFUSED,
                        focusRequest = mutableState.value.focusRequest + 1,
                    )
                    else -> mutableState.value.copy(status = Status.UNCERTAIN, issue = Issue.UNCERTAIN)
                }
            }
        }
    }
}
