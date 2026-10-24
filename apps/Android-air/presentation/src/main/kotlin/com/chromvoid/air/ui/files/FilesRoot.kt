package com.chromvoid.air.ui.files

import android.text.format.Formatter
import android.content.ActivityNotFoundException
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.bridge.wire.CatalogListItem
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DoneButton
import com.chromvoid.air.ui.design.PillText
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.documents.DocumentScreen
import com.chromvoid.air.ui.root.CoversTabBar
import com.chromvoid.air.ui.media.ImageGalleryScreen
import com.chromvoid.air.ui.media.MediaPreviewScreen
import com.chromvoid.air.ui.media.PdfPreviewScreen

public const val FILE_NAME_TAG: String = "file-name"
public const val FILE_NAME_SAVE_TAG: String = "file-name-save"
public const val FILE_NAME_CANCEL_TAG: String = "file-name-cancel"
public const val FILE_NAME_ISSUE_TAG: String = "file-name-issue"
public const val FILE_DELETE_CONFIRM_TAG: String = "file-delete-confirm"
public const val FILE_INFO_TAG: String = "file-info"
public const val FILE_INFO_DONE_TAG: String = "file-info-done"
public const val FILE_ISSUE_TAG: String = "file-issue"

/**
 * The Files root's own stack: the folders opened from the root, a batch move
 * or delete in place of them, and the dialogs over the folder on screen.
 * Navigation follows the scope's state, so a lock that closes the scope also
 * closes whatever was open; each folder keeps its scroll while a deeper one is
 * shown.
 */
@Composable
public fun FilesRoot(files: FilesScope, modifier: Modifier = Modifier, onLock: () -> Unit = {}) {
    val holder = rememberSaveableStateHolder()
    val levels by files.levels.collectAsStateWithLifecycle()
    val operation by files.operation.collectAsStateWithLifecycle()
    val edit by files.edit.collectAsStateWithLifecycle()
    val info by files.info.collectAsStateWithLifecycle()
    val deleting by files.deleting.collectAsStateWithLifecycle()
    val issue by files.issue.collectAsStateWithLifecycle()
    val importing by files.importing.collectAsStateWithLifecycle()
    val note by files.note.collectAsStateWithLifecycle()
    val export by files.export.collectAsStateWithLifecycle()
    val outgoing by files.outgoing.collectAsStateWithLifecycle()
    val gallery by files.gallery.collectAsStateWithLifecycle()
    val pdf by files.pdf.collectAsStateWithLifecycle()
    val media by files.media.collectAsStateWithLifecycle()
    val document by files.document.collectAsStateWithLifecycle()
    // Started for a result, so the app counts the share sheet or the viewer as
    // its own step, as it counts a system picker, not as leaving.
    val elsewhere = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {}
    LaunchedEffect(outgoing) {
        val intent = outgoing ?: return@LaunchedEffect
        val started = try {
            elsewhere.launch(intent)
            true
        } catch (_: ActivityNotFoundException) {
            false
        }
        files.outgoingHandled(started)
    }
    Box(modifier = modifier) {
        val running = operation
        val incoming = importing
        val drafting = note
        val exporting = export
        val viewing = gallery
        val reading = pdf
        val playing = media
        val editing = document
        if (running != null) {
            FileOperationScreen(running, onClose = files::closeOperation, onLock = onLock)
        } else if (incoming != null) {
            FileImportScreen(incoming, files.device, onClose = files::closeImport, onLock = onLock)
        } else if (drafting != null) {
            NoteScreen(drafting, onDismiss = files::dismissNote, onDiscard = files::discardNote, onLock = onLock)
        } else if (exporting != null) {
            FileExportScreen(exporting, files.device, onClose = files::closeExport, onLock = onLock)
        } else if (viewing != null) {
            ImageGalleryScreen(viewing, onClose = files::closeGallery)
        } else if (reading != null) {
            PdfPreviewScreen(reading, onClose = files::closePdf, onLock = onLock)
        } else if (playing != null) {
            MediaPreviewScreen(playing, onClose = files::closeMedia, onLock = onLock)
        } else if (editing != null) {
            DocumentScreen(editing, onClose = files::closeDocument, onLock = onLock, device = files.device)
        } else {
            val top = levels.last()
            val topState by top.state.collectAsStateWithLifecycle()
            // Back ends a selection first, then leaves the folder.
            BackHandler(enabled = topState.selection != null, onBack = top::endSelection)
            BackHandler(enabled = topState.selection == null && levels.size > 1, onBack = files::closeFolder)
            holder.SaveableStateProvider(FOLDER_STATE_KEY + top.path) {
                FolderScreen(
                    files,
                    top,
                    onUp = if (levels.size > 1) files::closeFolder else null,
                    onLock = onLock,
                )
            }
        }
        edit?.let { NameSheet(it, onName = files::setName, onSave = files::saveName, onCancel = files::cancelEdit) }
        deleting?.let { DeleteDialog(files, it) }
        info?.let { InfoSheet(it, onDone = files::closeInfo) }
        issue?.let { current ->
            AlertDialog(
                onDismissRequest = files::dismissIssue,
                text = { Text(stringResource(issueText(current)), modifier = Modifier.testTag(FILE_ISSUE_TAG)) },
                confirmButton = {
                    TextButton(onClick = files::dismissIssue) { Text(stringResource(R.string.action_ok)) }
                },
            )
        }
    }
}

/**
 * The name of a new folder or of a renamed item, as the iOS name sheet: Cancel
 * and Save in the bar, one field, and the reason under it when Core refused.
 */
@Composable
internal fun NameSheet(
    edit: FilesScope.NameEdit,
    onName: (String) -> Unit,
    onSave: () -> Unit,
    onCancel: () -> Unit,
) {
    CoversTabBar()
    BackHandler(onBack = onCancel)
    val focus = remember { FocusRequester() }
    LaunchedEffect(edit.attempts) { focus.requestFocus() }
    val colors = Air.colors
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.canvas)
            .pointerInput(Unit) { detectTapGestures {} },
    ) {
        AirScreen(
            title = stringResource(if (edit.item == null) R.string.files_new_folder else R.string.files_rename),
            largeTitle = false,
            leading = {
                DoneButton(
                    stringResource(R.string.form_keep_cancel),
                    onClick = onCancel,
                    modifier = Modifier.testTag(FILE_NAME_CANCEL_TAG),
                )
            },
            actions = {
                PillText(
                    stringResource(R.string.form_save),
                    onClick = onSave,
                    enabled = !edit.saving,
                    emphasized = true,
                    modifier = Modifier.testTag(FILE_NAME_SAVE_TAG),
                )
            },
        ) {
            item(key = "name") {
                AirSection {
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 56.dp)
                            .padding(horizontal = 20.dp, vertical = 16.dp),
                    ) {
                        if (edit.name.isEmpty()) {
                            Text(
                                stringResource(R.string.files_info_name),
                                style = AirType.body,
                                color = colors.textSecondary,
                            )
                        }
                        BasicTextField(
                            value = edit.name,
                            onValueChange = onName,
                            enabled = !edit.saving,
                            singleLine = true,
                            textStyle = AirType.body.copy(color = colors.text),
                            cursorBrush = SolidColor(colors.accent),
                            keyboardOptions = KeyboardOptions(
                                capitalization = KeyboardCapitalization.None,
                                autoCorrectEnabled = false,
                                imeAction = ImeAction.Done,
                            ),
                            keyboardActions = KeyboardActions(onDone = { onSave() }),
                            modifier = Modifier.fillMaxWidth().focusRequester(focus).testTag(FILE_NAME_TAG),
                        )
                    }
                    edit.issue?.let { issue ->
                        RowDivider()
                        Text(
                            stringResource(issueText(issue)),
                            style = AirType.footnote,
                            color = colors.danger,
                            modifier = Modifier
                                .padding(horizontal = 20.dp, vertical = 12.dp)
                                .testTag(FILE_NAME_ISSUE_TAG),
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DeleteDialog(files: FilesScope, item: CatalogListItem) {
    AlertDialog(
        onDismissRequest = files::cancelDelete,
        title = { Text(stringResource(R.string.files_delete_title)) },
        text = {
            Text(
                item.name + "\n\n" + stringResource(
                    if (item.isDir) R.string.files_delete_folder_text else R.string.files_delete_file_text,
                ),
            )
        },
        confirmButton = {
            TextButton(onClick = files::confirmDelete, modifier = Modifier.testTag(FILE_DELETE_CONFIRM_TAG)) {
                Text(stringResource(R.string.files_delete), color = Air.colors.danger)
            }
        },
        dismissButton = {
            TextButton(onClick = files::cancelDelete) { Text(stringResource(R.string.form_keep_cancel)) }
        },
    )
}

/** A file's name, where it is, its size and type, over the folder it was opened from. */
@Composable
private fun InfoSheet(info: FilesScope.FileInfo, onDone: () -> Unit) {
    CoversTabBar()
    BackHandler(onBack = onDone)
    val context = LocalContext.current
    val metadata = info.metadata
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Air.colors.canvas)
            .pointerInput(Unit) { detectTapGestures {} }
            .testTag(FILE_INFO_TAG),
    ) {
        AirScreen(
            title = stringResource(R.string.files_info),
            largeTitle = false,
            leading = {
                DoneButton(
                    stringResource(R.string.files_done),
                    onClick = onDone,
                    modifier = Modifier.testTag(FILE_INFO_DONE_TAG),
                )
            },
        ) {
            item(key = "name") {
                AirSection(header = stringResource(R.string.files_info_name)) { AirRow(title = metadata.name) }
            }
            item(key = "location") {
                AirSection(header = stringResource(R.string.files_info_location)) { AirRow(title = info.location) }
            }
            item(key = "size") {
                AirSection(header = stringResource(R.string.files_info_size)) {
                    AirRow(title = Formatter.formatFileSize(context, metadata.size))
                }
            }
            metadata.mimeType?.let { type ->
                item(key = "type") {
                    AirSection(header = stringResource(R.string.files_info_type)) { AirRow(title = type) }
                }
            }
        }
    }
}

private const val FOLDER_STATE_KEY = "folder:"
