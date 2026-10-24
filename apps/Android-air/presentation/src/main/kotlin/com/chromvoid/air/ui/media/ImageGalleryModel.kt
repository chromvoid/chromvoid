package com.chromvoid.air.ui.media

import com.chromvoid.air.bridge.wire.CatalogFolderPageRequest
import com.chromvoid.air.bridge.wire.CatalogListItem
import com.chromvoid.air.ui.files.FileStore
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
 * The images of a folder, in the folder's order, opened at one of them. At
 * most three previews live at a time - the one shown and its neighbours - and
 * the neighbours start reading only once the shown one is on screen, so the
 * one Core worker is not shared three ways while the person waits. Further
 * pages of the folder are read under the version the list was read at.
 */
public class ImageGalleryModel(
    private val store: FileStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    items: List<CatalogListItem>,
    selected: Long,
    /** The folder's next page, when it has more. */
    continuation: CatalogFolderPageRequest? = null,
    private val posters: ImagePosterCache? = null,
    private val preview: (Item) -> ImagePreviewModel = { item ->
        ImagePreviewModel(store, item.id, generation, item.name, item.sourceRevision, item.facts, scope, posters)
    },
) {
    public data class Item(val id: Long, val name: String, val sourceRevision: Long, val facts: ImageFacts)

    public enum class Issue { CHANGED, FAILED }

    public data class State(
        val items: List<Item> = emptyList(),
        val selected: Long = 0,
        val previews: Map<Long, ImagePreviewModel> = emptyMap(),
        val loadingMore: Boolean = false,
        val hasMore: Boolean = false,
        val issue: Issue? = null,
        val closed: Boolean = false,
    ) {
        val index: Int get() = items.indexOfFirst { it.id == selected }

        val name: String get() = items.firstOrNull { it.id == selected }?.name.orEmpty()

        val canGoBack: Boolean get() = !closed && index > 0

        val canGoForward: Boolean get() = !closed && (index + 1 < items.size || (!loadingMore && hasMore))
    }

    private var context: CatalogFolderPageRequest? = continuation
    private val mutableState = MutableStateFlow(
        State(items = images(items), selected = selected, hasMore = continuation?.offset != null),
    )
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private var pages: Job? = null
    private var neighbours: Job? = null

    init {
        updateWindow()
        prefetchNext()
    }

    public fun select(id: Long) {
        val current = mutableState.value
        if (current.closed || current.selected == id || current.items.none { it.id == id }) return
        current.previews[current.selected]?.pause()
        mutableState.value = current.copy(selected = id)
        updateWindow()
        prefetchNext()
    }

    public fun previous() {
        val current = mutableState.value
        if (current.canGoBack) select(current.items[current.index - 1].id)
    }

    public fun next() {
        val current = mutableState.value
        if (!current.canGoForward) return
        if (current.index + 1 < current.items.size) {
            select(current.items[current.index + 1].id)
        } else {
            loadNextPage(advance = true)
        }
    }

    /** Reads the next page before the person reaches the end of this one. */
    public fun prefetchNext() {
        val current = mutableState.value
        if (current.closed || current.loadingMore || !current.hasMore || current.index + 2 < current.items.size) return
        loadNextPage(advance = false)
    }

    public fun close() {
        pages?.cancel()
        neighbours?.cancel()
        mutableState.value.previews.values.forEach(ImagePreviewModel::close)
        context = null
        mutableState.value = State(closed = true)
    }

    private fun loadNextPage(advance: Boolean) {
        val request = context ?: return
        val origin = mutableState.value.selected
        mutableState.value = mutableState.value.copy(loadingMore = true, issue = null)
        pages = scope.launch {
            try {
                var offset = request.offset
                while (offset != null) {
                    val page = store.filePage(request.copy(offset = offset), generation)
                    if (page.reloadRequired || page.version != request.expectedVersion) {
                        context = null
                        finishPage(hasMore = false, issue = Issue.CHANGED)
                        return@launch
                    }
                    val additions = images(page.items)
                    val known = mutableState.value.items
                    val ids = known.map { it.id } + additions.map { it.id }
                    val next = page.nextOffset
                    if (page.currentPath != request.path ||
                        page.offset != offset ||
                        (next != null && next <= offset) ||
                        ids.toSet().size != ids.size
                    ) {
                        context = null
                        finishPage(hasMore = false, issue = Issue.FAILED)
                        return@launch
                    }
                    offset = next
                    context = request.copy(offset = offset)
                    mutableState.value = mutableState.value.copy(items = known + additions, hasMore = offset != null)
                    val first = additions.firstOrNull() ?: continue
                    finishPage(hasMore = offset != null, issue = null)
                    if (advance && mutableState.value.selected == origin) select(first.id) else updateWindow()
                    return@launch
                }
                finishPage(hasMore = false, issue = null)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (error.failureKind == FailureKind.REVOKED) {
                    close()
                } else {
                    finishPage(hasMore = true, issue = Issue.FAILED)
                }
            }
        }
    }

    private fun finishPage(hasMore: Boolean, issue: Issue?) {
        val current = mutableState.value
        if (current.closed) return
        mutableState.value = current.copy(loadingMore = false, hasMore = hasMore, issue = issue)
    }

    /** Keeps previews for the shown image and its neighbours; the rest are closed. */
    private fun updateWindow() {
        val current = mutableState.value
        val index = current.index
        if (index < 0) return
        val window = current.items.subList(maxOf(0, index - 1), minOf(current.items.size, index + 2))
        val retained = window.map { it.id }.toSet()
        current.previews.filterKeys { it !in retained }.values.forEach(ImagePreviewModel::close)
        val previews = current.previews.filterKeys { it in retained } +
            window.filter { it.id !in current.previews }.associate { it.id to preview(it) }
        mutableState.value = current.copy(previews = previews)
        loadWindow()
    }

    private fun loadWindow() {
        neighbours?.cancel()
        val current = mutableState.value
        val shown = current.previews[current.selected] ?: return
        val reading = shown.load() ?: shown.loading
        val origin = current.selected
        neighbours = scope.launch {
            reading?.join()
            val after = mutableState.value
            if (after.selected != origin) return@launch
            after.previews.filterKeys { it != origin }.values
                .filter { it.state.value.status == ImagePreviewModel.Status.IDLE }
                .forEach { it.load() }
        }
    }

    public companion object {
        /** The images of a listing, as the gallery pages through them. */
        public fun images(items: List<CatalogListItem>): List<Item> = items.filter {
            !it.isDir && ImageDecoding.supports(it.name, it.mimeType)
        }.map {
            Item(
                it.nodeID,
                it.name,
                it.sourceRevision,
                ImageFacts(it.path, it.size ?: 0, it.mimeType, it.createdAt, it.updatedAt),
            )
        }
    }
}
