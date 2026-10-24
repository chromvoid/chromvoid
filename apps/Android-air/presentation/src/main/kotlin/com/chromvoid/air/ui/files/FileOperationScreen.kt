package com.chromvoid.air.ui.files

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Folder
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
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
import com.chromvoid.air.ui.design.StatusBlock
import com.chromvoid.air.ui.root.CoversTabBar

public const val OPERATION_CLOSE_TAG: String = "operation-close"
public const val OPERATION_CONFIRM_DELETE_TAG: String = "operation-confirm-delete"
public const val OPERATION_MOVE_HERE_TAG: String = "operation-move-here"
public const val OPERATION_UP_TAG: String = "operation-up"
public const val OPERATION_FINISHED_TAG: String = "operation-finished"
public const val OPERATION_COUNT_TAG: String = "operation-count"
public const val OPERATION_ISSUE_TAG: String = "operation-issue"

public fun operationFolderTag(name: String): String = "operation-folder-$name"

/**
 * A batch move or delete, as the iOS sheet runs it: a move browses to its
 * destination first, a delete asks once; then every item shows its own result,
 * and Stop keeps what is done. Back does nothing while items are being changed.
 */
@Composable
public fun FileOperationScreen(model: FileOperationModel, onClose: () -> Unit, onLock: () -> Unit) {
    CoversTabBar()
    val state by model.state.collectAsStateWithLifecycle()
    val folders by model.folders.collectAsStateWithLifecycle()
    val browsing = model.kind == FileOperationModel.Kind.MOVE && state.phase == FileOperationModel.Phase.REVIEWING
    BackHandler {
        when {
            state.busy -> Unit
            browsing && folders.size > 1 -> model.closeFolder()
            else -> onClose()
        }
    }
    val folder = folders.lastOrNull()
    if (browsing && folder != null) {
        Destination(model, state, folder, folders.size > 1, onClose, onLock)
    } else {
        Progress(model, state, onClose, onLock)
    }
}

@Composable
private fun Destination(
    model: FileOperationModel,
    state: FileOperationModel.State,
    folder: FolderModel,
    nested: Boolean,
    onClose: () -> Unit,
    onLock: () -> Unit,
) {
    val listing by folder.state.collectAsStateWithLifecycle()
    AirScreen(
        title = if (nested) folder.name else stringResource(R.string.files_move_title),
        largeTitle = false,
        onBack = if (nested) model::closeFolder else null,
        backTag = OPERATION_UP_TAG,
        backDescription = stringResource(R.string.detail_back),
        leading = if (nested) {
            null
        } else {
            { DoneButton(stringResource(R.string.form_keep_cancel), onClose, Modifier.testTag(OPERATION_CLOSE_TAG)) }
        },
        actions = {
            PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock)
            PillText(
                stringResource(R.string.files_move_here),
                onClick = model::start,
                emphasized = true,
                modifier = Modifier.testTag(OPERATION_MOVE_HERE_TAG),
            )
        },
    ) {
        item(key = "summary") {
            AirSection {
                AirRow(title = stringResource(R.string.files_selected), value = state.items.size.toString())
                RowDivider()
                AirRow(title = folder.path, subtitle = stringResource(R.string.files_destination_hint))
                state.issue?.let { issue ->
                    RowDivider()
                    Text(
                        stringResource(
                            if (issue == FileOperationModel.ReviewIssue.SAME_FOLDER) {
                                R.string.files_same_folder
                            } else {
                                R.string.files_wait_folder
                            },
                        ),
                        style = AirType.footnote,
                        color = Air.colors.danger,
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp).testTag(OPERATION_ISSUE_TAG),
                    )
                }
            }
        }
        when {
            listing.issue != null -> item(key = "issue") {
                StatusBlock(
                    title = stringResource(
                        folderIssueText(listing.issue),
                    ),
                    action = stringResource(R.string.files_refresh),
                    onAction = folder::reload,
                )
            }
            listing.status == FolderModel.Status.LOADING && listing.items.isEmpty() -> item(key = "loading") {
                Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Air.colors.accent)
                }
            }
            else -> item(key = "folders") {
                val destinations = model.destinations(listing.items)
                AirSection(header = stringResource(R.string.files_folders)) {
                    if (destinations.isEmpty() && !listing.canLoadMore) {
                        AirRow(title = stringResource(R.string.files_no_nested), titleColor = Air.colors.textSecondary)
                    }
                    destinations.forEachIndexed { index, item ->
                        if (index > 0) RowDivider(inset = 58.dp)
                        AirRow(
                            title = item.name,
                            icon = Icons.Outlined.Folder,
                            chevron = true,
                            onClick = { model.openFolder(item) },
                            modifier = Modifier.testTag(operationFolderTag(item.name)),
                        )
                    }
                    if (listing.canLoadMore) {
                        RowDivider()
                        ActionRow(
                            stringResource(R.string.files_load_more),
                            onClick = folder::loadMore,
                            enabled = !listing.loadingMore,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun Progress(
    model: FileOperationModel,
    state: FileOperationModel.State,
    onClose: () -> Unit,
    onLock: () -> Unit,
) {
    val moving = model.kind == FileOperationModel.Kind.MOVE
    AirScreen(
        title = stringResource(if (moving) R.string.files_move_title else R.string.files_delete_items_title),
        largeTitle = false,
        leading = {
            when {
                state.busy -> DoneButton(
                    stringResource(R.string.files_stop),
                    onClick = model::stop,
                    modifier = Modifier.testTag(OPERATION_CLOSE_TAG),
                )
                else -> DoneButton(
                    stringResource(
                        if (state.phase == FileOperationModel.Phase.REVIEWING) {
                            R.string.form_keep_cancel
                        } else {
                            R.string.files_done
                        },
                    ),
                    onClick = onClose,
                    modifier = Modifier.testTag(OPERATION_CLOSE_TAG),
                )
            }
        },
        actions = { PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock) },
    ) {
        item(key = "status") {
            AirSection {
                if (state.phase == FileOperationModel.Phase.REVIEWING) {
                    Text(
                        stringResource(R.string.files_delete_items_text),
                        style = AirType.body,
                        color = Air.colors.text,
                        modifier = Modifier.padding(20.dp),
                    )
                    RowDivider()
                    ActionRow(
                        stringResource(R.string.files_delete),
                        onClick = model::start,
                        destructive = true,
                        modifier = Modifier.testTag(OPERATION_CONFIRM_DELETE_TAG),
                    )
                } else {
                    if (state.phase == FileOperationModel.Phase.FINISHED) {
                        AirRow(
                            title = stringResource(R.string.files_operation_finished),
                            icon = Icons.Rounded.CheckCircle,
                            iconTint = Air.colors.success,
                            modifier = Modifier.testTag(OPERATION_FINISHED_TAG),
                        )
                    } else {
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(20.dp),
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            CircularProgressIndicator(
                                color = Air.colors.accent,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(20.dp),
                            )
                            Text(
                                stringResource(
                                    if (state.phase == FileOperationModel.Phase.STOPPING) {
                                        R.string.files_stopping
                                    } else {
                                        R.string.files_saving
                                    },
                                ),
                                style = AirType.body,
                                color = Air.colors.text,
                            )
                        }
                    }
                    RowDivider()
                    AirRow(
                        title = stringResource(if (moving) R.string.files_moved else R.string.files_deleted),
                        value = "${state.completed} / ${state.items.size}",
                        modifier = Modifier.testTag(OPERATION_COUNT_TAG),
                    )
                    state.destination?.let { destination ->
                        RowDivider()
                        AirRow(title = destination)
                    }
                }
            }
        }
        if (state.phase != FileOperationModel.Phase.REVIEWING) {
            item(key = "keeps") {
                Text(
                    stringResource(R.string.files_stop_keeps),
                    style = AirType.footnote,
                    color = Air.colors.textSecondary,
                    modifier = Modifier.padding(horizontal = 36.dp),
                )
            }
        }
        item(key = "items") {
            AirSection(header = stringResource(R.string.files_items)) {
                state.items.forEachIndexed { index, item ->
                    if (index > 0) RowDivider(inset = 58.dp)
                    ItemRow(item, moving, state)
                }
            }
        }
    }
}

@Composable
private fun ItemRow(item: FileOperationModel.Item, moving: Boolean, state: FileOperationModel.State) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(
            if (item.source.isDir) Icons.Outlined.Folder else Icons.Outlined.Description,
            contentDescription = null,
            tint = Air.colors.accent,
            modifier = Modifier.size(24.dp),
        )
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(item.source.name, style = AirType.body, color = Air.colors.text)
            if (state.phase != FileOperationModel.Phase.REVIEWING) {
                when (val outcome = item.outcome) {
                    FileOperationModel.Outcome.Pending -> Note(
                        stringResource(if (state.busy) R.string.files_waiting else R.string.files_not_attempted),
                    )
                    FileOperationModel.Outcome.Running -> CircularProgressIndicator(
                        color = Air.colors.accent,
                        strokeWidth = 2.dp,
                        modifier = Modifier.size(16.dp),
                    )
                    FileOperationModel.Outcome.Completed -> Note(
                        stringResource(if (moving) R.string.files_moved else R.string.files_deleted),
                        color = Air.colors.success,
                    )
                    is FileOperationModel.Outcome.Failed ->
                        Note(stringResource(issueText(outcome.issue)), Air.colors.danger)
                    FileOperationModel.Outcome.Uncertain -> Note(stringResource(R.string.files_uncertain))
                }
            }
        }
    }
}

@Composable
private fun Note(text: String, color: androidx.compose.ui.graphics.Color = Air.colors.textSecondary) {
    Text(text, style = AirType.footnote, color = color)
}

/** Why a folder could not be listed. */
internal fun folderIssueText(issue: FolderModel.Issue?): Int =
    if (issue == FolderModel.Issue.CHANGED) R.string.files_changed else R.string.files_issue_other

/** The sentence a Files screen shows for [issue]. */
public fun issueText(issue: FileIssue): Int = when (issue) {
    FileIssue.DENIED -> R.string.files_issue_denied
    FileIssue.NAME_TAKEN -> R.string.files_issue_name_taken
    FileIssue.MISSING -> R.string.files_issue_missing
    FileIssue.MANAGED -> R.string.files_issue_managed
    FileIssue.INVALID_NAME -> R.string.files_issue_invalid_name
    FileIssue.EMPTY_NAME -> R.string.files_issue_empty_name
    FileIssue.DEVICE -> R.string.files_issue_device
    FileIssue.NO_APP -> R.string.files_issue_no_app
    FileIssue.OTHER -> R.string.files_issue_other
}
