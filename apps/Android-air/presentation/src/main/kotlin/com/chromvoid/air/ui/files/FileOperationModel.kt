package com.chromvoid.air.ui.files

import com.chromvoid.air.bridge.wire.CatalogListItem
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
 * A reviewed batch of moves or deletes, run as iOS runs it: one Core command
 * per item, each with its own result. Stop cannot roll back what Core already
 * confirmed. A move first chooses its destination by browsing folders from the
 * root; a chosen folder's own subtree is never offered.
 */
public class FileOperationModel(
    public val kind: Kind,
    items: List<CatalogListItem>,
    private val store: FileStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val includeHidden: Boolean = false,
    private val onFinished: (Set<Long>) -> Unit = {},
) {
    public enum class Kind { MOVE, DELETE }

    public enum class Phase { REVIEWING, RUNNING, STOPPING, FINISHED, REVOKED }

    public sealed interface Outcome {
        public data object Pending : Outcome

        public data object Running : Outcome

        public data object Completed : Outcome

        /** Core refused this item; the rest went on. */
        public data class Failed(val issue: FileIssue) : Outcome

        /** The result is unknown; the batch stopped here. */
        public data object Uncertain : Outcome
    }

    public data class Item(val source: CatalogListItem, val outcome: Outcome = Outcome.Pending)

    public enum class ReviewIssue {
        /** The destination has not finished loading. */
        WAIT_FOR_FOLDER,

        /** Every item is already in the destination. */
        SAME_FOLDER,
    }

    public data class State(
        val phase: Phase = Phase.REVIEWING,
        val items: List<Item> = emptyList(),
        /** Where a move goes, once it started. */
        val destination: String? = null,
        val issue: ReviewIssue? = null,
    ) {
        val busy: Boolean get() = phase == Phase.RUNNING || phase == Phase.STOPPING

        val completed: Int get() = items.count { it.outcome == Outcome.Completed }
    }

    private val mutableState = MutableStateFlow(State(items = items.map { Item(it) }))
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private val mutableFolders = MutableStateFlow(
        if (kind == Kind.MOVE) listOf(folder(FolderModel.ROOT)) else emptyList(),
    )

    /** The destination being browsed for a move, the root first; empty for a delete. */
    public val folders: StateFlow<List<FolderModel>> = mutableFolders.asStateFlow()

    private val excluded: Set<Long> = items.filter { it.isDir }.map { it.nodeID }.toSet()
    private var run: Job? = null

    /**
     * The folders a move may enter from [items]. Refusing the chosen folders
     * makes their subtrees unreachable; Core still validates the destination.
     */
    public fun destinations(items: List<CatalogListItem>): List<CatalogListItem> =
        items.filter { it.isDir && it.nodeID !in excluded }

    public fun openFolder(item: CatalogListItem) {
        val path = item.path ?: return
        if (mutableState.value.phase != Phase.REVIEWING || !item.isDir || item.nodeID in excluded) return
        mutableState.value = mutableState.value.copy(issue = null)
        mutableFolders.value = mutableFolders.value + folder(path)
    }

    public fun closeFolder() {
        val levels = mutableFolders.value
        if (levels.size <= 1) return
        levels.last().close()
        mutableFolders.value = levels.dropLast(1)
        mutableState.value = mutableState.value.copy(issue = null)
    }

    /** Runs the batch: a delete at once, a move into the folder shown last. */
    public fun start() {
        val current = mutableState.value
        if (current.phase != Phase.REVIEWING || current.items.isEmpty()) return
        var destination: String? = null
        if (kind == Kind.MOVE) {
            val target = mutableFolders.value.lastOrNull() ?: return
            if (target.state.value.status != FolderModel.Status.READY) {
                mutableState.value = current.copy(issue = ReviewIssue.WAIT_FOR_FOLDER)
                return
            }
            if (current.items.all { it.source.parentPath == target.path }) {
                mutableState.value = current.copy(issue = ReviewIssue.SAME_FOLDER)
                return
            }
            destination = target.path
        }
        closeFolders()
        mutableState.value = current.copy(phase = Phase.RUNNING, destination = destination, issue = null)
        run = scope.launch { execute(destination) }
    }

    /** Stops after the item in flight; what Core confirmed stays done. */
    public fun stop() {
        if (mutableState.value.phase != Phase.RUNNING) return
        mutableState.value = mutableState.value.copy(phase = Phase.STOPPING)
    }

    public fun close() {
        run?.cancel()
        closeFolders()
        mutableState.value = State(phase = Phase.REVOKED)
    }

    private suspend fun execute(destination: String?) {
        val items = mutableState.value.items
        for (index in items.indices) {
            if (mutableState.value.phase != Phase.RUNNING) break
            setOutcome(index, Outcome.Running)
            val id = items[index].source.nodeID
            val outcome = try {
                when (kind) {
                    Kind.MOVE -> store.moveFile(id, checkNotNull(destination), generation)
                    Kind.DELETE -> store.deleteFile(id, generation)
                }
                Outcome.Completed
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                when {
                    error.failureKind == FailureKind.REVOKED -> {
                        close()
                        return
                    }
                    error.isItemRefusal -> Outcome.Failed(error.fileIssue)
                    else -> Outcome.Uncertain
                }
            }
            setOutcome(index, outcome)
            if (outcome == Outcome.Uncertain) break
        }
        val after = mutableState.value
        if (after.phase == Phase.REVOKED) return
        mutableState.value = after.copy(phase = Phase.FINISHED)
        onFinished(after.items.filter { it.outcome == Outcome.Completed }.map { it.source.nodeID }.toSet())
    }

    private fun setOutcome(index: Int, outcome: Outcome) {
        val current = mutableState.value
        if (current.phase == Phase.REVOKED) return
        mutableState.value = current.copy(
            items = current.items.mapIndexed { i, item -> if (i == index) item.copy(outcome = outcome) else item },
        )
    }

    private fun closeFolders() {
        mutableFolders.value.forEach(FolderModel::close)
        mutableFolders.value = emptyList()
    }

    private fun folder(path: String): FolderModel = FolderModel(store, generation, path, scope, includeHidden)
}
