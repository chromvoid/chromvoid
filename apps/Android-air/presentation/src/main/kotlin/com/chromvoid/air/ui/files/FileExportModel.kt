package com.chromvoid.air.ui.files

import com.chromvoid.air.bridge.wire.CatalogListItem
import com.chromvoid.air.ui.support.FailureKind
import com.chromvoid.air.ui.support.failureKind
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Copies of vault files saved outside the vault, where the person chose. The
 * system save picker takes one file; several go into a folder the folder
 * picker grants. Each copy streams from Core into its document and nothing is
 * staged anywhere else, so there is no temporary copy to remove afterwards. A
 * folder cannot be exported; it is shown and skipped, as on iOS.
 */
public class FileExportModel(
    items: List<CatalogListItem>,
    private val store: FileStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    /** A save into the device's gallery rather than to a chosen place. */
    public val gallery: Boolean = false,
) {
    public enum class Phase { REVIEW, RUNNING, FINISHED, REVOKED }

    public enum class PickerIssue { UNAVAILABLE, NOT_OPENED }

    public sealed interface Outcome {
        public data object Pending : Outcome

        /** A folder: only files are exported. */
        public data object Skipped : Outcome

        public data object Exporting : Outcome

        public data object Exported : Outcome

        public data class Failed(val issue: FileIssue) : Outcome
    }

    public data class Item(
        val source: CatalogListItem,
        val outcome: Outcome,
        val received: Long = 0,
        val total: Long = 0,
    )

    public data class State(
        val phase: Phase = Phase.REVIEW,
        val items: List<Item> = emptyList(),
        val pickerIssue: PickerIssue? = null,
    ) {
        val exported: Int get() = items.count { it.outcome == Outcome.Exported }

        /** Files, as opposed to the folders shown and skipped. */
        val files: Int get() = items.count { it.outcome != Outcome.Skipped }
    }

    private val mutableState = MutableStateFlow(
        State(items = items.map { Item(it, if (it.isDir) Outcome.Skipped else Outcome.Pending) }),
    )
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private val files: List<CatalogListItem> = items.filterNot { it.isDir }

    /** Several files need a folder to go into; one is saved as a single document. */
    public val intoFolder: Boolean = files.size > 1

    /** The one file the save picker names, when there is exactly one. */
    public val single: CatalogListItem? = files.singleOrNull()

    /** Whether anything here can be exported at all. */
    public val canExport: Boolean = files.isNotEmpty()

    private var run: Job? = null

    /** Starts or retries the system picker without changing the export draft. */
    public fun beginDestinationChoice(): Boolean {
        val current = mutableState.value
        if (current.phase != Phase.REVIEW || !canExport || gallery) return false
        mutableState.value = current.copy(pickerIssue = null)
        return true
    }

    /** A failed launch stays in review, with every file available for another attempt. */
    public fun pickerFailed(issue: PickerIssue) {
        val current = mutableState.value
        if (current.phase != Phase.REVIEW || !canExport || gallery) return
        mutableState.value = current.copy(pickerIssue = issue)
    }

    /** The picker answered: every file is copied into the destination [open] gives it. */
    public fun exportTo(open: (CatalogListItem) -> FileDestination) {
        val current = mutableState.value
        if (current.phase != Phase.REVIEW || !canExport) return
        mutableState.value = current.copy(phase = Phase.RUNNING, pickerIssue = null)
        run = scope.launch {
            for ((index, item) in mutableState.value.items.withIndex()) {
                if (item.outcome != Outcome.Pending) continue
                update(index) { it.copy(outcome = Outcome.Exporting) }
                val outcome = try {
                    store.exportFile(item.source.nodeID, open(item.source), generation) { received, total ->
                        update(index) { it.copy(received = received, total = total) }
                    }
                    Outcome.Exported
                } catch (cancellation: CancellationException) {
                    throw cancellation
                } catch (error: Exception) {
                    if (error.failureKind == FailureKind.REVOKED) {
                        close()
                        return@launch
                    }
                    Outcome.Failed(if (error is IOException) FileIssue.DEVICE else error.fileIssue)
                }
                update(index) { it.copy(outcome = outcome) }
            }
            val after = mutableState.value
            if (after.phase == Phase.RUNNING) mutableState.value = after.copy(phase = Phase.FINISHED)
        }
    }

    public fun close() {
        run?.cancel()
        mutableState.value = State(phase = Phase.REVOKED)
    }

    private inline fun update(index: Int, change: (Item) -> Item) {
        val current = mutableState.value
        if (current.phase == Phase.REVOKED) return
        mutableState.value = current.copy(
            items = current.items.mapIndexed { i, item -> if (i == index) change(item) else item },
        )
    }
}
