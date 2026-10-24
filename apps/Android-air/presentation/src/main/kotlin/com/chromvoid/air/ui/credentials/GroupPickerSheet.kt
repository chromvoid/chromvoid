package com.chromvoid.air.ui.credentials

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.rounded.CreateNewFolder
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.Folder
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material.icons.rounded.Inventory2
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.TextButton
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.padding
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.root.CoversTabBar
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DoneButton
import com.chromvoid.air.ui.design.RowAction
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.StatusBlock

public const val PICKER_HERE_TAG: String = "picker-here"
public const val PICKER_UP_TAG: String = "picker-up"
public const val PICKER_CLOSE_TAG: String = "picker-close"
public const val PICKER_NEW_TAG: String = "picker-new"
public const val PICKER_NEW_NAME_TAG: String = "picker-new-name"
public const val PICKER_NEW_USE_TAG: String = "picker-new-use"
public const val PICKER_NEW_CANCEL_TAG: String = "picker-new-cancel"

/** Chooses that group. */
public fun pickerGroupTag(path: String): String = "picker-group-$path"

/** Shows the groups inside that one. */
public fun pickerOpenTag(path: String): String = "picker-open-$path"

/**
 * Where a record lives, chosen as on iOS: tapping a group uses it and the
 * arrow shows the groups inside. The level shown is itself the first row,
 * so the vault root and any parent group can be chosen too. The group the
 * record is in carries the tick.
 */
@Composable
public fun GroupPickerSheet(picker: GroupPickerModel, onChoose: (String) -> Unit, onDismiss: () -> Unit) {
    CoversTabBar()
    val pane = stringResource(R.string.picker_title)
    val level by picker.level.collectAsStateWithLifecycle()
    val state by level.state.collectAsStateWithLifecycle()
    val busy by picker.busy.collectAsStateWithLifecycle()
    val issue by picker.issue.collectAsStateWithLifecycle()
    val newGroup by picker.newGroup.collectAsStateWithLifecycle()
    val parent = level.parent
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Air.colors.canvas)
            // Takes the touches of whatever it covers, without merging the sheet
            // into one accessibility node the way a clickable would.
            .pointerInput(Unit) { detectTapGestures {} },
    ) {
        AirScreen(
            title = pane,
            largeTitle = false,
            modifier = Modifier.semantics { paneTitle = pane },
            leading = {
                DoneButton(
                    stringResource(R.string.picker_cancel),
                    onClick = onDismiss,
                    modifier = Modifier.testTag(PICKER_CLOSE_TAG),
                )
            },
        ) {
            if (parent != GroupsModel.ROOT) {
                item(key = "up") {
                    AirSection {
                        val above = parent.substringBeforeLast('/').ifEmpty { GroupsModel.ROOT }
                        ActionRow(
                            if (above == GroupsModel.ROOT) {
                                stringResource(R.string.picker_root)
                            } else {
                                GroupsModel.name(above)
                            },
                            icon = Icons.Rounded.ArrowUpward,
                            onClick = picker::up,
                            enabled = !busy,
                            modifier = Modifier.testTag(PICKER_UP_TAG),
                        )
                    }
                }
            }
            item(key = "groups") {
                when (state.status) {
                    GroupsModel.Status.LOADING -> StatusBlock(stringResource(R.string.picker_loading))
                    GroupsModel.Status.FAILED -> StatusBlock(
                        stringResource(R.string.picker_failed),
                        icon = Icons.Rounded.WarningAmber,
                        action = stringResource(R.string.picker_reload),
                        onAction = { picker.open(parent) },
                    )
                    else -> AirSection(footer = stringResource(R.string.picker_footer)) {
                        GroupRow(
                            title = if (parent == GroupsModel.ROOT) {
                                stringResource(R.string.picker_root)
                            } else {
                                GroupsModel.name(parent)
                            },
                            root = parent == GroupsModel.ROOT,
                            count = null,
                            current = parent == picker.current,
                            enabled = !busy,
                            onChoose = { onChoose(parent) },
                            onOpen = null,
                            modifier = Modifier.testTag(PICKER_HERE_TAG),
                        )
                        state.groups.forEach { group ->
                            RowDivider(inset = 58.dp)
                            GroupRow(
                                title = GroupsModel.name(group.path),
                                root = false,
                                count = group.entryCount,
                                current = group.path == picker.current,
                                enabled = !busy,
                                onChoose = { onChoose(group.path) },
                                onOpen = { picker.open(group.path) },
                                modifier = Modifier.testTag(pickerGroupTag(group.path)),
                                openTag = pickerOpenTag(group.path),
                            )
                        }
                        RowDivider(inset = 58.dp)
                        ActionRow(
                            stringResource(R.string.group_new),
                            icon = Icons.Rounded.CreateNewFolder,
                            onClick = picker::beginNewGroup,
                            enabled = !busy,
                            modifier = Modifier.testTag(PICKER_NEW_TAG),
                        )
                    }
                }
            }
            issue?.let {
                item(key = "issue") {
                    Text(
                        stringResource(pickerIssueText(it)),
                        style = AirType.footnote,
                        color = Air.colors.danger,
                        modifier = Modifier.padding(horizontal = 36.dp, vertical = 4.dp),
                    )
                }
            }
        }
    }
    newGroup?.let { draft ->
        val focus = remember { FocusRequester() }
        val error = if (draft.invalid) stringResource(R.string.form_error_required) else null
        AlertDialog(
            onDismissRequest = picker::cancelNewGroup,
            title = {
                Text(stringResource(
                    R.string.picker_new_here,
                    if (parent == GroupsModel.ROOT) stringResource(R.string.picker_root) else parent,
                ))
            },
            text = {
                androidx.compose.foundation.layout.Column {
                    LaunchedEffect(Unit) { focus.requestFocus() }
                    GroupNameField(
                        state = draft.input,
                        error = error,
                        modifier = Modifier.focusRequester(focus).testTag(PICKER_NEW_NAME_TAG),
                    )
                    Text(
                        stringResource(R.string.picker_new_footer),
                        style = AirType.footnote,
                        color = Air.colors.textSecondary,
                        modifier = Modifier.padding(top = 12.dp),
                    )
                }
            },
            confirmButton = {
                TextButton(
                    onClick = { picker.chooseNewGroup()?.let(onChoose) },
                    modifier = Modifier.testTag(PICKER_NEW_USE_TAG),
                ) { Text(stringResource(R.string.picker_use_new)) }
            },
            dismissButton = {
                TextButton(
                    onClick = picker::cancelNewGroup,
                    modifier = Modifier.testTag(PICKER_NEW_CANCEL_TAG),
                ) { Text(stringResource(R.string.form_keep_cancel)) }
            },
        )
    }
}

@Composable
private fun GroupRow(
    title: String,
    root: Boolean,
    count: Long?,
    current: Boolean,
    enabled: Boolean,
    onChoose: () -> Unit,
    onOpen: (() -> Unit)?,
    modifier: Modifier = Modifier,
    openTag: String? = null,
) {
    AirRow(
        title = title,
        icon = if (root) Icons.Rounded.Inventory2 else Icons.Rounded.Folder,
        value = count?.toString(),
        enabled = enabled,
        onClick = onChoose,
        modifier = modifier.semantics { selected = current },
        trailing = {
            if (current) Icon(Icons.Rounded.Check, contentDescription = null, tint = Air.colors.accent)
            if (onOpen != null) {
                RowAction(
                    Icons.AutoMirrored.Rounded.KeyboardArrowRight,
                    stringResource(R.string.picker_open, title),
                    onClick = onOpen,
                    modifier = if (openTag != null) Modifier.testTag(openTag) else Modifier,
                )
            }
        },
    )
}

private fun pickerIssueText(issue: GroupPickerModel.Issue): Int = when (issue) {
    GroupPickerModel.Issue.DENIED -> R.string.form_issue_denied
    GroupPickerModel.Issue.NAME_TAKEN -> R.string.group_issue_name_taken
    GroupPickerModel.Issue.STALE -> R.string.picker_issue_stale
    GroupPickerModel.Issue.FAILED -> R.string.group_issue_failed
}
