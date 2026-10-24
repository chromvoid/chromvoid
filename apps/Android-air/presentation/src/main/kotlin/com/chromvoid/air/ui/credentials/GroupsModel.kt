package com.chromvoid.air.ui.credentials

import com.chromvoid.air.bridge.wire.PassmanagerGroupSummary
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
 * The direct subgroups of one catalog level, and the changes made to them:
 * create a subgroup, rename one, delete one with everything nested in it.
 *
 * A refused change keeps the list as it was and explains itself; nothing is
 * retried on its own.
 */
public class GroupsModel(
    /** The level's group path; `/` is the vault root. */
    public val parent: String,
    private val store: CredentialStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val onChanged: () -> Unit = {},
) {
    public enum class Status { LOADING, READY, FAILED, REVOKED }

    /** A name being asked for: a new subgroup, or a new name for [path]. */
    public sealed interface Edit {
        public data object Create : Edit

        public data class Rename(val path: String) : Edit
    }

    public enum class Issue { NAME_INVALID, NAME_TAKEN, DENIED, FAILED }

    public data class State(
        val status: Status = Status.LOADING,
        val groups: List<PassmanagerGroupSummary> = emptyList(),
        val edit: Edit? = null,
        val deleting: String? = null,
        val busy: Boolean = false,
        val issue: Issue? = null,
    )

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()
    private var load: Job? = null

    init {
        reload()
    }

    public fun reload() {
        if (mutableState.value.status == Status.REVOKED) return
        load?.cancel()
        load = scope.launch {
            try {
                val groups = mutableListOf<PassmanagerGroupSummary>()
                var offset = 0L
                // Levels rarely exceed one page; read them whole, with a bound.
                for (pageIndex in 0 until MAX_PAGES) {
                    val page = store.groupPage(parent, offset, generation)
                    if (page.parent != parent) {
                        fail()
                        return@launch
                    }
                    groups += page.groups
                    val next = page.nextOffset ?: break
                    if (next <= offset) {
                        fail()
                        return@launch
                    }
                    offset = next
                }
                mutableState.value = mutableState.value.copy(status = Status.READY, groups = groups)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (error.failureKind == FailureKind.REVOKED) close() else fail()
            }
        }
    }

    public fun beginCreate() {
        if (ready()) mutableState.value = mutableState.value.copy(edit = Edit.Create, issue = null)
    }

    public fun beginRename(path: String) {
        if (ready()) mutableState.value = mutableState.value.copy(edit = Edit.Rename(path), issue = null)
    }

    public fun cancelEdit() {
        mutableState.value = mutableState.value.copy(edit = null, issue = null)
    }

    public fun save(name: String) {
        val current = mutableState.value
        val edit = current.edit ?: return
        if (current.busy) return
        val trimmed = name.trim()
        if (!validName(trimmed)) {
            mutableState.value = current.copy(issue = Issue.NAME_INVALID)
            return
        }
        mutate {
            when (edit) {
                Edit.Create -> store.ensureGroup(childPath(parent, trimmed), generation)
                is Edit.Rename -> store.renameGroup(edit.path, trimmed, generation)
            }
        }
    }

    public fun requestDelete(path: String) {
        if (ready() && path != ROOT) mutableState.value = mutableState.value.copy(deleting = path, issue = null)
    }

    public fun cancelDelete() {
        mutableState.value = mutableState.value.copy(deleting = null)
    }

    public fun confirmDelete() {
        val path = mutableState.value.deleting ?: return
        mutableState.value = mutableState.value.copy(deleting = null)
        mutate { store.deleteGroup(path, generation) }
    }

    public fun close() {
        load?.cancel()
        mutableState.value = State(Status.REVOKED)
    }

    private fun mutate(action: suspend () -> Unit) {
        mutableState.value = mutableState.value.copy(busy = true, issue = null)
        scope.launch {
            try {
                action()
                mutableState.value = mutableState.value.copy(busy = false, edit = null)
                reload()
                onChanged()
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                val kind = error.failureKind
                if (kind == FailureKind.REVOKED) {
                    close()
                    return@launch
                }
                val issue = when (kind) {
                    FailureKind.CONFLICT -> Issue.NAME_TAKEN
                    FailureKind.INVALID_INPUT -> Issue.NAME_INVALID
                    FailureKind.DENIED -> Issue.DENIED
                    // Already gone: nothing to explain, the list reads again.
                    FailureKind.MISSING -> null
                    else -> Issue.FAILED
                }
                mutableState.value = mutableState.value.copy(
                    busy = false,
                    issue = issue,
                    edit = if (issue == null) null else mutableState.value.edit,
                )
                if (issue == null) reload()
            }
        }
    }

    private fun ready(): Boolean = mutableState.value.status != Status.REVOKED && !mutableState.value.busy

    private fun fail() {
        mutableState.value = mutableState.value.copy(status = Status.FAILED, groups = emptyList())
    }

    public companion object {
        public const val ROOT: String = "/"
        private const val MAX_PAGES = 20

        /** A group name has no slashes, no leading dot and no NUL, as Core requires. */
        public fun validName(name: String): Boolean =
            name.isNotEmpty() && !name.startsWith(".") && '/' !in name && '\\' !in name && '\u0000' !in name

        public fun childPath(parent: String, name: String): String = if (parent == ROOT) "/$name" else "$parent/$name"

        /** The last segment of a group path, which is what the user named it. */
        public fun name(path: String): String = path.trimEnd('/').substringAfterLast('/')
    }
}
