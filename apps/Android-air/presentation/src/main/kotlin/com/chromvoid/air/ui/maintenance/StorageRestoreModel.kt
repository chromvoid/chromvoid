package com.chromvoid.air.ui.maintenance

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.support.FailureKind
import com.chromvoid.air.ui.support.failureKind
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Restoring a backup into empty storage, as on iOS: the folder and the
 * backup's administrative password, then Core's check of the whole backup,
 * then - only on an explicit confirmation of what Core found - the one
 * transaction that replaces the storage. Files are streamed from the folder a
 * chunk at a time; nothing of the backup is kept here.
 */
public class StorageRestoreModel(
    private val store: RestoreStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    /** Turns the folder the system picker returned into a source to read. */
    private val sources: ((android.net.Uri) -> RestoreSource)? = null,
    /** The storage was replaced: the session has a new state to read. */
    private val onRestored: () -> Unit = {},
) {
    public enum class Status { EDITING, REVIEWING, REVIEW, CANCELLING, COMMITTING, COMPLETED, UNCERTAIN, REVOKED }

    public enum class Issue {
        SOURCE_REQUIRED,
        PASSWORD_REQUIRED,
        INVALID_BACKUP,
        TARGET_NOT_EMPTY,
        FAILED,
        CLEANUP_FAILED,
        ADOPTION_REQUIRED,
    }

    /** How much of the backup has reached Core. */
    public data class Progress(val completedBytes: Long, val totalBytes: Long)

    public data class State(
        val password: String = "",
        val source: String? = null,
        val status: Status = Status.EDITING,
        val progress: Progress? = null,
        val preview: RestorePreview? = null,
        val issue: Issue? = null,
    )

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()
    private var source: RestoreSource? = null
    private var reviewed: RestoreRun? = null
    private var work: Job? = null

    public fun chooseSource(chosen: RestoreSource) {
        val current = mutableState.value
        if (current.status != Status.EDITING) return
        source = chosen
        mutableState.value = current.copy(source = chosen.label, issue = null)
    }

    /** The folder the system picker returned. */
    public fun chooseSource(tree: android.net.Uri) {
        sources?.let { chooseSource(it(tree)) }
    }

    public fun changePassword(value: String) {
        val current = mutableState.value
        if (current.status != Status.EDITING) return
        mutableState.value = current.copy(password = value, issue = null)
    }

    /** Hands the backup to Core to check; nothing is restored yet. */
    public fun submit() {
        val current = mutableState.value
        if (current.status != Status.EDITING) return
        val chosen = source
        when {
            chosen == null -> return refuse(Issue.SOURCE_REQUIRED)
            current.password.isEmpty() -> return refuse(Issue.PASSWORD_REQUIRED)
        }
        // The password leaves the draft as the request is made: Core needs it once.
        mutableState.value = current.copy(password = "", status = Status.REVIEWING, issue = null, progress = null)
        work = scope.launch { review(checkNotNull(chosen), current.password) }
    }

    private suspend fun review(chosen: RestoreSource, password: String) {
        var run: RestoreRun? = null
        try {
            val started = store.beginRestore(generation)
            run = started
            val total = chosen.open(started.artifacts)
            var completed = 0L
            progress(Progress(completed, total))
            started.artifacts.indices.forEach { index ->
                while (true) {
                    val bytes = chosen.read(index, started.chunkBytes) ?: break
                    // An empty chunk still reaches Core: only an absent file may fall back.
                    started.append(index, bytes)
                    if (bytes.isEmpty()) break
                    completed += bytes.size
                    progress(Progress(completed, total))
                }
            }
            chosen.close()
            val preview = started.review(password)
            reviewed = started
            source = null
            mutableState.value = State(source = chosen.label, status = Status.REVIEW, preview = preview)
        } catch (cancellation: CancellationException) {
            val cleaned = withContext(NonCancellable) { cleanUp(chosen, run) }
            if (mutableState.value.status == Status.CANCELLING) {
                mutableState.value = State(source = chosen.label, issue = if (cleaned) null else Issue.CLEANUP_FAILED)
            }
            throw cancellation
        } catch (error: Exception) {
            val cleaned = withContext(NonCancellable) { cleanUp(chosen, run) }
            receive(error, chosen, cleaned)
        } finally {
            work = null
        }
    }

    private fun progress(value: Progress) {
        val current = mutableState.value
        if (current.status == Status.REVIEWING) mutableState.value = current.copy(progress = value)
    }

    /** Releases the folder and Rust's restore slot; false when either could not be released. */
    private suspend fun cleanUp(chosen: RestoreSource, run: RestoreRun?): Boolean {
        val sourceClosed = runCatching { chosen.close() }.isSuccess
        run?.cancel()
        val runClosed = runCatching { run?.close() }.isSuccess
        return sourceClosed && runClosed
    }

    private fun receive(error: Exception, chosen: RestoreSource, cleaned: Boolean) {
        if (mutableState.value.status == Status.REVOKED) return
        if (error.failureKind == FailureKind.REVOKED) {
            revoke()
            return
        }
        if (mutableState.value.status == Status.CANCELLING) {
            mutableState.value = State(source = chosen.label, issue = if (cleaned) null else Issue.CLEANUP_FAILED)
            return
        }
        val issue = when {
            !cleaned -> Issue.CLEANUP_FAILED
            error is BridgeException.AdoptionActionForbidden -> Issue.ADOPTION_REQUIRED
            else -> when ((error as? CoreRefusal)?.code) {
                "INVALID_BACKUP", "INVALID_MASTER_PASSWORD" -> Issue.INVALID_BACKUP
                "STORAGE_NOT_BLANK" -> Issue.TARGET_NOT_EMPTY
                else -> Issue.FAILED
            }
        }
        mutableState.value = State(source = chosen.label, issue = issue)
    }

    /** Only an explicit confirmation of what Core found spends the restore. */
    public fun confirm() {
        val run = reviewed
        if (mutableState.value.status != Status.REVIEW || run == null) return
        mutableState.value = mutableState.value.copy(status = Status.COMMITTING)
        work = scope.launch {
            val committed = try {
                run.commit()
                null
            } catch (cancellation: CancellationException) {
                withContext(NonCancellable) { runCatching { run.close() } }
                throw cancellation
            } catch (error: Exception) {
                error
            }
            val cleaned = withContext(NonCancellable) { runCatching { run.close() }.isSuccess }
            reviewed = null
            work = null
            if (mutableState.value.status == Status.REVOKED) return@launch
            val cleanup = if (cleaned) null else Issue.CLEANUP_FAILED
            when {
                committed == null -> {
                    mutableState.value = State(status = Status.COMPLETED, issue = cleanup)
                    onRestored()
                }
                committed.failureKind == FailureKind.REVOKED -> revoke()
                // The adoption guard rejects before a write, so this result is known.
                committed is BridgeException.AdoptionActionForbidden ->
                    mutableState.value = State(issue = Issue.ADOPTION_REQUIRED)
                // An unknown write outcome never becomes a retry button.
                else -> mutableState.value = State(status = Status.UNCERTAIN, issue = cleanup)
            }
        }
    }

    /** Keeps the folder when stopping a check, or sets a checked backup aside to choose another. */
    public fun cancel() {
        val current = mutableState.value
        when (current.status) {
            Status.REVIEWING -> {
                mutableState.value = current.copy(status = Status.CANCELLING)
                work?.cancel()
            }
            Status.REVIEW -> {
                val run = reviewed ?: return
                reviewed = null
                mutableState.value = State(status = Status.CANCELLING)
                run.cancel()
                work = scope.launch {
                    val cleaned = withContext(NonCancellable) { runCatching { run.close() }.isSuccess }
                    work = null
                    if (mutableState.value.status == Status.CANCELLING) {
                        mutableState.value = State(issue = if (cleaned) null else Issue.CLEANUP_FAILED)
                    }
                }
            }
            else -> Unit
        }
    }

    private fun refuse(issue: Issue) {
        mutableState.value = mutableState.value.copy(issue = issue)
    }

    /** The session ended: no password, folder or checked backup stays behind. */
    public fun revoke() {
        mutableState.value = State(status = Status.REVOKED)
        work?.cancel()
        work = null
        reviewed?.let { run ->
            run.cancel()
            // Rust keeps the restore slot until the handle is let go of.
            scope.launch { withContext(NonCancellable) { runCatching { run.close() } } }
        }
        reviewed = null
        source = null
    }
}
