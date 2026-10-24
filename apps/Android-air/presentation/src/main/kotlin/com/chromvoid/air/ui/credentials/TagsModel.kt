package com.chromvoid.air.ui.credentials

import com.chromvoid.air.bridge.wire.CredentialTagSummary
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
 * The vault's tag catalog: every tag with its colour and how many records
 * carry it, and the changes made to it. Tags are identified by the stable key
 * Core gives them; renaming keeps the key's records attached. The catalog is
 * never a second truth - it is read from Core and read again after a change.
 *
 * [selected] holds a choice in progress: the tags a record will carry, or the
 * one tag the catalog filters by.
 */
public class TagsModel(
    private val store: CredentialStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    initialSelection: List<CredentialTagSummary> = emptyList(),
) {
    public enum class Status { LOADING, READY, FAILED, REVOKED }

    public sealed interface Edit {
        public data object Create : Edit

        public data class Change(val tag: CredentialTagSummary) : Edit
    }

    public enum class Issue { NAME_INVALID, NAME_TAKEN, DENIED, FAILED }

    public data class State(
        val status: Status = Status.LOADING,
        val tags: List<CredentialTagSummary> = emptyList(),
        val selected: List<CredentialTagSummary> = emptyList(),
        val edit: Edit? = null,
        val deleting: CredentialTagSummary? = null,
        val busy: Boolean = false,
        val issue: Issue? = null,
    )

    private val mutableState = MutableStateFlow(State(selected = initialSelection))
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
                val tags = mutableListOf<CredentialTagSummary>()
                var offset = 0L
                for (pageIndex in 0 until MAX_PAGES) {
                    val page = store.tagPage(offset, generation)
                    tags += page.tags.filter { it.key.isNotEmpty() && it.label.isNotEmpty() && it.colorID in COLORS }
                    val next = page.nextOffset ?: break
                    if (next <= offset) {
                        fail()
                        return@launch
                    }
                    offset = next
                }
                // A selected tag that no longer exists is dropped; a renamed one takes its new label.
                val byKey = tags.associateBy { it.key }
                val current = mutableState.value
                mutableState.value = current.copy(
                    status = Status.READY,
                    tags = tags,
                    selected = current.selected.mapNotNull { byKey[it.key] },
                )
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (error.failureKind == FailureKind.REVOKED) close() else fail()
            }
        }
    }

    public fun toggle(tag: CredentialTagSummary) {
        val current = mutableState.value
        val selected = if (current.selected.any { it.key == tag.key }) {
            current.selected.filterNot { it.key == tag.key }
        } else {
            current.selected + tag
        }
        mutableState.value = current.copy(selected = selected)
    }

    public fun beginCreate() {
        if (ready()) mutableState.value = mutableState.value.copy(edit = Edit.Create, issue = null)
    }

    public fun beginChange(tag: CredentialTagSummary) {
        if (ready()) mutableState.value = mutableState.value.copy(edit = Edit.Change(tag), issue = null)
    }

    public fun cancelEdit() {
        mutableState.value = mutableState.value.copy(edit = null, issue = null)
    }

    public fun save(label: String, colorId: String) {
        val current = mutableState.value
        val edit = current.edit ?: return
        if (current.busy) return
        val trimmed = label.trim()
        if (trimmed.isEmpty() || colorId !in COLORS) {
            mutableState.value = current.copy(issue = Issue.NAME_INVALID)
            return
        }
        val source = (edit as? Edit.Change)?.tag?.key
        mutate { store.saveTag(source, trimmed, colorId, generation) }
    }

    public fun requestDelete(tag: CredentialTagSummary) {
        if (ready()) mutableState.value = mutableState.value.copy(deleting = tag, issue = null)
    }

    public fun cancelDelete() {
        mutableState.value = mutableState.value.copy(deleting = null)
    }

    public fun confirmDelete() {
        val tag = mutableState.value.deleting ?: return
        mutableState.value = mutableState.value.copy(deleting = null)
        mutate { store.deleteTag(tag.key, generation) }
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
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                val issue = when (error.failureKind) {
                    FailureKind.REVOKED -> {
                        close()
                        return@launch
                    }
                    FailureKind.CONFLICT -> Issue.NAME_TAKEN
                    FailureKind.INVALID_INPUT -> Issue.NAME_INVALID
                    FailureKind.DENIED -> Issue.DENIED
                    FailureKind.MISSING -> null
                    else -> Issue.FAILED
                }
                mutableState.value = mutableState.value.copy(busy = false, issue = issue)
                if (issue == null) {
                    mutableState.value = mutableState.value.copy(edit = null)
                    reload()
                }
            }
        }
    }

    private fun ready(): Boolean = mutableState.value.status != Status.REVOKED && !mutableState.value.busy

    private fun fail() {
        mutableState.value = mutableState.value.copy(status = Status.FAILED, tags = emptyList())
    }

    public companion object {
        /** The colour ids Core accepts, in the order the picker offers them. */
        public val COLORS: List<String> = listOf("violet", "green", "blue", "pink", "amber", "orange", "cyan")
        private const val MAX_PAGES = 20
    }
}
