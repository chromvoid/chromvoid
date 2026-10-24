package com.chromvoid.air.ui.files

import com.chromvoid.air.bridge.wire.CatalogFolderFilter
import com.chromvoid.air.bridge.wire.CatalogFolderPageRequest
import com.chromvoid.air.bridge.wire.CatalogFolderSort
import com.chromvoid.air.bridge.wire.CatalogListItem
import com.chromvoid.air.ui.support.FailureKind
import com.chromvoid.air.ui.support.failureKind
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * One folder of the catalog: its items read so far, the query, the order and
 * the filters, and the items chosen for a batch. It is iOS's `FilesModel`
 * without the sheets, which the [FilesScope] owns.
 *
 * It holds names and sizes, never file contents, and only for as long as its
 * session: [close] drops everything, and a revoked session answers nothing.
 */
public class FolderModel(
    private val store: FileStore,
    public val generation: ULong,
    /** The folder shown; `/` is the vault's root. */
    public val path: String,
    private val scope: CoroutineScope,
    includeHidden: Boolean = false,
    private val searchDelayMillis: Long = SEARCH_DELAY_MILLIS,
) {
    public enum class Status { LOADING, READY, FAILED, REVOKED }

    /** Core's sort keys, in the order iOS offers them. */
    public enum class Sort(public val wire: String) { NAME("name"), DATE("date"), SIZE("size"), TYPE("type") }

    public enum class Issue {
        /** The folder changed between two pages; reading it again shows the latest. */
        CHANGED,

        /** The folder could not be read; it may be gone. */
        FAILED,
    }

    public data class State(
        val query: String = "",
        val items: List<CatalogListItem> = emptyList(),
        val status: Status = Status.LOADING,
        val sort: Sort = Sort.NAME,
        val descending: Boolean = false,
        val includeHidden: Boolean = false,
        /** Markdown notes in this folder and every folder below it. */
        val notesOnly: Boolean = false,
        /** Items matching in the whole folder, as Core counted them. */
        val total: Long = 0,
        val loadingMore: Boolean = false,
        val canLoadMore: Boolean = false,
        val issue: Issue? = null,
        /** The items chosen for a batch, by node id; null when not selecting. */
        val selection: Map<Long, CatalogListItem>? = null,
    ) {
        /** Empty because the folder holds nothing to show, not because a search matched nothing. */
        val isEmptyFolder: Boolean get() = status == Status.READY && items.isEmpty() && query.isBlank()

        val isNoMatch: Boolean get() = status == Status.READY && items.isEmpty() && query.isNotBlank()
    }

    private val mutableState = MutableStateFlow(State(includeHidden = includeHidden))
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private var nextOffset: Long? = null
    private var version: Long? = null
    private var fetch: Job? = null

    init {
        reload()
    }

    /** The last component of the path; empty for the root. */
    public val name: String get() = name(path)

    public fun search(query: String) {
        val current = mutableState.value
        if (current.status == Status.REVOKED || current.query == query) return
        mutableState.value = current.copy(query = query)
        reload(delayMillis = searchDelayMillis)
    }

    public fun setSort(sort: Sort) {
        update { if (it.sort == sort) null else it.copy(sort = sort) }
    }

    public fun setDescending(descending: Boolean) {
        update { if (it.descending == descending) null else it.copy(descending = descending) }
    }

    public fun setIncludeHidden(include: Boolean) {
        update { if (it.includeHidden == include) null else it.copy(includeHidden = include) }
    }

    public fun setNotesOnly(notes: Boolean) {
        update { if (it.notesOnly == notes) null else it.copy(notesOnly = notes, selection = null) }
    }

    /**
     * The Settings default for hidden items changed from [previous] to [next].
     * A folder still showing the old default follows it; one the user switched
     * by hand keeps the choice, as iOS does.
     */
    public fun followHiddenDefault(previous: Boolean, next: Boolean) {
        update { if (it.includeHidden != previous || it.includeHidden == next) null else it.copy(includeHidden = next) }
    }

    /**
     * Reads the first page again. What is on screen stays until the fresh page
     * replaces it, so typing does not blank the list between letters; a failure
     * does clear it, because stale rows under a new query would be wrong.
     */
    public fun reload(delayMillis: Long = 0) {
        if (mutableState.value.status == Status.REVOKED) return
        fetch?.cancel()
        nextOffset = null
        version = null
        mutableState.value = mutableState.value.copy(
            status = Status.LOADING,
            loadingMore = false,
            canLoadMore = false,
            issue = null,
        )
        fetch = scope.launch {
            if (delayMillis > 0) delay(delayMillis)
            read(offset = 0)
        }
    }

    public fun loadMore() {
        val current = mutableState.value
        val offset = nextOffset
        if (current.status != Status.READY || current.loadingMore || offset == null) return
        mutableState.value = current.copy(loadingMore = true)
        fetch = scope.launch { read(offset) }
    }

    /** Starts choosing items for a batch, optionally with [first] already chosen. */
    public fun beginSelection(first: CatalogListItem? = null) {
        val current = mutableState.value
        if (current.status == Status.REVOKED) return
        mutableState.value = current.copy(selection = first?.let { mapOf(it.nodeID to it) }.orEmpty())
    }

    public fun toggleSelection(item: CatalogListItem) {
        val current = mutableState.value
        val selection = current.selection ?: return
        mutableState.value = current.copy(
            selection = if (item.nodeID in selection) selection - item.nodeID else selection + (item.nodeID to item),
        )
    }

    public fun endSelection() {
        val current = mutableState.value
        if (current.selection == null) return
        mutableState.value = current.copy(selection = null)
    }

    /** Drops [ids] from the selection: a batch finished them. */
    public fun deselect(ids: Set<Long>) {
        val current = mutableState.value
        val selection = current.selection ?: return
        mutableState.value = current.copy(selection = selection - ids)
    }

    /** The request for the page after those read, under the version they were read at; null at the end. */
    public fun continuation(): CatalogFolderPageRequest? = nextOffset?.let { request(it) }

    /** The session ended. Nothing read under it stays in memory. */
    public fun close() {
        fetch?.cancel()
        nextOffset = null
        version = null
        mutableState.value = State(status = Status.REVOKED)
    }

    private inline fun update(change: (State) -> State?) {
        val current = mutableState.value
        if (current.status == Status.REVOKED) return
        val next = change(current) ?: return
        mutableState.value = next
        reload()
    }

    private suspend fun read(offset: Long) {
        val request = request(offset)
        try {
            val page = store.filePage(request, generation)
            if (page.reloadRequired) {
                fail(Issue.CHANGED)
                return
            }
            val previous = if (offset == 0L) emptyList() else mutableState.value.items
            val next = page.nextOffset
            // A page for another folder, one that goes backwards or one that
            // repeats an item would show the wrong list; it is a broken reply.
            val ids = previous.map { it.nodeID } + page.items.map { it.nodeID }
            if (page.currentPath != path ||
                page.offset != offset ||
                (next != null && next <= offset) ||
                ids.toSet().size != ids.size
            ) {
                fail(Issue.FAILED)
                return
            }
            nextOffset = next
            version = page.version
            val items = previous + page.items
            val selection = mutableState.value.selection?.let { chosen ->
                // A chosen item read again carries its current name and path.
                chosen + page.items.filter { it.nodeID in chosen }.associateBy { it.nodeID }
            }
            mutableState.value = mutableState.value.copy(
                items = items,
                status = Status.READY,
                loadingMore = false,
                canLoadMore = next != null,
                total = page.totalCount,
                issue = null,
                selection = selection,
            )
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (error: Exception) {
            if (error.failureKind == FailureKind.REVOKED) close() else fail(Issue.FAILED)
        }
    }

    private fun request(offset: Long): CatalogFolderPageRequest {
        val state = mutableState.value
        return CatalogFolderPageRequest(
            expectedVersion = version.takeIf { offset > 0 },
            filter = CatalogFolderFilter(
                fileTypes = if (state.notesOnly) listOf(MARKDOWN) else emptyList(),
                includeHidden = state.includeHidden,
                // Notes search reads the notes themselves, as its prompt says; Core
                // caps the bytes it reads per note. The folder list stays a name search.
                includeTextContent = state.notesOnly,
                query = state.query,
                recursive = state.notesOnly,
            ),
            limit = FILE_PAGE_SIZE,
            offset = offset,
            path = path,
            sort = CatalogFolderSort(by = state.sort.wire, direction = if (state.descending) "desc" else "asc"),
        )
    }

    private fun fail(issue: Issue) {
        nextOffset = null
        version = null
        mutableState.value = mutableState.value.copy(
            items = emptyList(),
            status = Status.FAILED,
            loadingMore = false,
            canLoadMore = false,
            issue = issue,
        )
    }

    public companion object {
        public const val ROOT: String = "/"
        public const val SEARCH_DELAY_MILLIS: Long = 250
        private const val MARKDOWN = "markdown"

        /** The last component of [path]; empty for the root. */
        public fun name(path: String): String = path.trimEnd('/').substringAfterLast('/')
    }
}
