package com.chromvoid.air.ui.maintenance

import com.chromvoid.air.bridge.CoreRefusal
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
 * Saving an encrypted copy of the storage to a folder the person chose. Core
 * owns the format and the snapshot; this model owns only the order of the
 * work and what the screen says about it. Nothing is kept in memory: each
 * file is streamed from Core to the destination a chunk at a time.
 */
public class StorageBackupModel(
    private val store: BackupStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    /** Turns the folder the system picker returned into somewhere to write. */
    private val destinations: ((android.net.Uri) -> BackupDestination)? = null,
) {
    public enum class Status { EDITING, WORKING, CANCELLING, DONE, REVOKED }

    public enum class Issue { DESTINATION_REQUIRED, PASSWORD_REQUIRED, REAUTHENTICATION, FAILED, CLEANUP_FAILED }

    /** Which file of how many is being written. */
    public data class Progress(val artifact: Int, val total: Int)

    public data class State(
        val password: String = "",
        val destination: String? = null,
        val status: Status = Status.EDITING,
        val progress: Progress? = null,
        val issue: Issue? = null,
        val savedTo: String? = null,
    )

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()
    private var destination: BackupDestination? = null
    private var work: Job? = null

    public fun changePassword(value: String) {
        val current = mutableState.value
        if (current.status != Status.EDITING) return
        mutableState.value = current.copy(password = value, issue = null)
    }

    public fun chooseDestination(chosen: BackupDestination) {
        val current = mutableState.value
        if (current.status != Status.EDITING) return
        destination = chosen
        mutableState.value = current.copy(destination = chosen.label, issue = null)
    }

    /** The folder the system picker returned. */
    public fun chooseDestination(tree: android.net.Uri) {
        destinations?.let { chooseDestination(it(tree)) }
    }

    public fun submit() {
        val current = mutableState.value
        if (current.status != Status.EDITING) return
        val target = destination
        when {
            target == null -> return refuse(Issue.DESTINATION_REQUIRED)
            current.password.isEmpty() -> return refuse(Issue.PASSWORD_REQUIRED)
        }
        // The password leaves the draft as the request is made: Core needs it once.
        mutableState.value = current.copy(password = "", status = Status.WORKING, issue = null, progress = null)
        work = scope.launch { run(checkNotNull(target), current.password) }
    }

    private suspend fun run(target: BackupDestination, password: String) {
        var prepared: BackupRun? = null
        try {
            val backup = store.prepareBackup(password, generation)
            prepared = backup
            val artifacts = backup.artifacts()
            artifacts.forEachIndexed { index, artifact ->
                mutableState.value = mutableState.value.copy(progress = Progress(index + 1, artifacts.size))
                target.writeArtifact(artifact.name) { backup.read(index) }
            }
            mutableState.value = State(status = Status.DONE, savedTo = target.label)
        } catch (cancellation: CancellationException) {
            withContext(NonCancellable) { discard(target) }
            mutableState.value = State(destination = target.label)
            throw cancellation
        } catch (error: Exception) {
            withContext(NonCancellable) { discard(target) }
            receive(error, target)
        } finally {
            withContext(NonCancellable) { runCatching { prepared?.close() } }
            work = null
        }
    }

    private suspend fun discard(target: BackupDestination) {
        // A partial backup is worse than none: it looks restorable and is not.
        runCatching { target.discard() }.onFailure {
            mutableState.value = State(destination = target.label, issue = Issue.CLEANUP_FAILED)
        }
    }

    private fun receive(error: Exception, target: BackupDestination) {
        if (mutableState.value.issue == Issue.CLEANUP_FAILED) return
        if (error.failureKind == FailureKind.REVOKED) {
            revoke()
            return
        }
        val issue = if ((error as? CoreRefusal)?.code == "INVALID_MASTER_PASSWORD") {
            Issue.REAUTHENTICATION
        } else {
            Issue.FAILED
        }
        mutableState.value = State(destination = target.label, issue = issue)
    }

    /** Stops a backup in flight; what it wrote is removed rather than left half-made. */
    public fun cancel() {
        if (mutableState.value.status != Status.WORKING) return
        mutableState.value = mutableState.value.copy(status = Status.CANCELLING)
        work?.cancel()
    }

    private fun refuse(issue: Issue) {
        mutableState.value = mutableState.value.copy(issue = issue)
    }

    /** The session ended: no password and no destination stay behind. */
    public fun revoke() {
        work?.cancel()
        work = null
        destination = null
        mutableState.value = State(status = Status.REVOKED)
    }
}
