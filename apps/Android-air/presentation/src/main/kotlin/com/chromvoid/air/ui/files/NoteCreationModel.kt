package com.chromvoid.air.ui.files

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
 * A new note, as the iOS note form writes one: a name and the text, saved as a
 * Markdown file in the folder on screen. A save Core refused keeps the draft;
 * one whose outcome is unknown says so and offers no second save.
 */
public class NoteCreationModel(
    private val store: FileStore,
    /** The folder the note goes into. */
    public val parent: String,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val onSaved: () -> Unit = {},
) {
    public enum class Phase { EDITING, SAVING, UNCERTAIN, REVOKED }

    public enum class Issue { EMPTY_NAME, DOT_NAME, TOO_LARGE }

    public data class State(
        val name: String = "",
        val text: String = "",
        val phase: Phase = Phase.EDITING,
        /** Why the form refused to save. */
        val issue: Issue? = null,
        /** Why Core refused the note. */
        val refusal: FileIssue? = null,
        /** Increments on each refusal, so the name takes focus again. */
        val attempts: Int = 0,
        val confirmingDiscard: Boolean = false,
    ) {
        /** Anything typed is worth a question before it is thrown away. */
        val isDirty: Boolean get() = name.isNotEmpty() || text.isNotEmpty()
    }

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private var save: Job? = null

    public fun setName(name: String) {
        val current = mutableState.value
        if (current.phase != Phase.EDITING || current.name == name) return
        mutableState.value = current.copy(name = name, issue = null, refusal = null)
    }

    public fun setText(text: String) {
        val current = mutableState.value
        if (current.phase != Phase.EDITING || current.text == text) return
        val issue = current.issue.takeIf { it != Issue.TOO_LARGE }
        mutableState.value = current.copy(text = text, issue = issue)
    }

    /** Cancel and Back: a draft with anything in it asks first. Returns whether the form may close now. */
    public fun requestDismiss(): Boolean {
        val current = mutableState.value
        if (current.phase == Phase.SAVING) return false
        if (current.isDirty && current.phase == Phase.EDITING) {
            mutableState.value = current.copy(confirmingDiscard = true)
            return false
        }
        return true
    }

    public fun cancelDiscard() {
        mutableState.value = mutableState.value.copy(confirmingDiscard = false)
    }

    public fun save() {
        val current = mutableState.value
        if (current.phase != Phase.EDITING) return
        val name = current.name.trim()
        val issue = when {
            name.isEmpty() -> Issue.EMPTY_NAME
            // A dot-name is saved but hidden by the catalog, so the note would vanish.
            name.startsWith(".") -> Issue.DOT_NAME
            current.text.encodeToByteArray().size > store.documentByteLimit -> Issue.TOO_LARGE
            else -> null
        }
        if (issue != null) {
            mutableState.value = current.copy(issue = issue, attempts = current.attempts + 1)
            return
        }
        val lower = name.lowercase()
        val file = if (lower.endsWith(".md") || lower.endsWith(".markdown")) name else "$name.md"
        mutableState.value = current.copy(phase = Phase.SAVING, issue = null, refusal = null)
        save = scope.launch {
            try {
                val saved = store.createNote(file, current.text, parent, generation)
                if (!saved.completed) {
                    uncertain()
                    return@launch
                }
                close()
                onSaved()
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                when {
                    error.failureKind == FailureKind.REVOKED -> close()
                    error.failureKind == FailureKind.DENIED || error.isItemRefusal ||
                        error.fileIssue == FileIssue.INVALID_NAME -> {
                        val after = mutableState.value
                        mutableState.value = after.copy(
                            phase = Phase.EDITING,
                            refusal = error.fileIssue,
                            attempts = after.attempts + 1,
                        )
                    }
                    else -> uncertain()
                }
            }
        }
    }

    /** Drops the draft. */
    public fun close() {
        save?.cancel()
        mutableState.value = State(phase = Phase.REVOKED)
    }

    private fun uncertain() {
        val after = mutableState.value
        if (after.phase == Phase.REVOKED) return
        mutableState.value = after.copy(phase = Phase.UNCERTAIN)
    }
}
