package com.chromvoid.air.ui.documents

import android.text.format.Formatter
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.OptIn
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.content.MediaType
import androidx.compose.foundation.content.TransferableContent
import androidx.compose.foundation.content.consume
import androidx.compose.foundation.content.contentReceiver
import androidx.compose.foundation.content.hasMediaType
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.input.TextFieldState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AddPhotoAlternate
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.common.util.UnstableApi
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.AirTopBar
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSegment
import com.chromvoid.air.ui.design.AirSegmentedControl
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DoneButton
import com.chromvoid.air.ui.design.LinkButton
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.PillText
import com.chromvoid.air.ui.design.PrimaryButton
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.files.FileDevice
import com.chromvoid.air.ui.files.FileSource
import com.chromvoid.air.ui.files.issueText
import com.chromvoid.air.ui.media.ImageGalleryScreen
import com.chromvoid.air.ui.media.MediaPreviewScreen
import com.chromvoid.air.ui.media.PdfPreviewScreen
import com.chromvoid.air.ui.root.CoversTabBar

public const val DOCUMENT_TAG: String = "document"
public const val DOCUMENT_CLOSE_TAG: String = "document-close"
public const val DOCUMENT_SAVE_TAG: String = "document-save"
public const val DOCUMENT_SAVED_TAG: String = "document-saved"
public const val DOCUMENT_SOURCE_TAG: String = "document-source"
public const val DOCUMENT_PREVIEW_MODE_TAG: String = "document-mode-preview"
public const val DOCUMENT_SOURCE_MODE_TAG: String = "document-mode-source"
public const val DOCUMENT_ISSUE_TAG: String = "document-issue"
public const val DOCUMENT_PREVIEW_ISSUE_TAG: String = "document-preview-issue"
public const val DOCUMENT_USE_DRAFT_TAG: String = "document-use-draft"
public const val DOCUMENT_USE_SAVED_TAG: String = "document-use-saved"
public const val DOCUMENT_KEEP_EDITING_TAG: String = "document-keep-editing"
public const val DOCUMENT_MY_DRAFT_TAG: String = "document-my-draft"
public const val DOCUMENT_SAVED_VERSION_TAG: String = "document-saved-version"
public const val DOCUMENT_DISCARD_TAG: String = "document-discard"
public const val DOCUMENT_INFO_TAG: String = "document-link-info"
public const val DOCUMENT_INSERT_IMAGE_TAG: String = "document-insert-image"
public const val DOCUMENT_IMAGE_PROGRESS_TAG: String = "document-image-progress"
public const val DOCUMENT_IMAGE_CANCEL_TAG: String = "document-image-cancel"

/**
 * A document and the documents its links lead to, as the iOS document sheet:
 * each page with Done or Back, its name, the lock and Save; Preview or Source
 * for Markdown; the conflict review when a save found the file changed. A
 * linked image, PDF or media opens its viewer over the stack. In a note's
 * source, Insert image imports photos from [device] into the attachment
 * folder and links them where the cursor was.
 */
@OptIn(UnstableApi::class)
@Composable
public fun DocumentScreen(
    navigator: DocumentNavigator,
    onClose: () -> Unit,
    onLock: () -> Unit,
    device: FileDevice? = null,
) {
    val stack by navigator.stack.collectAsStateWithLifecycle()
    val viewer by navigator.viewer.collectAsStateWithLifecycle()
    val top = stack.lastOrNull() ?: return
    CoversTabBar()
    val root = stack.size == 1
    val leave = { if (root) onClose() else navigator.pop() }
    Box(modifier = Modifier.fillMaxSize().testTag(DOCUMENT_TAG)) {
        DocumentPage(
            top,
            root,
            device,
            onDone = { if (top.requestClose()) leave() },
            onDiscard = leave,
            onLock = onLock,
        )
        when (val open = viewer) {
            is DocumentNavigator.Viewer.Images -> ImageGalleryScreen(open.model, onClose = navigator::closeViewer)
            is DocumentNavigator.Viewer.Pdf ->
                PdfPreviewScreen(open.model, onClose = navigator::closeViewer, onLock = onLock)
            is DocumentNavigator.Viewer.Media ->
                MediaPreviewScreen(open.model, onClose = navigator::closeViewer, onLock = onLock)
            is DocumentNavigator.Viewer.Information -> LinkInformation(open, onDone = navigator::closeViewer)
            null -> Unit
        }
    }
}

@Composable
private fun DocumentPage(
    model: DocumentModel,
    root: Boolean,
    device: FileDevice?,
    onDone: () -> Unit,
    onDiscard: () -> Unit,
    onLock: () -> Unit,
) {
    val state by model.state.collectAsStateWithLifecycle()
    val uri = LocalUriHandler.current
    val photos = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia()) { uris ->
        if (device != null) model.receiveImages(uris.map(device::source)) else model.imagePickerFailed()
    }
    LaunchedEffect(model) { model.load() }
    // Back is held while the document is busy, rather than falling through to the folder below.
    BackHandler { if (!state.busy) onDone() }
    val colors = Air.colors
    Column(modifier = Modifier.fillMaxSize().background(colors.canvas).imePadding()) {
        AirTopBar(
            title = state.name.ifEmpty { stringResource(R.string.doc_title) },
            leading = {
                DoneButton(
                    stringResource(if (root) R.string.files_done else R.string.detail_back),
                    onClick = onDone,
                    modifier = Modifier.testTag(DOCUMENT_CLOSE_TAG),
                )
            },
            actions = {
                PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock)
                // Insert image holds its place, as on iOS, so Save never moves when the mode changes.
                PillIcon(
                    Icons.Outlined.AddPhotoAlternate,
                    stringResource(R.string.doc_insert_image),
                    onClick = {
                        if (model.chooseImage()) {
                            photos.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                        }
                    },
                    enabled = device != null && state.canInsertImage && state.mode == DocumentModel.Mode.SOURCE,
                    modifier = Modifier.testTag(DOCUMENT_INSERT_IMAGE_TAG),
                )
                PillText(
                    stringResource(R.string.form_save),
                    onClick = model::save,
                    enabled = state.phase == DocumentModel.Phase.EDITING &&
                        !state.importingImage &&
                        !state.previewLoading,
                    emphasized = true,
                    modifier = Modifier.testTag(DOCUMENT_SAVE_TAG),
                )
            },
        )
        Column(
            modifier = Modifier.weight(1f).fillMaxWidth().padding(horizontal = 16.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            documentIssue(state)?.let { issue ->
                Text(
                    stringResource(issue),
                    style = AirType.subheadline,
                    color = colors.textSecondary,
                    modifier = Modifier.testTag(DOCUMENT_ISSUE_TAG),
                )
            }
            when {
                state.phase == DocumentModel.Phase.FAILED ->
                    LinkButton(stringResource(R.string.media_try_again), onClick = model::load)
                state.phase == DocumentModel.Phase.LOADING && state.name.isEmpty() -> Progress(R.string.doc_loading)
                else -> Body(model, state, device, onExternal = { uri.openUri(it) }, modifier = Modifier.weight(1f))
            }
        }
    }
    if (state.confirmingClose) {
        AlertDialog(
            onDismissRequest = model::cancelClose,
            title = { Text(stringResource(R.string.doc_discard_title)) },
            confirmButton = {
                TextButton(onClick = onDiscard, modifier = Modifier.testTag(DOCUMENT_DISCARD_TAG)) {
                    Text(stringResource(R.string.doc_discard), color = colors.danger)
                }
            },
            dismissButton = {
                TextButton(onClick = model::cancelClose) { Text(stringResource(R.string.files_keep_editing)) }
            },
        )
    }
}

@Composable
private fun Body(
    model: DocumentModel,
    state: DocumentModel.State,
    device: FileDevice?,
    onExternal: (String) -> Unit,
    modifier: Modifier,
) {
    val colors = Air.colors
    var savedVersion by rememberSaveable { mutableStateOf(false) }
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        if (state.phase == DocumentModel.Phase.CONFLICT) {
            Segments(
                listOf(
                    R.string.doc_my_draft to DOCUMENT_MY_DRAFT_TAG,
                    R.string.doc_saved_version to DOCUMENT_SAVED_VERSION_TAG,
                ),
                selected = if (savedVersion) 1 else 0,
                onSelect = { savedVersion = it == 1 },
            )
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.weight(1f)) {
                    if (state.markdown) {
                        Segments(
                            listOf(
                                R.string.doc_preview to DOCUMENT_PREVIEW_MODE_TAG,
                                R.string.doc_source to DOCUMENT_SOURCE_MODE_TAG,
                            ),
                            selected = if (state.mode == DocumentModel.Mode.PREVIEW) 0 else 1,
                            enabled = state.phase == DocumentModel.Phase.EDITING,
                            onSelect = { model.setMode(DocumentModel.Mode.entries[it]) },
                        )
                    } else {
                        Text(
                            stringResource(R.string.doc_text_source),
                            style = AirType.footnote,
                            color = colors.textSecondary,
                        )
                    }
                }
                when {
                    state.saved -> Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(start = 12.dp).testTag(DOCUMENT_SAVED_TAG),
                    ) {
                        Icon(
                            Icons.Rounded.Check,
                            contentDescription = null,
                            tint = colors.success,
                            modifier = Modifier.size(16.dp),
                        )
                        Text(stringResource(R.string.doc_saved), style = AirType.footnote, color = colors.textSecondary)
                    }
                    state.dirty -> Text(
                        stringResource(R.string.doc_unsaved),
                        style = AirType.footnote,
                        color = colors.textSecondary,
                        modifier = Modifier.padding(start = 12.dp),
                    )
                }
            }
        }
        state.previewIssue?.let { issue ->
            Text(
                stringResource(previewIssueText(issue)),
                style = AirType.footnote,
                color = colors.textSecondary,
                modifier = Modifier.testTag(DOCUMENT_PREVIEW_ISSUE_TAG),
            )
        }
        Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
            val preview = state.preview
            when {
                state.phase == DocumentModel.Phase.CONFLICT -> Text(
                    if (savedVersion) state.conflict?.text.orEmpty() else state.text,
                    style = AirType.body.copy(fontFamily = FontFamily.Monospace, color = colors.text),
                    modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()),
                )
                state.mode == DocumentModel.Mode.PREVIEW &&
                    (state.phase == DocumentModel.Phase.EDITING || state.phase == DocumentModel.Phase.SAVING) ->
                    if (preview != null) {
                        MarkdownPreview(model, preview, state.anchorJump, onExternal)
                    } else if (state.previewLoading) {
                        Progress(R.string.doc_preparing)
                    }
                else -> SourceEditor(model, state, device)
            }
        }
        when (state.phase) {
            DocumentModel.Phase.CONFLICT -> Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                PrimaryButton(
                    stringResource(R.string.doc_use_draft),
                    onClick = model::useMyDraft,
                    modifier = Modifier.testTag(DOCUMENT_USE_DRAFT_TAG),
                )
                LinkButton(
                    stringResource(R.string.doc_use_saved),
                    onClick = model::useSavedVersion,
                    modifier = Modifier.testTag(DOCUMENT_USE_SAVED_TAG),
                )
                LinkButton(
                    stringResource(R.string.files_keep_editing),
                    onClick = model::keepEditing,
                    modifier = Modifier.testTag(DOCUMENT_KEEP_EDITING_TAG),
                )
            }
            DocumentModel.Phase.UNCERTAIN -> LinkButton(
                stringResource(R.string.doc_compare),
                onClick = model::compareSavedVersion,
            )
            else -> Unit
        }
        if (state.importingImage) {
            Column(
                verticalArrangement = Arrangement.spacedBy(8.dp),
                modifier = Modifier.testTag(DOCUMENT_IMAGE_PROGRESS_TAG),
            ) {
                Text(
                    stringResource(R.string.doc_importing_images),
                    style = AirType.subheadline,
                    color = colors.textSecondary,
                )
                LinearProgressIndicator(
                    progress = { state.imageProgress },
                    color = colors.accent,
                    trackColor = colors.surfaceSecondary,
                    modifier = Modifier.fillMaxWidth(),
                )
                LinkButton(
                    stringResource(R.string.form_cancel),
                    onClick = model::cancelImageImport,
                    modifier = Modifier.testTag(DOCUMENT_IMAGE_CANCEL_TAG),
                )
            }
        }
        if (state.resolvingLink) Progress(R.string.doc_opening_link)
        if (state.busy && !state.importingImage) Progress(R.string.doc_wait)
    }
}

/**
 * The source, edited as plain text; changes reach the model as they are typed. Images pasted or
 * dropped into it are imported like picked ones and linked where the cursor is; text goes in as
 * text.
 */
@kotlin.OptIn(ExperimentalFoundationApi::class)
@Composable
private fun SourceEditor(model: DocumentModel, state: DocumentModel.State, device: FileDevice?) {
    val colors = Air.colors
    val field = remember(model) { TextFieldState(state.text, selection(state)) }
    // Text the model changed itself - a saved version taken, a task ticked,
    // images linked - replaces the field's, with the model's selection.
    LaunchedEffect(state.text) {
        if (field.text.toString() != state.text) {
            field.edit {
                replace(0, length, state.text)
                selection = selection(state)
            }
        }
    }
    LaunchedEffect(field) {
        snapshotFlow { field.text.toString() to field.selection }.collect { (text, range) ->
            model.setText(text)
            model.setSelection(range.min, range.max)
        }
    }
    BasicTextField(
        state = field,
        enabled = state.phase == DocumentModel.Phase.EDITING && !state.importingImage,
        textStyle = AirType.body.copy(color = colors.text),
        cursorBrush = SolidColor(colors.accent),
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
        modifier = Modifier
            .fillMaxSize()
            .clip(RoundedCornerShape(16.dp))
            .background(colors.card)
            .padding(16.dp)
            .testTag(DOCUMENT_SOURCE_TAG)
            .contentReceiver { content -> receiveImages(content, model, device) },
    )
}

/** Takes the images of pasted or dropped content for the note; the rest goes in as text. */
@kotlin.OptIn(ExperimentalFoundationApi::class)
private fun receiveImages(
    content: TransferableContent,
    model: DocumentModel,
    device: FileDevice?,
): TransferableContent? {
    if (device == null || !content.hasMediaType(MediaType.Image)) return content
    val images = mutableListOf<FileSource>()
    // Each is opened now: the grant to read what was pasted or dropped ends with the gesture.
    val rest = content.consume { item ->
        val image = item.uri?.let(device::openImageNow) ?: return@consume false
        images += image
        true
    }
    if (images.isNotEmpty()) model.receiveImages(images)
    return rest
}

private fun selection(state: DocumentModel.State): TextRange {
    val length = state.text.length
    return TextRange(state.selectionStart.coerceIn(0, length), state.selectionEnd.coerceIn(0, length))
}

@Composable
private fun Segments(
    labels: List<Pair<Int, String>>,
    selected: Int,
    onSelect: (Int) -> Unit,
    enabled: Boolean = true,
) {
    AirSegmentedControl(
        segments = labels.map { (label, tag) -> AirSegment(stringResource(label), tag) },
        selectedIndex = selected,
        onSelect = onSelect,
        enabled = enabled,
    )
}

@Composable
private fun Progress(label: Int) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        CircularProgressIndicator(color = Air.colors.accent, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        Text(stringResource(label), style = AirType.subheadline, color = Air.colors.textSecondary)
    }
}

/** A linked file with no viewer: what it is and where. */
@Composable
private fun LinkInformation(viewer: DocumentNavigator.Viewer.Information, onDone: () -> Unit) {
    BackHandler(onBack = onDone)
    val item = viewer.item
    val context = LocalContext.current
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Air.colors.canvas)
            .pointerInput(Unit) { detectTapGestures {} }
            .testTag(DOCUMENT_INFO_TAG),
    ) {
        AirScreen(
            title = stringResource(R.string.files_info),
            largeTitle = false,
            leading = { DoneButton(stringResource(R.string.files_done), onClick = onDone) },
        ) {
            item(key = "file") {
                AirSection(footer = stringResource(R.string.doc_no_preview)) {
                    AirRow(title = item.name)
                    RowDivider()
                    AirRow(title = stringResource(R.string.files_info_location), value = item.parentPath)
                    RowDivider()
                    AirRow(
                        title = stringResource(R.string.files_info_size),
                        value = Formatter.formatFileSize(context, item.size),
                    )
                }
            }
        }
    }
}

private fun documentIssue(state: DocumentModel.State): Int? = when (state.issue) {
    DocumentModel.Issue.TOO_LARGE -> R.string.doc_too_large
    DocumentModel.Issue.NOT_TEXT -> R.string.doc_not_text
    DocumentModel.Issue.UNCERTAIN -> R.string.doc_uncertain
    DocumentModel.Issue.CONFLICT -> R.string.doc_conflict
    DocumentModel.Issue.FAILED -> issueText(state.refusal ?: com.chromvoid.air.ui.files.FileIssue.OTHER)
    DocumentModel.Issue.IMAGE_UNREADABLE -> R.string.doc_image_unreadable
    DocumentModel.Issue.IMAGE_CANCELED -> R.string.doc_image_canceled
    DocumentModel.Issue.IMAGE_FAILED -> R.string.doc_image_failed
    null -> null
}

private fun previewIssueText(issue: DocumentModel.PreviewIssue): Int = when (issue) {
    DocumentModel.PreviewIssue.UNPREVIEWABLE -> R.string.doc_unpreviewable
    DocumentModel.PreviewIssue.TASK_FAILED -> R.string.doc_task_failed
    DocumentModel.PreviewIssue.LINK_MISSING -> R.string.doc_link_missing
    DocumentModel.PreviewIssue.LINK_AMBIGUOUS -> R.string.doc_link_ambiguous
    DocumentModel.PreviewIssue.LINK_FAILED -> R.string.doc_link_failed
    DocumentModel.PreviewIssue.NO_ANCHOR -> R.string.doc_no_anchor
}
