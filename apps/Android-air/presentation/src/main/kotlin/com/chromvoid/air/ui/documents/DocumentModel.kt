package com.chromvoid.air.ui.documents

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.MarkdownProcessor
import com.chromvoid.air.bridge.wire.CatalogDocumentLinkKind
import com.chromvoid.air.bridge.wire.CatalogDocumentLinkResponseKind
import com.chromvoid.air.bridge.wire.CatalogFileLinkItem
import com.chromvoid.air.bridge.wire.MarkdownContentKind
import com.chromvoid.air.bridge.wire.MarkdownDocument
import com.chromvoid.air.bridge.wire.MarkdownTarget
import com.chromvoid.air.bridge.wire.MarkdownTargetKind
import com.chromvoid.air.ui.files.FileIssue
import com.chromvoid.air.ui.files.FileSettings
import com.chromvoid.air.ui.files.FileSource
import com.chromvoid.air.ui.files.FileStore
import com.chromvoid.air.ui.files.FileTooLarge
import com.chromvoid.air.ui.files.NotText
import com.chromvoid.air.ui.files.OpenedDocument
import com.chromvoid.air.ui.files.fileIssue
import com.chromvoid.air.ui.media.ImagePosterCache
import com.chromvoid.air.ui.support.FailureKind
import com.chromvoid.air.ui.support.failureKind
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * One open text document, as the iOS editor holds it: the text read at a
 * revision, a Markdown preview Core parsed from it, and an explicit save that
 * names that revision. A save refused because the file changed meanwhile shows
 * both versions and lets the person choose; one whose outcome is unknown says
 * so and offers the comparison. Nothing is saved silently, and nothing typed
 * is lost without a question.
 */
public class DocumentModel(
    private val store: FileStore,
    public val nodeId: Long,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val initialAnchor: String? = null,
    private val parse: suspend (String) -> MarkdownDocument = { source ->
        withContext(Dispatchers.Default) { MarkdownProcessor.parse(source) }
    },
    private val toggle: suspend (String, String, Long, Boolean) -> String = { source, digest, marker, checked ->
        withContext(Dispatchers.Default) { MarkdownProcessor.toggleTask(source, digest, marker, checked) }
    },
    /** Where inserted images go; null where this device cannot import them (tests, previews). */
    private val settings: FileSettings? = null,
    /** Images this session decoded, shared with the gallery. */
    private val posters: ImagePosterCache? = null,
    /** Called after a confirmed save and after inserted images landed in their folder. */
    private val onSaved: () -> Unit = {},
) {
    public enum class Phase { LOADING, EDITING, SAVING, CONFLICT, FAILED, UNCERTAIN, REVOKED }

    public enum class Mode { PREVIEW, SOURCE }

    public enum class Issue {
        TOO_LARGE,
        NOT_TEXT,

        /** A save Core could not confirm; the draft is kept. */
        UNCERTAIN,

        /** The file changed since it was read: the two versions are compared. */
        CONFLICT,

        /** The read or save failed for a reason [refusal] names. */
        FAILED,

        /** The picker handed back no image that could be read. */
        IMAGE_UNREADABLE,

        /** Insertion stopped; images already imported stay in the attachment folder. */
        IMAGE_CANCELED,

        /** An image did not import; the attachment folder may hold part of the batch. */
        IMAGE_FAILED,
    }

    public enum class PreviewIssue { UNPREVIEWABLE, TASK_FAILED, LINK_MISSING, LINK_AMBIGUOUS, LINK_FAILED, NO_ANCHOR }

    /** A request to scroll the preview to [node]; [serial] makes a repeated jump a new one. */
    public data class AnchorJump(val serial: Int, val node: Int)

    public data class State(
        val phase: Phase = Phase.LOADING,
        val mode: Mode = Mode.SOURCE,
        val name: String = "",
        val text: String = "",
        val markdown: Boolean = false,
        /** The text is not what was last read or saved. */
        val dirty: Boolean = false,
        /** The last save was confirmed and nothing changed since. */
        val saved: Boolean = false,
        val preview: MarkdownDocument? = null,
        val previewLoading: Boolean = false,
        val previewIssue: PreviewIssue? = null,
        val resolvingLink: Boolean = false,
        val anchorJump: AnchorJump? = null,
        /** The saved version, when a save found the file changed. */
        val conflict: OpenedDocument? = null,
        val confirmingClose: Boolean = false,
        val issue: Issue? = null,
        val refusal: FileIssue? = null,
        /** The source's selection, as characters; the editor follows it when the model changes the text. */
        val selectionStart: Int = 0,
        val selectionEnd: Int = 0,
        /** A Markdown note on a device that can import images into the vault. */
        val imagesOffered: Boolean = false,
        val importingImage: Boolean = false,
        /** 0 to 1 over every image of the insertion. */
        val imageProgress: Float = 0f,
    ) {
        val busy: Boolean get() = phase == Phase.LOADING || phase == Phase.SAVING || importingImage

        val canInsertImage: Boolean get() = imagesOffered && phase == Phase.EDITING && !importingImage
    }

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()

    /** Called with a file a link opened and the heading it named; the navigator decides how to show it. */
    public var onNavigate: ((CatalogFileLinkItem, String?) -> Unit)? = null

    private var opened: OpenedDocument? = null
    private var work: Job? = null
    private var previewWork: Job? = null
    private var linkWork: Job? = null
    private var imageWork: Job? = null
    private var jumps = 0

    /** Where the chosen images go into the source: the selection when the picker opened. */
    private var insertion: IntRange? = null

    /** Stop was asked: the images imported so far are still linked. */
    private var stopRequested = false
    private val inlineImages = mutableMapOf<Int, MarkdownImageModel>()

    public fun load() {
        val current = mutableState.value
        if (opened != null || (current.phase != Phase.LOADING && current.phase != Phase.FAILED)) return
        mutableState.value = current.copy(phase = Phase.LOADING, issue = null, refusal = null)
        work = scope.launch {
            try {
                val document = store.readDocument(nodeId, generation)
                opened = document
                val markdown = isMarkdown(document.name, document.mimeType)
                mutableState.value = State(
                    phase = Phase.EDITING,
                    mode = if (markdown) Mode.PREVIEW else Mode.SOURCE,
                    name = document.name,
                    text = document.text,
                    markdown = markdown,
                    imagesOffered = markdown && settings != null,
                )
                if (markdown) {
                    refresh()
                    initialAnchor?.let(::jumpToAnchor)
                }
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (error.failureKind == FailureKind.REVOKED) {
                    close()
                    return@launch
                }
                mutableState.value = mutableState.value.copy(
                    phase = Phase.FAILED,
                    issue = when (error) {
                        is FileTooLarge -> Issue.TOO_LARGE
                        is NotText -> Issue.NOT_TEXT
                        else -> Issue.FAILED
                    },
                    refusal = error.fileIssue,
                )
            }
        }
    }

    public fun setText(text: String) {
        val current = mutableState.value
        if (current.phase != Phase.EDITING || current.importingImage || current.text == text) return
        invalidatePreview()
        mutableState.value = mutableState.value.copy(
            text = text,
            dirty = text != opened?.text,
            saved = false,
            issue = null,
        )
    }

    public fun setSelection(start: Int, end: Int) {
        val current = mutableState.value
        if (current.phase != Phase.EDITING || current.importingImage) return
        if (start < 0 || end < start || end > current.text.length) return
        if (current.selectionStart == start && current.selectionEnd == end) return
        mutableState.value = current.copy(selectionStart = start, selectionEnd = end)
    }

    public fun setMode(mode: Mode) {
        val current = mutableState.value
        if (current.phase != Phase.EDITING || current.importingImage) return
        if (!current.markdown || current.mode == mode) return
        invalidatePreview()
        mutableState.value = mutableState.value.copy(mode = mode)
        if (mode == Mode.PREVIEW) previewWork = scope.launch { refresh() }
    }

    /** Ticks or clears the task at [node] in the source, through Core's task editor. */
    public fun toggleTask(node: Int) {
        val current = mutableState.value
        val preview = current.preview ?: return
        if (current.phase != Phase.EDITING || current.mode != Mode.PREVIEW || current.previewLoading) return
        val content = preview.nodes.getOrNull(node)?.content ?: return
        val checked = content.checked ?: return
        if (content.kind != MarkdownContentKind.Task) return
        val text = current.text
        mutableState.value = current.copy(previewLoading = true, previewIssue = null)
        previewWork = scope.launch {
            try {
                val changed = toggle(text, preview.sourceDigest, preview.nodes[node].start, checked)
                val result = parse(changed)
                val after = mutableState.value
                if (after.phase != Phase.EDITING || after.text != text) return@launch
                clearInlineImages()
                mutableState.value = after.copy(
                    text = changed,
                    dirty = changed != opened?.text,
                    saved = false,
                    preview = result,
                    previewLoading = false,
                )
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (_: Exception) {
                mutableState.value = mutableState.value.copy(
                    previewLoading = false,
                    previewIssue = PreviewIssue.TASK_FAILED,
                )
            }
        }
    }

    /**
     * A link in the preview was tapped. An external one comes back for the
     * system to open; a heading scrolls; a file or note is resolved by Core and
     * handed to [onNavigate]. A blocked link does nothing.
     */
    public fun activateLink(node: Int): String? {
        val current = mutableState.value
        if (current.phase != Phase.EDITING || current.mode != Mode.PREVIEW || current.previewLoading) return null
        if (current.resolvingLink) return null
        val target = current.preview?.nodes?.getOrNull(node)?.content?.target ?: return null
        when (target.kind) {
            MarkdownTargetKind.External -> return target.url
            MarkdownTargetKind.Anchor -> target.anchor?.let(::jumpToAnchor)
            MarkdownTargetKind.Catalog, MarkdownTargetKind.Note -> openInternalLink(target)
            MarkdownTargetKind.Blocked -> Unit
        }
        return null
    }

    public fun jumpToAnchor(anchor: String) {
        val current = mutableState.value
        val index = current.preview?.nodes?.indexOfFirst {
            it.content.kind == MarkdownContentKind.Heading && it.content.anchor == anchor
        } ?: -1
        mutableState.value = if (index < 0) {
            current.copy(previewIssue = PreviewIssue.NO_ANCHOR)
        } else {
            current.copy(anchorJump = AnchorJump(++jumps, index))
        }
    }

    /**
     * Insert image, in the source: remembers where the images go. Returns
     * whether the picker should open.
     */
    public fun chooseImage(): Boolean {
        val current = mutableState.value
        if (!current.canInsertImage || current.mode != Mode.SOURCE) return false
        insertion = current.selectionStart..current.selectionEnd
        mutableState.value = current.copy(issue = null)
        return true
    }

    /** The picker could not hand the images over. */
    public fun imagePickerFailed() {
        insertion = null
        if (mutableState.value.canInsertImage) {
            mutableState.value = mutableState.value.copy(issue = Issue.IMAGE_UNREADABLE)
        }
    }

    /**
     * The picked images, imported one after another into the attachment
     * folder; their links go where the selection was, once each import is
     * confirmed. A failure stops the rest.
     */
    public fun receiveImages(sources: List<FileSource>) {
        val current = mutableState.value
        val range = insertion ?: current.selectionStart..current.selectionEnd
        insertion = null
        val folder = settings?.state?.value?.attachmentFolder
        if (sources.isEmpty()) return
        if (folder == null || !current.canInsertImage || current.mode != Mode.SOURCE) {
            scope.launch { sources.forEach { runCatching { it.close() } } }
            return
        }
        val original = current.text
        stopRequested = false
        mutableState.value = current.copy(importingImage = true, imageProgress = 0f, issue = null)
        imageWork = scope.launch {
            val links = mutableListOf<String>()
            var failure: Issue? = null
            var next = 0
            try {
                while (next < sources.size) {
                    val index = next++
                    try {
                        links += store.importAttachment(sources[index], folder, generation) { received, total ->
                            val fraction = if (total > 0) (received.toFloat() / total).coerceIn(0f, 1f) else 0f
                            val now = mutableState.value
                            if (now.importingImage) {
                                mutableState.value = now.copy(imageProgress = (index + fraction) / sources.size)
                            }
                        }
                    } catch (cancellation: CancellationException) {
                        throw cancellation
                    } catch (error: Exception) {
                        if (error.failureKind == FailureKind.REVOKED) {
                            close()
                            return@launch
                        }
                        failure = Issue.IMAGE_FAILED
                        break
                    }
                }
            } catch (cancellation: CancellationException) {
                // Only Stop is answered with what was imported; a closed document is gone.
                if (!stopRequested) throw cancellation
                failure = Issue.IMAGE_CANCELED
            } finally {
                withContext(NonCancellable) { sources.drop(next).forEach { runCatching { it.close() } } }
            }
            finishInsertion(original, range, links, failure)
        }
    }

    /** Stop: the image in flight ends, and those already imported are still linked. */
    public fun cancelImageImport() {
        if (!mutableState.value.importingImage) return
        stopRequested = true
        imageWork?.cancel()
    }

    /**
     * An image of the preview came on screen: its model, resolved and read
     * once. Only an image of the preview on screen is admitted.
     */
    public fun inlineImage(node: Int, sourceDigest: String): MarkdownImageModel? {
        val current = mutableState.value
        val preview = current.preview ?: return null
        if (current.phase != Phase.EDITING && current.phase != Phase.SAVING) return null
        if (current.mode != Mode.PREVIEW || preview.sourceDigest != sourceDigest) return null
        val content = preview.nodes.getOrNull(node)?.content ?: return null
        val target = content.target ?: return null
        if (content.kind != MarkdownContentKind.Image) return null
        if (target.kind != MarkdownTargetKind.Catalog && target.kind != MarkdownTargetKind.Note) return null
        return inlineImages.getOrPut(node) {
            MarkdownImageModel(store, nodeId, generation, scope, target, posters)
        }.also(MarkdownImageModel::load)
    }

    /** The image left the screen; what it decoded goes with it. */
    public fun releaseInlineImage(node: Int, sourceDigest: String) {
        if (mutableState.value.preview?.sourceDigest != sourceDigest) return
        inlineImages.remove(node)?.close()
    }

    public fun save() {
        val current = mutableState.value
        val document = opened ?: return
        if (current.phase != Phase.EDITING || current.importingImage) return
        if (!current.dirty) {
            mutableState.value = current.copy(saved = true)
            return
        }
        save(document.sourceRevision)
    }

    /** Keeps the draft over the saved version the conflict showed. */
    public fun useMyDraft() {
        val conflict = mutableState.value.conflict ?: return
        if (mutableState.value.phase != Phase.CONFLICT) return
        save(conflict.sourceRevision)
    }

    /** Takes the saved version in place of the draft. */
    public fun useSavedVersion() {
        val current = mutableState.value
        val conflict = current.conflict ?: return
        if (current.phase != Phase.CONFLICT) return
        opened = conflict
        invalidatePreview()
        mutableState.value = mutableState.value.copy(
            phase = Phase.EDITING,
            name = conflict.name,
            text = conflict.text,
            dirty = false,
            saved = false,
            conflict = null,
            issue = null,
            selectionStart = 0,
            selectionEnd = 0,
        )
        onSaved()
        if (mutableState.value.mode == Mode.PREVIEW) previewWork = scope.launch { refresh() }
    }

    /** Back to the draft without choosing yet; the next save compares again. */
    public fun keepEditing() {
        val current = mutableState.value
        if (current.phase != Phase.CONFLICT) return
        mutableState.value = current.copy(phase = Phase.EDITING, conflict = null, issue = null)
        if (current.mode == Mode.PREVIEW && current.preview == null) previewWork = scope.launch { refresh() }
    }

    /** After an unconfirmed save: reads the saved version to compare. */
    public fun compareSavedVersion() {
        if (mutableState.value.phase != Phase.UNCERTAIN) return
        mutableState.value = mutableState.value.copy(phase = Phase.LOADING)
        work = scope.launch { loadConflict() }
    }

    /** Done or Back: a changed draft asks first. Returns whether the document may close now. */
    public fun requestClose(): Boolean {
        val current = mutableState.value
        if (current.busy) return false
        if (current.dirty) {
            mutableState.value = current.copy(confirmingClose = true)
            return false
        }
        return true
    }

    public fun cancelClose() {
        mutableState.value = mutableState.value.copy(confirmingClose = false)
    }

    public fun close() {
        work?.cancel()
        previewWork?.cancel()
        linkWork?.cancel()
        stopRequested = false
        imageWork?.cancel()
        clearInlineImages()
        opened = null
        onNavigate = null
        mutableState.value = State(phase = Phase.REVOKED)
    }

    private fun save(revision: Long) {
        val text = mutableState.value.text
        if (text.encodeToByteArray().size > store.documentByteLimit) {
            mutableState.value = mutableState.value.copy(issue = Issue.TOO_LARGE)
            return
        }
        // The preview matches the text being saved, so it stays up and keeps its place.
        mutableState.value = mutableState.value.copy(phase = Phase.SAVING, issue = null, saved = false)
        work = scope.launch {
            try {
                val saved = store.saveDocument(nodeId, revision, text, generation)
                opened = OpenedDocument(nodeId, saved, mutableState.value.name, text, opened?.mimeType)
                mutableState.value = mutableState.value.copy(
                    phase = Phase.EDITING,
                    conflict = null,
                    saved = true,
                    dirty = mutableState.value.text != text,
                )
                onSaved()
                if (mutableState.value.mode == Mode.PREVIEW && mutableState.value.preview == null) refresh()
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                when {
                    error.failureKind == FailureKind.REVOKED -> close()
                    (error as? CoreRefusal)?.code == STALE_SOURCE -> loadConflict()
                    else -> mutableState.value = mutableState.value.copy(
                        phase = Phase.UNCERTAIN,
                        issue = Issue.UNCERTAIN,
                    )
                }
            }
        }
    }

    private fun finishInsertion(original: String, range: IntRange, links: List<String>, failure: Issue?) {
        val current = mutableState.value
        if (current.phase != Phase.EDITING || !current.importingImage) return
        mutableState.value = current.copy(importingImage = false, imageProgress = 0f)
        if (links.isNotEmpty() && current.text == original) {
            val start = range.first.coerceIn(0, original.length)
            val end = range.last.coerceIn(start, original.length)
            val markdown = links.joinToString("\n")
            setText(original.substring(0, start) + markdown + original.substring(end))
            val caret = start + markdown.length
            mutableState.value = mutableState.value.copy(selectionStart = caret, selectionEnd = caret)
        }
        mutableState.value = mutableState.value.copy(issue = failure)
        // The attachment folder holds new files whether or not their links went in.
        onSaved()
    }

    private suspend fun loadConflict() {
        try {
            val latest = store.readDocument(nodeId, generation)
            mutableState.value = mutableState.value.copy(
                phase = Phase.CONFLICT,
                conflict = latest,
                name = latest.name,
                issue = Issue.CONFLICT,
            )
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (error: Exception) {
            if (error.failureKind == FailureKind.REVOKED) {
                close()
                return
            }
            mutableState.value = mutableState.value.copy(
                phase = Phase.UNCERTAIN,
                conflict = null,
                issue = Issue.FAILED,
                refusal = error.fileIssue,
            )
        }
    }

    private fun openInternalLink(target: MarkdownTarget) {
        val path = target.path ?: return
        mutableState.value = mutableState.value.copy(resolvingLink = true, previewIssue = null)
        val digest = mutableState.value.preview?.sourceDigest
        linkWork = scope.launch {
            try {
                val kind = when (target.kind) {
                    MarkdownTargetKind.Catalog -> CatalogDocumentLinkKind.File
                    else -> CatalogDocumentLinkKind.Note
                }
                val result = store.resolveLink(nodeId, path, kind, generation)
                val after = mutableState.value
                if (after.preview?.sourceDigest != digest) return@launch
                mutableState.value = after.copy(resolvingLink = false)
                when (result.kind) {
                    CatalogDocumentLinkResponseKind.Found -> {
                        val item = result.item ?: return@launch
                        val anchor = target.anchor
                        if (item.nodeID == nodeId && anchor != null) {
                            jumpToAnchor(anchor)
                        } else {
                            onNavigate?.invoke(item, anchor)
                        }
                    }
                    CatalogDocumentLinkResponseKind.Missing ->
                        mutableState.value = mutableState.value.copy(previewIssue = PreviewIssue.LINK_MISSING)
                    CatalogDocumentLinkResponseKind.Ambiguous ->
                        mutableState.value = mutableState.value.copy(previewIssue = PreviewIssue.LINK_AMBIGUOUS)
                }
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (error.failureKind == FailureKind.REVOKED) {
                    close()
                    return@launch
                }
                mutableState.value = mutableState.value.copy(
                    resolvingLink = false,
                    previewIssue = PreviewIssue.LINK_FAILED,
                )
            }
        }
    }

    private suspend fun refresh() {
        val text = mutableState.value.text
        mutableState.value = mutableState.value.copy(previewLoading = true, previewIssue = null)
        try {
            val result = parse(text)
            val after = mutableState.value
            if (after.text != text || after.mode != Mode.PREVIEW) return
            if (after.preview?.sourceDigest != result.sourceDigest) clearInlineImages()
            mutableState.value = after.copy(preview = result, previewLoading = false)
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (_: Exception) {
            mutableState.value = mutableState.value.copy(
                previewLoading = false,
                previewIssue = PreviewIssue.UNPREVIEWABLE,
            )
        }
    }

    private fun clearInlineImages() {
        inlineImages.values.forEach(MarkdownImageModel::close)
        inlineImages.clear()
    }

    private fun invalidatePreview() {
        clearInlineImages()
        previewWork?.cancel()
        linkWork?.cancel()
        mutableState.value = mutableState.value.copy(
            preview = null,
            previewLoading = false,
            previewIssue = null,
            resolvingLink = false,
            anchorJump = null,
        )
    }

    public companion object {
        private const val STALE_SOURCE = "ERR_STALE_SOURCE"

        /** Text documents the editor opens: Markdown, plain text, anything `text/`. */
        public fun supports(name: String, mimeType: String?): Boolean {
            val suffix = name.substringAfterLast('.', "").lowercase()
            return suffix in setOf("md", "markdown", "txt") || mimeType?.startsWith("text/") == true
        }

        public fun isMarkdown(name: String, mimeType: String?): Boolean =
            name.substringAfterLast('.', "").lowercase() in setOf("md", "markdown") ||
                mimeType?.lowercase() == "text/markdown"
    }
}
