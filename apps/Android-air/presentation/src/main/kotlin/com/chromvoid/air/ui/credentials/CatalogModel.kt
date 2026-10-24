package com.chromvoid.air.ui.credentials

import com.chromvoid.air.bridge.wire.CredentialSummary
import com.chromvoid.air.bridge.wire.CredentialTagSummary
import com.chromvoid.air.bridge.wire.PassmanagerEntryPageRequest
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
 * The credential catalog of one unlocked session: the query, the entries read
 * so far and whether more can be read.
 *
 * It holds titles and logins, never a secret, and only for as long as its
 * session: [close] drops everything, and a revoked session answers nothing.
 * Search is delayed while the user types, so a word costs one request rather
 * than one per letter.
 */
public class CatalogModel(
    private val store: CredentialStore,
    public val generation: ULong,
    private val scope: CoroutineScope,
    private val clipboard: CredentialClipboard,
    /** The icons of this generation; a page asks for the digests it just showed. */
    public val icons: CredentialIconCache? = null,
    private val searchDelayMillis: Long = SEARCH_DELAY_MILLIS,
    /** The group this level shows; null is the vault root. Pages include descendants. */
    public val groupPath: String? = null,
    /** The moment "modified" grouping is measured from; replaceable in tests. */
    private val now: () -> Long = System::currentTimeMillis,
) {
    public enum class Status { LOADING, READY, FAILED, REVOKED }

    public data class Section(
        val entries: List<CredentialSummary>,
        val groupKey: String? = null,
        val isNested: Boolean = false,
    )

    public data class State(
        val query: String = "",
        val entries: List<CredentialSummary> = emptyList(),
        val status: Status = Status.LOADING,
        val loadingMore: Boolean = false,
        val canLoadMore: Boolean = false,
        /** The record whose primary secret is being read for a quick copy. */
        val quickCopying: String? = null,
        /** Increments on every quick copy, so the screen confirms each one. */
        val quickCopies: Int = 0,
        /** The record whose quick copy failed, and why. */
        val quickCopyIssue: Pair<String, CredentialDetailModel.FieldIssue>? = null,
        /** The tag the list is narrowed to, if any. */
        val tag: CredentialTagSummary? = null,
        val options: CatalogOptions = CatalogOptions(),
        /** The records chosen for a bulk action; null when not selecting. */
        val selection: Set<String>? = null,
        val confirmingDelete: Boolean = false,
        val deleting: Boolean = false,
        /** How many of the last bulk delete Core refused; they stay selected. */
        val deleteFailures: Int = 0,
        /** Records matching in the whole scope, when Core counted them (sorted or grouped pages). */
        val totalCount: Long? = null,
        /** The level these pages belong to; null is the vault root. */
        val groupPath: String? = null,
    ) {
        /** Browsing separates this level from descendants; search and Core grouping keep their order. */
        val sections: List<Section>
            get() {
                if (entries.isEmpty()) return emptyList()
                if (options.grouping == CatalogOptions.Grouping.NONE) {
                    if (query.isNotBlank()) return listOf(Section(entries))
                    val (direct, nested) = entries.partition {
                        it.groupPath == (groupPath ?: "/") || (groupPath == null && it.groupPath.isEmpty())
                    }
                    return buildList {
                        if (direct.isNotEmpty()) add(Section(direct))
                        if (nested.isNotEmpty()) add(Section(nested, isNested = true))
                    }
                }
                return buildList {
                    var start = 0
                    while (start < entries.size) {
                        val key = entries[start].groupKey
                        var end = start + 1
                        while (end < entries.size && entries[end].groupKey == key) end++
                        add(Section(entries.subList(start, end), groupKey = key))
                        start = end
                    }
                }
            }

        /** Empty because the vault holds nothing, not because nothing matched. */
        val isEmptyVault: Boolean
            get() = status == Status.READY && entries.isEmpty() && query.isBlank() && tag == null && !options.hasFilters

        /** Empty because the query matched nothing; the screen offers to clear it. */
        val isNoMatch: Boolean
            get() = status == Status.READY &&
                entries.isEmpty() &&
                (query.isNotBlank() || tag != null || options.hasFilters)
    }

    private val mutableState = MutableStateFlow(State(groupPath = groupPath))
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private var nextOffset: Long? = null
    private var fetch: Job? = null

    init {
        reload()
    }

    public fun search(query: String) {
        val current = mutableState.value
        if (current.status == Status.REVOKED || current.query == query) return
        mutableState.value = current.copy(query = query)
        reload(delayMillis = searchDelayMillis)
    }

    public fun clearSearch(): Unit = search("")

    /** Changes how the list is ordered, narrowed or grouped, and reads it again. */
    public fun setOptions(options: CatalogOptions) {
        val current = mutableState.value
        if (current.status == Status.REVOKED || current.options == options) return
        mutableState.value = current.copy(options = options)
        reload()
    }

    /** Clears the filters and the tag; sort and grouping stay as chosen. */
    public fun clearFilters() {
        val current = mutableState.value
        if (current.status == Status.REVOKED || (!current.options.hasFilters && current.tag == null)) return
        mutableState.value = current.copy(options = current.options.withoutFilters(), tag = null)
        reload()
    }

    /** Narrows the list to records carrying [tag]; null shows them all again. */
    public fun filterTag(tag: CredentialTagSummary?) {
        val current = mutableState.value
        if (current.status == Status.REVOKED || current.tag?.key == tag?.key) return
        mutableState.value = current.copy(tag = tag)
        reload()
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
        mutableState.value = mutableState.value.copy(
            status = Status.LOADING,
            loadingMore = false,
            canLoadMore = false,
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

    /**
     * Copies a record's primary secret in one tap - the password of a login,
     * the number of a card - without opening it. The value goes straight to the
     * clipboard and is never kept here.
     */
    public fun quickCopy(entry: CredentialSummary) {
        val current = mutableState.value
        val type = primarySecret(entry.entryType) ?: return
        // A reload - a search typed, a change elsewhere - keeps the rows on screen, and a row shown
        // copies; only a list that failed or ended does not.
        if (current.status != Status.READY && current.status != Status.LOADING) return
        if (current.quickCopying != null || current.entries.none { it.id == entry.id }) return
        mutableState.value = current.copy(quickCopying = entry.id, quickCopyIssue = null)
        scope.launch {
            val issue = try {
                val value = store.readCredentialSecret(entry.id, type, generation)
                if (value.isEmpty()) {
                    CredentialDetailModel.FieldIssue.EMPTY
                } else {
                    clipboard.copy(value, sensitive = true)
                    null
                }
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                when (error.failureKind) {
                    FailureKind.REVOKED -> {
                        close()
                        return@launch
                    }
                    FailureKind.MISSING -> CredentialDetailModel.FieldIssue.EMPTY
                    FailureKind.TOO_LARGE -> CredentialDetailModel.FieldIssue.TOO_LARGE
                    else -> CredentialDetailModel.FieldIssue.FAILED
                }
            }
            val after = mutableState.value
            if (after.status == Status.REVOKED) return@launch
            mutableState.value = after.copy(
                quickCopying = null,
                quickCopies = if (issue == null) after.quickCopies + 1 else after.quickCopies,
                quickCopyIssue = issue?.let { entry.id to it },
            )
        }
    }

    /** Starts choosing records, optionally with [first] already chosen. */
    public fun beginSelection(first: String? = null) {
        val current = mutableState.value
        if (current.status == Status.REVOKED || current.deleting) return
        mutableState.value = current.copy(selection = setOfNotNull(first), deleteFailures = 0)
    }

    public fun toggleSelection(id: String) {
        val current = mutableState.value
        val selection = current.selection ?: return
        if (current.deleting) return
        mutableState.value = current.copy(selection = if (id in selection) selection - id else selection + id)
    }

    public fun endSelection() {
        val current = mutableState.value
        if (current.deleting) return
        mutableState.value = current.copy(selection = null, confirmingDelete = false, deleteFailures = 0)
    }

    public fun requestDelete() {
        val current = mutableState.value
        if (current.selection.isNullOrEmpty() || current.deleting) return
        mutableState.value = current.copy(confirmingDelete = true)
    }

    public fun cancelDelete() {
        mutableState.value = mutableState.value.copy(confirmingDelete = false)
    }

    /**
     * Deletes every chosen record, one at a time as Core takes them. What was
     * deleted leaves the selection; what Core refused stays chosen, so the
     * user sees exactly what is left and can try again or give up.
     */
    public fun confirmDelete() {
        val current = mutableState.value
        val chosen = current.selection?.toList().orEmpty()
        if (!current.confirmingDelete || chosen.isEmpty()) return
        mutableState.value = current.copy(confirmingDelete = false, deleting = true, deleteFailures = 0)
        scope.launch {
            val failed = mutableSetOf<String>()
            for (id in chosen) {
                try {
                    store.deleteCredential(id, generation)
                } catch (cancellation: CancellationException) {
                    throw cancellation
                } catch (error: Exception) {
                    when (error.failureKind) {
                        FailureKind.REVOKED -> {
                            close()
                            return@launch
                        }
                        // Already gone is what was asked for.
                        FailureKind.MISSING -> Unit
                        else -> failed += id
                    }
                }
            }
            clipboard.clearOwned()
            val after = mutableState.value
            mutableState.value = after.copy(
                deleting = false,
                selection = if (failed.isEmpty()) null else failed,
                deleteFailures = failed.size,
            )
            reload()
        }
    }

    /** The session ended. Nothing read under it stays in memory. */
    public fun close() {
        fetch?.cancel()
        nextOffset = null
        mutableState.value = State(status = Status.REVOKED)
    }

    private suspend fun read(offset: Long) {
        val query = mutableState.value.query
        val tagKey = mutableState.value.tag?.key
        val options = mutableState.value.options
        try {
            val page = store.credentialPage(
                PassmanagerEntryPageRequest(
                    limit = CREDENTIAL_PAGE_SIZE,
                    offset = offset,
                    query = query,
                    groupPath = groupPath,
                    tagKey = tagKey,
                    sort = options.sort.wire,
                    descending = options.descending,
                    entryType = options.kind.wire,
                    quickFilters = options.requestFilters.ifEmpty { null },
                    groupBy = options.grouping.wire,
                    groupingTime = if (options.grouping == CatalogOptions.Grouping.MODIFIED) now() else null,
                ),
                generation,
            )
            val previous = if (offset == 0L) emptyList() else mutableState.value.entries
            val next = page.nextOffset
            // A page that goes backwards or repeats an entry would loop or show
            // a record twice; it is a broken reply, not a longer catalog.
            val ids = previous.map { it.id } + page.entries.map { it.id }
            val sectionsKnown = page.entries.all { CatalogOptions.knownSection(options.grouping, it.groupKey) }
            if ((next != null && next <= offset) || ids.toSet().size != ids.size || !sectionsKnown) {
                fail()
                return
            }
            nextOffset = next
            icons?.request(page.entries.mapNotNull { it.iconRef })
            mutableState.value = mutableState.value.copy(
                entries = previous + page.entries,
                status = Status.READY,
                loadingMore = false,
                canLoadMore = next != null,
                totalCount = if (offset == 0L) page.totalCount else mutableState.value.totalCount,
            )
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (error: Exception) {
            if (error.failureKind == FailureKind.REVOKED) close() else fail()
        }
    }

    private fun fail() {
        nextOffset = null
        mutableState.value = mutableState.value.copy(
            entries = emptyList(),
            status = Status.FAILED,
            loadingMore = false,
            canLoadMore = false,
        )
    }

    public companion object {
        public const val SEARCH_DELAY_MILLIS: Long = 250

        /** The secret a quick copy takes, or null when the type has none. */
        public fun primarySecret(entryType: String): String? = when (entryType) {
            "login" -> CredentialDetailModel.PASSWORD
            "payment_card" -> CredentialDetailModel.CARD_NUMBER
            else -> null
        }
    }
}
