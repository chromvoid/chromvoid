package com.chromvoid.air.ui.credentials

import com.chromvoid.air.bridge.wire.CredentialWebsiteRule
import com.chromvoid.air.bridge.wire.PassmanagerWebsiteResult
import com.chromvoid.air.bridge.wire.PassmanagerWebsiteUpdateRequest
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
 * The ordered website rules of one login. Core validates every rule and, for
 * a saved record, stores them under the revision they were read with. For a
 * record not yet created the rules are only validated and handed back to the
 * form, which sends them with the create.
 */
public class WebsitesModel(
    private val store: CredentialStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    /** The saved record whose rules these are; null while the record is being created. */
    public val entryId: String?,
    rules: List<CredentialWebsiteRule> = emptyList(),
    private val onSaved: (List<CredentialWebsiteRule>) -> Unit,
) {
    public enum class Status { LOADING, FAILED, EDITING, SAVING, SAVED, NEEDS_RELOAD, REVOKED }

    public enum class Issue { LOAD_FAILED, DENIED, INVALID, FAILED, NEEDS_RELOAD }

    public data class Row(val id: Long, val value: String, val mode: String, val sourceIndex: Long? = null) {
        internal val rule: CredentialWebsiteRule get() = CredentialWebsiteRule(mode, sourceIndex, value)
    }

    public data class State(
        val status: Status,
        val rows: List<Row> = emptyList(),
        val initial: List<Row> = emptyList(),
        /** Core's error code per row id. */
        val errors: Map<Long, String> = emptyMap(),
        val issue: Issue? = null,
        val confirmingDiscard: Boolean = false,
    ) {
        val isDirty: Boolean get() = rows.map { it.rule } != initial.map { it.rule }
    }

    private var nextId = 0L
    private val mutableState = MutableStateFlow(
        State(if (entryId == null) Status.EDITING else Status.LOADING).let { state ->
            val rows = rules.map(::row)
            state.copy(rows = rows, initial = rows)
        },
    )
    public val state: StateFlow<State> = mutableState.asStateFlow()
    private var revision: String? = null
    private var work: Job? = null

    init {
        if (entryId != null) load()
    }

    public fun load() {
        val id = entryId ?: return
        mutableState.value = mutableState.value.copy(status = Status.LOADING, issue = null)
        work = scope.launch {
            try {
                val result = store.websiteRules(id, generation)
                if (result.revision == null || result.errors.isNotEmpty()) error("website read without a revision")
                revision = result.revision
                val rows = result.rules.map(::row)
                mutableState.value = State(Status.EDITING, rows = rows, initial = rows)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                mutableState.value = if (error.failureKind == FailureKind.REVOKED) {
                    State(Status.REVOKED)
                } else {
                    mutableState.value.copy(status = Status.FAILED, issue = Issue.LOAD_FAILED)
                }
            }
        }
    }

    public fun add() {
        edit { it.copy(rows = it.rows + Row(nextId++, "", DEFAULT_MODE)) }
    }

    public fun change(id: Long, value: String? = null, mode: String? = null) {
        edit { state ->
            state.copy(
                rows = state.rows.map { row ->
                    if (row.id == id) row.copy(value = value ?: row.value, mode = mode ?: row.mode) else row
                },
            )
        }
    }

    public fun remove(id: Long) {
        edit { state -> state.copy(rows = state.rows.filterNot { it.id == id }) }
    }

    /** Moves a row one place up; the first match wins, so order matters. */
    public fun moveUp(id: Long) {
        edit { state ->
            val index = state.rows.indexOfFirst { it.id == id }
            if (index <= 0) return@edit state
            val rows = state.rows.toMutableList()
            rows.add(index - 1, rows.removeAt(index))
            state.copy(rows = rows)
        }
    }

    /** Back or cancel: a changed list asks first. Returns true when it may close now. */
    public fun requestDismiss(): Boolean {
        val current = mutableState.value
        if (current.status == Status.EDITING && current.isDirty) {
            mutableState.value = current.copy(confirmingDiscard = true)
            return false
        }
        return current.status != Status.SAVING
    }

    public fun cancelDiscard() {
        mutableState.value = mutableState.value.copy(confirmingDiscard = false)
    }

    public fun save() {
        val current = mutableState.value
        if (current.status != Status.EDITING) return
        val rules = current.rows.map { it.rule }
        mutableState.value = current.copy(status = Status.SAVING, errors = emptyMap(), issue = null)
        work = scope.launch {
            try {
                val result = if (entryId == null) {
                    store.validateWebsites(rules, generation)
                } else {
                    val read = revision ?: error("no revision")
                    store.updateWebsites(PassmanagerWebsiteUpdateRequest(entryId, read, rules), generation)
                }
                settle(result)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                val after = mutableState.value
                mutableState.value = when (error.failureKind) {
                    FailureKind.REVOKED -> State(Status.REVOKED)
                    FailureKind.DENIED -> after.copy(status = Status.EDITING, issue = Issue.DENIED)
                    FailureKind.INVALID_INPUT -> after.copy(status = Status.EDITING, issue = Issue.INVALID)
                    else -> if (entryId == null) {
                        after.copy(status = Status.EDITING, issue = Issue.FAILED)
                    } else {
                        after.copy(status = Status.NEEDS_RELOAD, issue = Issue.NEEDS_RELOAD)
                    }
                }
            }
        }
    }

    public fun close() {
        work?.cancel()
        mutableState.value = State(Status.REVOKED)
    }

    private fun settle(result: PassmanagerWebsiteResult) {
        val current = mutableState.value
        if (result.errors.isNotEmpty()) {
            val errors = result.errors.associate { error ->
                val row = current.rows.getOrNull(error.index.toInt()) ?: error("error for row ${error.index}")
                row.id to error.code
            }
            mutableState.value = current.copy(status = Status.EDITING, errors = errors)
            return
        }
        if (entryId != null && result.revision == null) error("saved without a revision")
        mutableState.value = State(Status.SAVED)
        onSaved(result.rules)
    }

    private inline fun edit(change: (State) -> State) {
        val current = mutableState.value
        if (current.status != Status.EDITING) return
        mutableState.value = change(current).copy(errors = emptyMap(), issue = null)
    }

    private fun row(rule: CredentialWebsiteRule) = Row(nextId++, rule.value, rule.matchMode, rule.sourceIndex)

    public companion object {
        public const val DEFAULT_MODE: String = "base_domain"

        /** The matching modes a person can choose, in the order they are offered. */
        public val MODES: List<String> = listOf("base_domain", "host", "starts_with", "exact", "regex", "never")
    }
}
