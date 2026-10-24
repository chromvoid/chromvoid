package com.chromvoid.air.ui.documents

import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import com.chromvoid.air.bridge.wire.CatalogFileLinkItem
import com.chromvoid.air.bridge.wire.CatalogListItem
import com.chromvoid.air.ui.files.FileSettings
import com.chromvoid.air.ui.files.FileStore
import com.chromvoid.air.ui.media.ImageDecoding
import com.chromvoid.air.ui.media.ImageGalleryModel
import com.chromvoid.air.ui.media.ImagePosterCache
import com.chromvoid.air.ui.media.MediaPlayers
import com.chromvoid.air.ui.media.MediaPreviewModel
import com.chromvoid.air.ui.media.PdfPreviewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * One document opened from Files, and the documents its links lead to, as
 * iOS's document sheet keeps them: a stack the person goes back through, each
 * with its own draft. A link to an image, a PDF or media opens its viewer over
 * the stack; any other file shows its information.
 */
@OptIn(UnstableApi::class)
public class DocumentNavigator(
    private val store: FileStore,
    nodeId: Long,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val players: MediaPlayers? = null,
    /** Where inserted images go; null where images cannot be inserted (tests, previews). */
    settings: FileSettings? = null,
    /** Images this session decoded, shared with the gallery. */
    private val posters: ImagePosterCache? = null,
    private val onSaved: () -> Unit = {},
    private val document: (Long, String?) -> DocumentModel = { id, anchor ->
        DocumentModel(store, id, generation, scope, anchor, settings = settings, posters = posters, onSaved = onSaved)
    },
) {
    /** A viewer opened by a link, over the document. */
    public sealed interface Viewer {
        public class Images(public val model: ImageGalleryModel) : Viewer

        public class Pdf(public val model: PdfPreviewModel) : Viewer

        public class Media(public val model: MediaPreviewModel) : Viewer

        public class Information(public val item: CatalogFileLinkItem) : Viewer
    }

    private val mutableStack = MutableStateFlow(listOf(open(nodeId, null)))

    /** The first document, then each opened from a link in the one below. */
    public val stack: StateFlow<List<DocumentModel>> = mutableStack.asStateFlow()

    private val mutableViewer = MutableStateFlow<Viewer?>(null)
    public val viewer: StateFlow<Viewer?> = mutableViewer.asStateFlow()

    /** Whether any document in the stack holds unsaved changes. */
    public val hasUnsavedChanges: Boolean get() = mutableStack.value.any { it.state.value.dirty }

    /** Back from a linked document, once it agreed to close; the first one stays. */
    public fun pop() {
        val stack = mutableStack.value
        if (stack.size <= 1) return
        stack.last().close()
        mutableStack.value = stack.dropLast(1)
    }

    public fun closeViewer() {
        when (val viewer = mutableViewer.value) {
            is Viewer.Images -> viewer.model.close()
            is Viewer.Pdf -> viewer.model.close()
            is Viewer.Media -> viewer.model.close()
            is Viewer.Information, null -> Unit
        }
        mutableViewer.value = null
    }

    public fun close() {
        closeViewer()
        mutableStack.value.forEach(DocumentModel::close)
        mutableStack.value = emptyList()
    }

    private fun open(id: Long, anchor: String?): DocumentModel = document(id, anchor).also { model ->
        model.onNavigate = { item, target -> navigate(model, item, target) }
    }

    private fun navigate(from: DocumentModel, item: CatalogFileLinkItem, anchor: String?) {
        // Only the document on top follows its links.
        if (mutableStack.value.lastOrNull() !== from || mutableViewer.value != null) return
        mutableViewer.value = when {
            ImageDecoding.supports(item.name, item.mimeType) ->
                Viewer.Images(
                    ImageGalleryModel(store, generation, scope, listOf(listItem(item)), item.nodeID, posters = posters),
                )
            PdfPreviewModel.supports(item.name, item.mimeType) ->
                Viewer.Pdf(PdfPreviewModel(store, item.nodeID, generation, item.name, scope))
            players != null && MediaPreviewModel.supports(item.name, item.mimeType) ->
                Viewer.Media(MediaPreviewModel(store, item.nodeID, generation, item.name, scope, players))
            DocumentModel.supports(item.name, item.mimeType) -> {
                mutableStack.value = mutableStack.value + open(item.nodeID, anchor)
                null
            }
            else -> Viewer.Information(item)
        }
    }

    private fun listItem(item: CatalogFileLinkItem): CatalogListItem = CatalogListItem(
        createdAt = item.createdAt,
        isDir = false,
        mediaInspectedRevision = 0,
        mimeType = item.mimeType,
        name = item.name,
        nodeID = item.nodeID,
        parentPath = item.parentPath,
        path = item.path,
        size = item.size,
        sourceRevision = item.sourceRevision,
        updatedAt = item.updatedAt,
    )
}
