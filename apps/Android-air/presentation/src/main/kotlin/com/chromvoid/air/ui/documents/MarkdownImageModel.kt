package com.chromvoid.air.ui.documents

import com.chromvoid.air.bridge.wire.CatalogDocumentLinkKind
import com.chromvoid.air.bridge.wire.CatalogDocumentLinkResponseKind
import com.chromvoid.air.bridge.wire.MarkdownTarget
import com.chromvoid.air.bridge.wire.MarkdownTargetKind
import com.chromvoid.air.ui.files.FileStore
import com.chromvoid.air.ui.media.ImageDecoding
import com.chromvoid.air.ui.media.ImageFacts
import com.chromvoid.air.ui.media.ImagePosterCache
import com.chromvoid.air.ui.media.ImagePreviewModel
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
 * An image inside a note, as iOS shows it: Core resolves the attachment the
 * note names, and only an image it found is read, through the same bounded
 * preview the gallery uses. It lives while its place in the preview is on
 * screen.
 */
public class MarkdownImageModel(
    private val store: FileStore,
    private val sourceId: Long,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val target: MarkdownTarget,
    private val posters: ImagePosterCache? = null,
) {
    public data class State(
        val preview: ImagePreviewModel? = null,
        /** The note names no image Core could find and read. */
        val unavailable: Boolean = false,
    )

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private var work: Job? = null
    private var closed = false

    public fun load() {
        val current = mutableState.value
        val path = target.path ?: return
        if (closed || work?.isActive == true || current.preview != null) return
        if (target.kind != MarkdownTargetKind.Catalog && target.kind != MarkdownTargetKind.Note) return
        mutableState.value = State()
        work = scope.launch {
            try {
                val kind = when (target.kind) {
                    MarkdownTargetKind.Catalog -> CatalogDocumentLinkKind.File
                    else -> CatalogDocumentLinkKind.Note
                }
                val result = store.resolveLink(sourceId, path, kind, generation)
                val item = result.item
                if (closed) return@launch
                if (result.kind != CatalogDocumentLinkResponseKind.Found || item == null ||
                    !ImageDecoding.supports(item.name, item.mimeType)
                ) {
                    mutableState.value = State(unavailable = true)
                    return@launch
                }
                val preview = ImagePreviewModel(
                    store,
                    item.nodeID,
                    generation,
                    item.name,
                    item.sourceRevision,
                    ImageFacts(item.path, item.size, item.mimeType, item.createdAt, item.updatedAt),
                    scope,
                    posters,
                )
                mutableState.value = State(preview = preview)
                preview.load()
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (closed) return@launch
                if (error.failureKind == FailureKind.REVOKED) {
                    close()
                    return@launch
                }
                mutableState.value = State(unavailable = true)
            }
        }
    }

    /** The image left the screen, the preview changed, or the session ended. */
    public fun close() {
        closed = true
        work?.cancel()
        mutableState.value.preview?.close()
        mutableState.value = State()
    }
}
