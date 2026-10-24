package com.chromvoid.air.ui.credentials

import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.ArrowUpward
import androidx.compose.material.icons.rounded.UnfoldMore
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
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
import com.chromvoid.air.ui.design.PillText
import com.chromvoid.air.ui.design.RowAction
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.StatusBlock

public const val WEBSITES_ADD_TAG: String = "websites-add"
public const val WEBSITES_SAVE_TAG: String = "websites-save"
public const val WEBSITES_CLOSE_TAG: String = "websites-close"
public const val WEBSITES_ISSUE_TAG: String = "websites-issue"

public fun websiteValueTag(index: Int): String = "website-value-$index"

public fun websiteErrorTag(index: Int): String = "website-error-$index"

public fun websiteModeTag(index: Int): String = "website-mode-$index"

public fun websiteRemoveTag(index: Int): String = "website-remove-$index"

/**
 * The ordered website rules of one login as the iOS sheet: Cancel and
 * Save (Apply for a record not yet saved), one card per rule with its
 * pattern, how it matches and its removal. The first rule that matches a
 * page wins.
 */
@Composable
public fun WebsitesSheet(model: WebsitesModel, onDismiss: () -> Unit, onDiscard: () -> Unit) {
    CoversTabBar()
    val pane = stringResource(R.string.websites_title)
    val state by model.state.collectAsStateWithLifecycle()
    val editing = state.status == WebsitesModel.Status.EDITING
    val colors = Air.colors
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(colors.canvas)
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
                    stringResource(
                        if (state.status == WebsitesModel.Status.NEEDS_RELOAD) {
                            R.string.websites_close
                        } else {
                            R.string.websites_cancel
                        },
                    ),
                    onClick = onDismiss,
                    modifier = Modifier.testTag(WEBSITES_CLOSE_TAG),
                )
            },
            actions = {
                if (state.status == WebsitesModel.Status.SAVING) {
                    Box(modifier = Modifier.size(48.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(
                            color = colors.accent,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(20.dp),
                        )
                    }
                } else {
                    PillText(
                        stringResource(if (model.entryId == null) R.string.websites_apply else R.string.websites_save),
                        onClick = model::save,
                        enabled = editing,
                        emphasized = true,
                        modifier = Modifier.testTag(WEBSITES_SAVE_TAG),
                    )
                }
            },
        ) {
            state.issue?.let { issue ->
                item(key = "issue") {
                    Text(
                        stringResource(issueText(issue)),
                        style = AirType.subheadline,
                        color = colors.danger,
                        modifier = Modifier
                            .padding(horizontal = 36.dp, vertical = 8.dp)
                            .testTag(WEBSITES_ISSUE_TAG),
                    )
                }
            }
            when (state.status) {
                WebsitesModel.Status.LOADING -> item(key = "loading") {
                    StatusBlock(stringResource(R.string.websites_loading))
                }
                WebsitesModel.Status.FAILED -> item(key = "failed") {
                    StatusBlock(
                        stringResource(R.string.websites_issue_load),
                        icon = Icons.Rounded.WarningAmber,
                        action = stringResource(R.string.websites_try_again),
                        onAction = model::load,
                    )
                }
                else -> {
                    state.rows.forEachIndexed { index, row ->
                        item(key = "rule-${row.id}") {
                            RuleCard(model, row, index, editing, state.errors[row.id])
                        }
                    }
                    item(key = "add") {
                        AirSection(footer = stringResource(R.string.websites_footer)) {
                            ActionRow(
                                stringResource(R.string.websites_add_row),
                                onClick = model::add,
                                icon = Icons.Rounded.Add,
                                enabled = editing,
                                modifier = Modifier.testTag(WEBSITES_ADD_TAG),
                            )
                        }
                    }
                }
            }
        }
    }
    if (state.confirmingDiscard) {
        AlertDialog(
            onDismissRequest = model::cancelDiscard,
            containerColor = colors.card,
            title = { Text(stringResource(R.string.websites_discard_title), style = AirType.headline) },
            text = { Text(stringResource(R.string.websites_discard_text), style = AirType.subheadline) },
            confirmButton = {
                TextButton(onClick = onDiscard) {
                    Text(stringResource(R.string.websites_discard), color = colors.danger)
                }
            },
            dismissButton = {
                TextButton(onClick = model::cancelDiscard) {
                    Text(stringResource(R.string.websites_keep), color = colors.accent)
                }
            },
        )
    }
}

@Composable
private fun RuleCard(model: WebsitesModel, row: WebsitesModel.Row, index: Int, editing: Boolean, error: String?) {
    val colors = Air.colors
    var choosing by remember { mutableStateOf(false) }
    AirSection {
        Row(
            modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(start = 20.dp, end = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(modifier = Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                val placeholder = stringResource(R.string.websites_value)
                if (row.value.isEmpty()) Text(placeholder, style = AirType.body, color = colors.textSecondary)
                BasicTextField(
                    value = row.value,
                    onValueChange = { model.change(row.id, value = it) },
                    enabled = editing,
                    singleLine = true,
                    textStyle = AirType.body.copy(color = colors.text),
                    cursorBrush = SolidColor(colors.accent),
                    keyboardOptions = KeyboardOptions(
                        keyboardType = if (row.mode == "regex") KeyboardType.Text else KeyboardType.Uri,
                        autoCorrectEnabled = false,
                    ),
                    modifier = Modifier
                        .fillMaxWidth()
                        .semantics { contentDescription = placeholder }
                        .testTag(websiteValueTag(index)),
                )
            }
            if (index > 0) {
                RowAction(
                    Icons.Rounded.ArrowUpward,
                    stringResource(R.string.websites_up),
                    onClick = { model.moveUp(row.id) },
                    enabled = editing,
                )
            }
        }
        error?.let {
            Text(
                stringResource(ruleErrorText(it)),
                style = AirType.footnote,
                color = colors.danger,
                modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 8.dp).testTag(websiteErrorTag(index)),
            )
        }
        RowDivider()
        Box {
            AirRow(
                title = stringResource(R.string.websites_match),
                value = stringResource(modeText(row.mode)),
                enabled = editing,
                onClick = { choosing = true },
                modifier = Modifier.testTag(websiteModeTag(index)),
                trailing = {
                    Icon(Icons.Rounded.UnfoldMore, contentDescription = null, tint = colors.textSecondary)
                },
            )
            DropdownMenu(expanded = choosing, onDismissRequest = { choosing = false }) {
                WebsitesModel.MODES.forEach { mode ->
                    DropdownMenuItem(
                        text = { Text(stringResource(modeText(mode))) },
                        onClick = {
                            model.change(row.id, mode = mode)
                            choosing = false
                        },
                    )
                }
            }
        }
        RowDivider()
        ActionRow(
            stringResource(R.string.websites_remove),
            onClick = { model.remove(row.id) },
            destructive = true,
            enabled = editing,
            modifier = Modifier.testTag(websiteRemoveTag(index)),
        )
    }
}

private fun modeText(mode: String): Int = when (mode) {
    "base_domain" -> R.string.websites_mode_domain
    "host" -> R.string.websites_mode_host
    "starts_with" -> R.string.websites_mode_starts
    "exact" -> R.string.websites_mode_exact
    "regex" -> R.string.websites_mode_regex
    "never" -> R.string.websites_mode_never
    else -> R.string.websites_mode_imported
}

private fun ruleErrorText(code: String): Int = when (code) {
    "invalid_regex" -> R.string.websites_error_regex
    "invalid_mode" -> R.string.websites_error_mode
    "duplicate" -> R.string.websites_error_duplicate
    "too_long" -> R.string.websites_error_long
    else -> R.string.websites_error_invalid
}

private fun issueText(issue: WebsitesModel.Issue): Int = when (issue) {
    WebsitesModel.Issue.LOAD_FAILED -> R.string.websites_issue_load
    WebsitesModel.Issue.DENIED -> R.string.clear_denied
    WebsitesModel.Issue.INVALID -> R.string.websites_issue_invalid
    WebsitesModel.Issue.FAILED -> R.string.websites_issue_failed
    WebsitesModel.Issue.NEEDS_RELOAD -> R.string.websites_issue_reload
}
