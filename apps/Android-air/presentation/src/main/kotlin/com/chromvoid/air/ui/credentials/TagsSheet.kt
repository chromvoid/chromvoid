package com.chromvoid.air.ui.credentials

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Label
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.automirrored.rounded.Label
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.bridge.wire.CredentialTagSummary
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.root.CoversTabBar
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

public const val TAGS_NEW_TAG: String = "tags-new"
public const val TAGS_DONE_TAG: String = "tags-done"
public const val TAGS_CLOSE_TAG: String = "tags-close"
public const val TAG_LABEL_TAG: String = "tag-label"
public const val TAG_SAVE_TAG: String = "tag-save"
public const val TAG_DELETE_CONFIRM_TAG: String = "tag-delete-confirm"

public fun tagRowTag(key: String): String = "tag-row-$key"

public fun tagActionsTag(key: String): String = "tag-actions-$key"

public fun tagEditTag(key: String): String = "tag-edit-$key"

public fun tagDeleteTag(key: String): String = "tag-delete-$key"

public fun tagColorTag(color: String): String = "tag-color-$color"

/**
 * The tag catalog as the iOS sheet: Done (or Cancel while choosing) on the
 * left, + on the right, and the tag details edited in place. To filter,
 * tapping a tag chooses it; to assign, tags are ticked and Done applies them.
 */
@Composable
public fun TagsSheet(
    model: TagsModel,
    assigning: Boolean,
    onChoose: (CredentialTagSummary) -> Unit,
    onDone: () -> Unit,
    onDismiss: () -> Unit,
) {
    CoversTabBar()
    val state by model.state.collectAsStateWithLifecycle()
    val pane = stringResource(when (state.edit) {
        TagsModel.Edit.Create -> R.string.tags_new
        is TagsModel.Edit.Change -> R.string.tags_change
        null -> R.string.tags_title
    })
    val editing = state.edit != null
    val ready = state.status == TagsModel.Status.READY && !state.busy
    // The sheet covers what is under it and takes its touches.
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
                    stringResource(if (!editing && !assigning) R.string.tags_done else R.string.tags_cancel),
                    onClick = if (editing) model::cancelEdit else onDismiss,
                    modifier = Modifier.testTag(TAGS_CLOSE_TAG),
                )
            },
            actions = {
                if (assigning && !editing) {
                    PillText(
                        stringResource(R.string.tags_done),
                        onClick = onDone,
                        enabled = ready,
                        emphasized = true,
                        modifier = Modifier.testTag(TAGS_DONE_TAG),
                    )
                }
                PillIcon(
                    Icons.Rounded.Add,
                    stringResource(R.string.tags_new),
                    onClick = model::beginCreate,
                    enabled = ready && !editing,
                    modifier = Modifier.testTag(TAGS_NEW_TAG),
                )
            },
        ) {
            val edit = state.edit
            when {
                edit != null -> item(key = "details") { TagDetails(model, state, edit) }
                state.status == TagsModel.Status.LOADING -> item(key = "loading") {
                    StatusBlock(stringResource(R.string.tags_loading))
                }
                state.status == TagsModel.Status.FAILED -> item(key = "failed") {
                    StatusBlock(
                        stringResource(R.string.tags_failed),
                        icon = Icons.Rounded.WarningAmber,
                        action = stringResource(R.string.tags_reload),
                        onAction = model::reload,
                    )
                }
                state.tags.isEmpty() -> item(key = "empty") {
                    StatusBlock(
                        stringResource(R.string.tags_empty),
                        message = stringResource(R.string.tags_empty_text),
                        icon = Icons.AutoMirrored.Outlined.Label,
                    )
                }
                else -> item(key = "tags") {
                    AirSection(
                        footer = stringResource(
                            if (assigning) R.string.tags_footer_assign else R.string.tags_footer_filter,
                        ),
                    ) {
                        state.tags.forEachIndexed { index, tag ->
                            if (index > 0) RowDivider(inset = 58.dp)
                            TagRow(
                                tag = tag,
                                checked = if (assigning) state.selected.any { it.key == tag.key } else null,
                                onClick = { onChoose(tag) },
                                onChange = { model.beginChange(tag) },
                                onDelete = { model.requestDelete(tag) },
                            )
                        }
                    }
                }
            }
        }
    }
    DeleteDialog(model, state)
}

@Composable
private fun TagRow(
    tag: CredentialTagSummary,
    checked: Boolean?,
    onClick: () -> Unit,
    onChange: () -> Unit,
    onDelete: () -> Unit,
) {
    AirRow(
        title = tag.label,
        icon = Icons.AutoMirrored.Rounded.Label,
        iconTint = tagColor(tag.colorID),
        value = if (checked == null) tag.count.toString() else null,
        onClick = onClick,
        modifier = Modifier
            .semantics { if (checked != null) selected = checked }
            .testTag(tagRowTag(tag.key)),
        trailing = {
            if (checked == true) {
                Icon(Icons.Rounded.Check, contentDescription = null, tint = Air.colors.accent)
            }
            if (checked == null) TagActions(tag, onChange, onDelete)
        },
    )
}

@Composable
private fun TagActions(tag: CredentialTagSummary, onChange: () -> Unit, onDelete: () -> Unit) {
    var menu by remember { mutableStateOf(false) }
    Box {
        PillIcon(
            Icons.Rounded.MoreHoriz,
            stringResource(R.string.tags_actions),
            onClick = { menu = true },
            modifier = Modifier.testTag(tagActionsTag(tag.key)),
        )
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            DropdownMenuItem(
                text = { Text(stringResource(R.string.tags_change)) },
                onClick = {
                    menu = false
                    onChange()
                },
                modifier = Modifier.testTag(tagEditTag(tag.key)),
            )
            DropdownMenuItem(
                text = { Text(stringResource(R.string.tags_delete), color = Air.colors.danger) },
                onClick = {
                    menu = false
                    onDelete()
                },
                modifier = Modifier.testTag(tagDeleteTag(tag.key)),
            )
        }
    }
}

/** The new or changed tag, edited in place of the list as on iOS: its name, its colour, Save. */
@Composable
private fun TagDetails(model: TagsModel, state: TagsModel.State, edit: TagsModel.Edit) {
    val original = (edit as? TagsModel.Edit.Change)?.tag
    var label by remember(edit) { mutableStateOf(original?.label.orEmpty()) }
    var color by remember(edit) { mutableStateOf(original?.colorID ?: TagsModel.COLORS.first()) }
    val focus = remember { FocusRequester() }
    LaunchedEffect(edit) { focus.requestFocus() }
    val colors = Air.colors
    AirSection(header = stringResource(R.string.tags_details)) {
        Box(
            modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 20.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            val placeholder = stringResource(R.string.tags_label)
            if (label.isEmpty()) Text(placeholder, style = AirType.body, color = colors.textSecondary)
            BasicTextField(
                value = label,
                onValueChange = { label = it },
                enabled = !state.busy,
                singleLine = true,
                textStyle = AirType.body.copy(color = colors.text),
                cursorBrush = SolidColor(colors.accent),
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus)
                    .semantics { contentDescription = placeholder }
                    .testTag(TAG_LABEL_TAG),
            )
        }
        RowDivider()
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 10.dp)) {
            Text(stringResource(R.string.tags_color), style = AirType.body, color = colors.text)
            FlowRow(
                modifier = Modifier.fillMaxWidth().selectableGroup(),
                maxItemsInEachRow = 4,
            ) {
                TagsModel.COLORS.forEach { id ->
                    ColorChoice(id, chosen = id == color, enabled = !state.busy, onClick = { color = id })
                }
            }
        }
        state.issue?.let { issue ->
            RowDivider()
            Text(
                stringResource(tagIssueText(issue)),
                style = AirType.footnote,
                color = colors.danger,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
            )
        }
        RowDivider()
        ActionRow(
            stringResource(R.string.form_save),
            onClick = { model.save(label, color) },
            enabled = !state.busy,
            modifier = Modifier.testTag(TAG_SAVE_TAG),
        )
    }
}

@Composable
private fun ColorChoice(id: String, chosen: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val name = stringResource(colorName(id))
    Box(
        modifier = Modifier
            .size(48.dp)
            .selectable(selected = chosen, enabled = enabled, role = Role.RadioButton, onClick = onClick)
            .semantics { contentDescription = name }
            .testTag(tagColorTag(id)),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(tagColor(id))
                .border(width = if (chosen) 3.dp else 0.dp, color = Air.colors.text, shape = CircleShape),
        )
    }
}

@Composable
private fun DeleteDialog(model: TagsModel, state: TagsModel.State) {
    val deleting = state.deleting ?: return
    AlertDialog(
        onDismissRequest = model::cancelDelete,
        containerColor = Air.colors.card,
        title = { Text(stringResource(R.string.tags_delete_title), style = AirType.headline) },
        text = {
            Text(
                pluralStringResource(R.plurals.tags_delete_text, deleting.count.toInt(), deleting.count.toInt()),
                style = AirType.subheadline,
            )
        },
        confirmButton = {
            TextButton(onClick = model::confirmDelete, modifier = Modifier.testTag(TAG_DELETE_CONFIRM_TAG)) {
                Text(stringResource(R.string.tags_delete), color = Air.colors.danger)
            }
        },
        dismissButton = {
            TextButton(onClick = model::cancelDelete) {
                Text(stringResource(R.string.tags_cancel), color = Air.colors.accent)
            }
        },
    )
}

@Composable
internal fun ColorDot(colorId: String) {
    Box(modifier = Modifier.size(16.dp).clip(CircleShape).background(tagColor(colorId)))
}

/** The seven tag colours Core accepts; an unknown id draws neutral. */
internal fun tagColor(id: String): Color = when (id) {
    "violet" -> Color(0xFF8B5CF6)
    "green" -> Color(0xFF22C55E)
    "blue" -> Color(0xFF3B82F6)
    "pink" -> Color(0xFFEC4899)
    "amber" -> Color(0xFFF59E0B)
    "orange" -> Color(0xFFF97316)
    "cyan" -> Color(0xFF06B6D4)
    else -> Color(0xFF9CA3AF)
}

private fun colorName(id: String): Int = when (id) {
    "violet" -> R.string.color_violet
    "green" -> R.string.color_green
    "blue" -> R.string.color_blue
    "pink" -> R.string.color_pink
    "amber" -> R.string.color_amber
    "orange" -> R.string.color_orange
    else -> R.string.color_cyan
}

private fun tagIssueText(issue: TagsModel.Issue): Int = when (issue) {
    TagsModel.Issue.NAME_INVALID -> R.string.tags_issue_invalid
    TagsModel.Issue.NAME_TAKEN -> R.string.tags_issue_taken
    TagsModel.Issue.DENIED -> R.string.form_issue_denied
    TagsModel.Issue.FAILED -> R.string.group_issue_failed
}
