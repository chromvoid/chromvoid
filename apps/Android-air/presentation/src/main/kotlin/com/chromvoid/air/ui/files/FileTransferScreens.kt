package com.chromvoid.air.ui.files

import android.content.ActivityNotFoundException
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PhotoLibrary
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DoneButton
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.PillText
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.root.CoversTabBar

public const val IMPORT_CLOSE_TAG: String = "import-close"
public const val IMPORT_CHOOSE_FILES_TAG: String = "import-choose-files"
public const val IMPORT_CHOOSE_PHOTOS_TAG: String = "import-choose-photos"
public const val IMPORT_TAKE_PHOTO_TAG: String = "import-take-photo"
public const val IMPORT_CAMERA_ISSUE_TAG: String = "import-camera-issue"
public const val IMPORT_FINISHED_TAG: String = "import-finished"
public const val IMPORT_COUNT_TAG: String = "import-count"
public const val NOTE_NAME_TAG: String = "note-name"
public const val NOTE_TEXT_TAG: String = "note-text"
public const val NOTE_SAVE_TAG: String = "note-save"
public const val NOTE_CANCEL_TAG: String = "note-cancel"
public const val NOTE_ISSUE_TAG: String = "note-issue"
public const val NOTE_DISCARD_TAG: String = "note-discard"
public const val EXPORT_CLOSE_TAG: String = "export-close"
public const val EXPORT_CHOOSE_TAG: String = "export-choose"
public const val EXPORT_PICKER_ISSUE_TAG: String = "export-picker-issue"
public const val EXPORT_FINISHED_TAG: String = "export-finished"

public fun importItemTag(name: String): String = "import-item-$name"

public fun exportItemTag(name: String): String = "export-item-$name"

/**
 * Import, as the iOS import sheet: where the files go, the system document
 * picker or the photo picker, then each file with its progress and result.
 * Done becomes Stop while files are being written; Back does nothing then.
 */
@Composable
public fun FileImportScreen(
    model: FileImportModel,
    device: FileDevice?,
    onClose: () -> Unit,
    onLock: () -> Unit,
    /** Whether another batch may be chosen once this one settled; not for files another app shared. */
    offersMore: Boolean = true,
) {
    CoversTabBar()
    val state by model.state.collectAsStateWithLifecycle()
    BackHandler { if (!state.busy) onClose() }
    val documents = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
        if (device != null) model.receive(uris.map(device::source))
    }
    val photos = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia()) { uris ->
        if (device != null) model.receive(uris.map(device::source))
    }
    val launch = { start: () -> Unit ->
        try {
            start()
        } catch (_: ActivityNotFoundException) {
            model.pickerFailed()
        }
    }
    val chooseFiles = { launch { documents.launch(arrayOf("*/*")) } }
    val choosePhotos = {
        launch { photos.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageAndVideo)) }
    }
    val takePhoto = model::takePhoto.takeIf { model.canTakePhoto && !state.capturing }
    val closeLabel = stringResource(if (state.busy) R.string.files_stop else R.string.files_done)
    AirScreen(
        title = stringResource(R.string.files_import),
        largeTitle = false,
        leading = {
            DoneButton(
                closeLabel,
                onClick = if (state.busy) model::stop else onClose,
                modifier = Modifier.testTag(IMPORT_CLOSE_TAG),
            )
        },
        actions = { PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock) },
    ) {
        if (state.phase == FileImportModel.Phase.CHOOSING) {
            item(key = "intro") {
                AirSection {
                    Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(stringResource(R.string.files_import_text), style = AirType.body, color = Air.colors.text)
                        Text(
                            stringResource(R.string.files_import_note),
                            style = AirType.subheadline,
                            color = Air.colors.textSecondary,
                        )
                        if (state.pickerFailed) {
                            Text(
                                stringResource(R.string.files_picker_failed),
                                style = AirType.footnote,
                                color = Air.colors.danger,
                            )
                        }
                        state.cameraIssue?.let { issue ->
                            Text(
                                stringResource(
                                    when (issue) {
                                        FileImportModel.CameraIssue.DENIED -> R.string.files_camera_denied
                                        FileImportModel.CameraIssue.UNAVAILABLE -> R.string.files_camera_unavailable
                                    },
                                ),
                                style = AirType.footnote,
                                color = Air.colors.danger,
                                modifier = Modifier.testTag(IMPORT_CAMERA_ISSUE_TAG),
                            )
                        }
                    }
                    RowDivider()
                    Sources(onFiles = chooseFiles, onPhotos = choosePhotos, onCamera = takePhoto)
                }
            }
        }
        item(key = "location") {
            AirSection(header = stringResource(R.string.files_info_location)) { AirRow(title = model.destination) }
        }
        if (state.items.isNotEmpty()) {
            item(key = "summary") {
                AirSection {
                    when (state.phase) {
                        FileImportModel.Phase.FINISHED -> AirRow(
                            title = stringResource(R.string.files_import_finished),
                            icon = Icons.Rounded.CheckCircle,
                            iconTint = Air.colors.success,
                            modifier = Modifier.testTag(IMPORT_FINISHED_TAG),
                        )
                        FileImportModel.Phase.STOPPING -> Progress(stringResource(R.string.files_import_stopping))
                        else -> Unit
                    }
                    val settled = state.phase == FileImportModel.Phase.FINISHED
                    if (settled || state.phase == FileImportModel.Phase.STOPPING) RowDivider()
                    AirRow(
                        title = stringResource(R.string.files_imported),
                        value = "${state.imported} / ${state.items.size}",
                        modifier = Modifier.testTag(IMPORT_COUNT_TAG),
                    )
                    if (settled && offersMore) {
                        RowDivider()
                        Sources(onFiles = chooseFiles, onPhotos = choosePhotos, onCamera = takePhoto)
                    }
                }
            }
            item(key = "items") {
                AirSection {
                    state.items.forEachIndexed { index, item ->
                        if (index > 0) RowDivider()
                        ImportRow(item, state.busy)
                    }
                }
            }
        }
    }
}

/** Where files come from; Take Photo only where the device has a camera, as on iOS. */
@Composable
private fun Sources(onFiles: () -> Unit, onPhotos: () -> Unit, onCamera: (() -> Unit)?) {
    ActionRow(
        stringResource(R.string.files_choose_files),
        onClick = onFiles,
        icon = Icons.Outlined.Folder,
        modifier = Modifier.testTag(IMPORT_CHOOSE_FILES_TAG),
    )
    RowDivider(inset = 58.dp)
    ActionRow(
        stringResource(R.string.files_photo_library),
        onClick = onPhotos,
        icon = Icons.Outlined.PhotoLibrary,
        modifier = Modifier.testTag(IMPORT_CHOOSE_PHOTOS_TAG),
    )
    if (onCamera != null) {
        RowDivider(inset = 58.dp)
        ActionRow(
            stringResource(R.string.files_take_photo),
            onClick = onCamera,
            icon = Icons.Outlined.PhotoCamera,
            modifier = Modifier.testTag(IMPORT_TAKE_PHOTO_TAG),
        )
    }
}

@Composable
private fun ImportRow(item: FileImportModel.Item, busy: Boolean) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 12.dp)
            .testTag(importItemTag(item.name)),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(item.name, style = AirType.body, color = Air.colors.text)
        when (val outcome = item.outcome) {
            FileImportModel.Outcome.Pending ->
                Note(stringResource(if (busy) R.string.files_waiting else R.string.files_not_imported))
            FileImportModel.Outcome.Transferring -> {
                if (item.total > 0) {
                    LinearProgressIndicator(
                        progress = { item.received.toFloat() / item.total },
                        color = Air.colors.accent,
                        modifier = Modifier.fillMaxWidth(),
                    )
                } else {
                    LinearProgressIndicator(color = Air.colors.accent, modifier = Modifier.fillMaxWidth())
                }
                Note(stringResource(R.string.files_importing))
            }
            FileImportModel.Outcome.Imported -> Note(stringResource(R.string.files_imported), Air.colors.success)
            is FileImportModel.Outcome.Failed -> Note(stringResource(issueText(outcome.issue)), Air.colors.danger)
            FileImportModel.Outcome.Interrupted -> Note(stringResource(R.string.files_import_interrupted))
        }
    }
}

/**
 * A new note, as the iOS note form: the name with where it is saved, then the
 * text. Cancel on a draft with anything in it asks first; a save whose outcome
 * is unknown leaves only Close.
 */
@Composable
public fun NoteScreen(model: NoteCreationModel, onDismiss: () -> Unit, onDiscard: () -> Unit, onLock: () -> Unit) {
    CoversTabBar()
    val state by model.state.collectAsStateWithLifecycle()
    BackHandler(onBack = onDismiss)
    val focus = remember { FocusRequester() }
    LaunchedEffect(state.attempts) { focus.requestFocus() }
    val colors = Air.colors
    val editing = state.phase == NoteCreationModel.Phase.EDITING
    Box(modifier = Modifier.fillMaxSize().background(colors.canvas).pointerInput(Unit) { detectTapGestures {} }) {
        AirScreen(
            title = stringResource(R.string.files_new_note),
            largeTitle = false,
            leading = {
                val uncertain = state.phase == NoteCreationModel.Phase.UNCERTAIN
                DoneButton(
                    stringResource(if (uncertain) R.string.files_close else R.string.form_keep_cancel),
                    onClick = if (uncertain) onDiscard else onDismiss,
                    modifier = Modifier.testTag(NOTE_CANCEL_TAG),
                )
            },
            actions = {
                PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock)
                PillText(
                    stringResource(R.string.form_save),
                    onClick = model::save,
                    enabled = editing,
                    emphasized = true,
                    modifier = Modifier.testTag(NOTE_SAVE_TAG),
                )
            },
        ) {
            item(key = "name") {
                AirSection(
                    header = stringResource(R.string.files_info_name),
                    footer = stringResource(R.string.files_note_hint),
                ) {
                    Field(
                        value = state.name,
                        placeholder = stringResource(R.string.files_note_name),
                        onChange = model::setName,
                        enabled = editing,
                        modifier = Modifier.focusRequester(focus).testTag(NOTE_NAME_TAG),
                    )
                    val issue = state.issue?.let { noteIssueText(it) } ?: state.refusal?.let {
                        if (it == FileIssue.DENIED) R.string.files_note_denied else issueText(it)
                    }
                    if (issue != null || state.phase == NoteCreationModel.Phase.UNCERTAIN) {
                        RowDivider()
                        Text(
                            stringResource(issue ?: R.string.files_note_uncertain),
                            style = AirType.footnote,
                            color = colors.danger,
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp).testTag(NOTE_ISSUE_TAG),
                        )
                    }
                    RowDivider()
                    AirRow(title = model.parent, titleColor = colors.textSecondary)
                }
            }
            item(key = "text") {
                AirSection(header = stringResource(R.string.files_note_text_header)) {
                    Field(
                        value = state.text,
                        placeholder = stringResource(R.string.files_note_text),
                        onChange = model::setText,
                        enabled = editing,
                        singleLine = false,
                        modifier = Modifier.heightIn(min = 220.dp).testTag(NOTE_TEXT_TAG),
                    )
                }
            }
            if (state.phase == NoteCreationModel.Phase.SAVING) {
                item(key = "saving") { Progress(stringResource(R.string.files_saving)) }
            }
        }
        if (state.confirmingDiscard) {
            AlertDialog(
                onDismissRequest = model::cancelDiscard,
                title = { Text(stringResource(R.string.files_discard_title)) },
                text = { Text(stringResource(R.string.files_discard_text)) },
                confirmButton = {
                    TextButton(onClick = onDiscard, modifier = Modifier.testTag(NOTE_DISCARD_TAG)) {
                        Text(stringResource(R.string.files_discard), color = colors.danger)
                    }
                },
                dismissButton = {
                    TextButton(onClick = model::cancelDiscard) { Text(stringResource(R.string.files_keep_editing)) }
                },
            )
        }
    }
}

/** A text field inside a section row, as the iOS form field. */
@Composable
private fun Field(
    value: String,
    placeholder: String,
    onChange: (String) -> Unit,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    singleLine: Boolean = true,
) {
    Box(modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 20.dp, vertical = 16.dp)) {
        if (value.isEmpty()) Text(placeholder, style = AirType.body, color = Air.colors.textSecondary)
        BasicTextField(
            value = value,
            onValueChange = onChange,
            enabled = enabled,
            singleLine = singleLine,
            textStyle = AirType.body.copy(color = Air.colors.text),
            cursorBrush = SolidColor(Air.colors.accent),
            keyboardOptions = KeyboardOptions(
                capitalization = if (singleLine) KeyboardCapitalization.None else KeyboardCapitalization.Sentences,
                autoCorrectEnabled = !singleLine,
            ),
            modifier = modifier.fillMaxWidth(),
        )
    }
}

private fun noteIssueText(issue: NoteCreationModel.Issue): Int = when (issue) {
    NoteCreationModel.Issue.EMPTY_NAME -> R.string.files_issue_empty_name
    NoteCreationModel.Issue.DOT_NAME -> R.string.files_note_dot
    NoteCreationModel.Issue.TOO_LARGE -> R.string.files_note_too_large
}

/**
 * Export, as the iOS export sheet: a copy outside the vault is named for what
 * it is, the files are listed, and Choose destination opens the system save
 * picker for one file or the folder picker for several.
 */
@Composable
public fun FileExportScreen(model: FileExportModel, device: FileDevice?, onClose: () -> Unit, onLock: () -> Unit) {
    CoversTabBar()
    val state by model.state.collectAsStateWithLifecycle()
    val running = state.phase == FileExportModel.Phase.RUNNING
    val finished = state.phase == FileExportModel.Phase.FINISHED
    BackHandler { if (!running) onClose() }
    val single = model.single
    val save = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument(single?.mimeType ?: "application/octet-stream"),
    ) { document ->
        if (document != null && device != null) model.exportTo { device.destination(document) }
    }
    val folder = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { tree ->
        if (tree != null && device != null) model.exportTo { device.destination(tree, it.name, it.mimeType) }
    }
    val chooseDestination = {
        if (model.beginDestinationChoice()) {
            try {
                if (model.intoFolder) folder.launch(null) else save.launch(single?.name.orEmpty())
            } catch (_: ActivityNotFoundException) {
                model.pickerFailed(FileExportModel.PickerIssue.UNAVAILABLE)
            } catch (_: RuntimeException) {
                model.pickerFailed(FileExportModel.PickerIssue.NOT_OPENED)
            }
        }
    }
    AirScreen(
        title = stringResource(if (model.gallery) R.string.files_save_gallery else R.string.files_export_title),
        largeTitle = false,
        leading = {
            DoneButton(
                stringResource(if (finished) R.string.files_done else R.string.form_keep_cancel),
                onClick = onClose,
                modifier = Modifier.testTag(EXPORT_CLOSE_TAG),
            )
        },
        actions = { PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock) },
    ) {
        if (state.phase != FileExportModel.Phase.FINISHED) {
            item(key = "intro") {
                AirSection {
                    Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(
                            stringResource(
                                if (model.gallery) R.string.files_gallery_text else R.string.files_export_text,
                            ),
                            style = AirType.headline,
                            color = Air.colors.text,
                        )
                        Text(
                            stringResource(R.string.files_export_note),
                            style = AirType.subheadline,
                            color = Air.colors.textSecondary,
                        )
                    }
                }
            }
        }
        item(key = "items") {
            AirSection {
                state.items.forEachIndexed { index, item ->
                    if (index > 0) RowDivider()
                    ExportRow(item)
                }
            }
        }
        item(key = "action") {
            AirSection {
                state.pickerIssue?.let { issue ->
                    Text(
                        stringResource(
                            when (issue) {
                                FileExportModel.PickerIssue.UNAVAILABLE -> R.string.files_export_picker_unavailable
                                FileExportModel.PickerIssue.NOT_OPENED -> R.string.files_export_picker_not_opened
                            },
                        ),
                        style = AirType.subheadline,
                        color = Air.colors.danger,
                        modifier = Modifier
                            .padding(20.dp)
                            .testTag(EXPORT_PICKER_ISSUE_TAG)
                            .semantics { liveRegion = LiveRegionMode.Polite },
                    )
                    RowDivider()
                }
                when (state.phase) {
                    FileExportModel.Phase.REVIEW -> ActionRow(
                        stringResource(
                            if (state.pickerIssue == null) R.string.files_choose_destination
                            else R.string.files_export_retry,
                        ),
                        onClick = chooseDestination,
                        enabled = model.canExport && device != null,
                        modifier = Modifier.testTag(EXPORT_CHOOSE_TAG),
                    )
                    FileExportModel.Phase.RUNNING -> Progress(stringResource(R.string.files_exporting))
                    FileExportModel.Phase.FINISHED -> AirRow(
                        title = stringResource(
                            if (model.gallery) R.string.files_gallery_saved else R.string.files_export_finished,
                        ),
                        value = "${state.exported} / ${state.files}",
                        icon = Icons.Rounded.CheckCircle,
                        iconTint = Air.colors.success,
                        modifier = Modifier.testTag(EXPORT_FINISHED_TAG),
                    )
                    FileExportModel.Phase.REVOKED -> Unit
                }
            }
        }
    }
}

@Composable
private fun ExportRow(item: FileExportModel.Item) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 12.dp)
            .testTag(exportItemTag(item.source.name)),
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(item.source.name, style = AirType.body, color = Air.colors.text)
        when (val outcome = item.outcome) {
            FileExportModel.Outcome.Pending -> Unit
            FileExportModel.Outcome.Skipped -> Note(stringResource(R.string.files_export_skipped))
            FileExportModel.Outcome.Exporting -> {
                LinearProgressIndicator(
                    progress = { if (item.total > 0) item.received.toFloat() / item.total else 0f },
                    color = Air.colors.accent,
                    modifier = Modifier.fillMaxWidth(),
                )
                Note(stringResource(R.string.files_exporting))
            }
            FileExportModel.Outcome.Exported -> Note(stringResource(R.string.files_exported), Air.colors.success)
            is FileExportModel.Outcome.Failed -> Note(
                stringResource(R.string.files_export_failed) + " · " + stringResource(issueText(outcome.issue)),
                Air.colors.danger,
            )
        }
    }
}

@Composable
private fun Progress(text: String) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(20.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(color = Air.colors.accent, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        Text(text, style = AirType.body, color = Air.colors.text)
    }
}

@Composable
private fun Note(text: String, color: Color = Air.colors.textSecondary) {
    Text(text, style = AirType.footnote, color = color)
}
