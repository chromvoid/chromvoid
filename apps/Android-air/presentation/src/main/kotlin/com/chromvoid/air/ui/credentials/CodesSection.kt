package com.chromvoid.air.ui.credentials

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AddCircleOutline
import androidx.compose.material.icons.rounded.ContentCopy
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material.icons.rounded.RemoveCircle
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.bridge.wire.CredentialOtpSummary
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.root.CoversTabBar
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.CountdownRing
import com.chromvoid.air.ui.design.DoneButton
import com.chromvoid.air.ui.design.RowAction
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.groupedCode
import kotlinx.coroutines.delay

public const val CODES_ADD_TAG: String = "codes-add"
public const val CODE_LABEL_TAG: String = "code-label"
public const val CODE_KEY_TAG: String = "code-key"
public const val CODE_SCAN_TAG: String = "code-scan"
public const val CODE_SAVE_TAG: String = "code-save"
public const val CODES_ISSUE_TAG: String = "codes-issue"
public const val CODE_DELETE_CONFIRM_TAG: String = "code-delete-confirm"
public const val CODES_FAILED_TAG: String = "codes-failed"
public const val CODES_RETRY_TAG: String = "codes-retry"
public const val CODES_MANAGER_DONE_TAG: String = "codes-manager-done"

public fun codeValueTag(label: String): String = "code-value-$label"

public fun codeCountdownTag(label: String): String = "code-countdown-$label"

public fun codeDeleteTag(label: String): String = "code-delete-$label"

public fun codeCopyTag(label: String): String = "code-copy-$label"

/**
 * One record's live code, as the iOS credential page shows it: the label, the
 * digits in two groups, the seconds left in a ring and one-tap copy. The code
 * is requested as soon as the row appears and again when it expires, so it is
 * never shown wrong and never hidden while on screen.
 */
@Composable
public fun CodeLiveRow(model: CodesModel, record: CredentialOtpSummary, showsLabel: Boolean = true) {
    val state by model.state.collectAsStateWithLifecycle()
    val shown = state.shown[record.label]
    LaunchedEffect(record.label, shown == null) {
        if (shown == null) model.show(record.label)
    }
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(
            min = 76.dp,
        ).padding(start = 20.dp, end = 8.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            if (showsLabel) Text(record.label, style = AirType.footnote, color = Air.colors.textSecondary)
            val description = if (shown != null) {
                stringResource(R.string.code_accessibility, shown.code.toList().joinToString(" "))
            } else {
                stringResource(R.string.code_updating)
            }
            // Keep the same node through expiry and the next Core reply.
            Text(
                shown?.code?.let(::groupedCode) ?: "••• •••",
                style = AirType.code,
                color = if (shown != null) Air.colors.text else Air.colors.textSecondary,
                modifier = Modifier.testTag(codeValueTag(record.label)).clearAndSetSemantics {
                    contentDescription = description
                },
            )
        }
        // A counter-based code has no deadline to count down to.
        val expiresAt = shown?.expiresAt
        if (record.otpType == "TOTP") {
            CountdownRing(
                expiresAt?.let { remainingSeconds(it) },
                record.period.coerceAtLeast(1),
                Modifier.testTag(codeCountdownTag(record.label)),
            )
        }
        RowAction(
            Icons.Rounded.ContentCopy,
            stringResource(R.string.code_copy, record.label),
            onClick = { if (shown != null) model.copyShown(record.label) else model.show(record.label, copy = true) },
            modifier = Modifier.testTag(codeCopyTag(record.label)),
        )
    }
}

/**
 * The record page's one-time codes: read only. An empty list is left out,
 * as iOS leaves it out; adding and removing codes is in Edit.
 */
@Composable
public fun CodesPageSection(model: CodesModel) {
    val state by model.state.collectAsStateWithLifecycle()
    val ready = state.status == CodesModel.Status.READY || state.status == CodesModel.Status.REVOKED
    if (state.records.isEmpty() && state.issue == null && ready) return
    AirSection(
        header = stringResource(R.string.codes_title),
        footer = state.issue?.let { stringResource(issueTextFor(it)) },
    ) {
        CodesRows(model)
    }
}

/** The same loading, failed-read and live rows on the credential page and in the Codes collection. */
@Composable
public fun CodesRows(model: CodesModel, modifier: Modifier = Modifier) {
    val state by model.state.collectAsStateWithLifecycle()
    Column(modifier = modifier.fillMaxWidth()) {
        when (state.status) {
            CodesModel.Status.LOADING -> Row(
                modifier = Modifier.fillMaxWidth().padding(20.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(color = Air.colors.accent, modifier = Modifier.size(24.dp))
                Text(stringResource(R.string.codes_loading), style = AirType.body, color = Air.colors.textSecondary)
            }
            CodesModel.Status.FAILED -> CodesReadFailure(model)
            CodesModel.Status.READY, CodesModel.Status.REVOKED -> {
                state.records.forEachIndexed { index, record ->
                    if (index > 0) RowDivider()
                    CodeLiveRow(model, record)
                }
            }
        }
    }
}

@Composable
private fun CodesReadFailure(model: CodesModel) {
    Text(
        stringResource(R.string.codes_load_failed),
        style = AirType.body,
        color = Air.colors.textSecondary,
        modifier = Modifier.padding(20.dp).testTag(CODES_FAILED_TAG),
    )
    RowDivider()
    ActionRow(
        stringResource(R.string.vault_try_again),
        onClick = model::reload,
        modifier = Modifier.testTag(CODES_RETRY_TAG),
    )
}

/**
 * The code manager opened from Edit: every code of the record with its live
 * value, removable, and a way to add one by setup key or QR code. Each change
 * is saved at once.
 */
@Composable
public fun CodesManagerScreen(model: CodesModel, onDone: () -> Unit, modifier: Modifier = Modifier) {
    CoversTabBar()
    val pane = stringResource(R.string.codes_title)
    val state by model.state.collectAsStateWithLifecycle()
    AirScreen(
        title = pane,
        largeTitle = false,
        modifier = modifier.semantics { paneTitle = pane },
        leading = { DoneButton(stringResource(R.string.tags_done), onDone, Modifier.testTag(CODES_MANAGER_DONE_TAG)) },
    ) {
        if (state.draft == null) {
            state.issue?.let { item(key = "issue") { IssueText(it) } }
        }
        item(key = "codes") {
            AirSection {
                when (state.status) {
                    CodesModel.Status.LOADING -> Box(
                        modifier = Modifier.fillMaxWidth().padding(20.dp),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = Air.colors.accent, modifier = Modifier.size(24.dp))
                    }
                    CodesModel.Status.FAILED -> CodesReadFailure(model)
                    else -> {
                        if (state.records.isEmpty()) {
                            Text(
                                stringResource(R.string.codes_none),
                                style = AirType.body,
                                color = Air.colors.textSecondary,
                                modifier = Modifier.padding(20.dp),
                            )
                        }
                        state.records.forEach { record ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                RowAction(
                                    Icons.Rounded.RemoveCircle,
                                    stringResource(R.string.code_delete),
                                    onClick = { model.requestDelete(record.label) },
                                    tint = Air.colors.danger,
                                    enabled = !state.busy,
                                    modifier = Modifier.padding(start = 8.dp).testTag(codeDeleteTag(record.label)),
                                )
                                Box(modifier = Modifier.weight(1f)) { CodeLiveRow(model, record) }
                            }
                            RowDivider()
                        }
                        ActionRow(
                            stringResource(R.string.codes_add),
                            onClick = model::beginAdd,
                            icon = Icons.Rounded.AddCircleOutline,
                            enabled = !state.busy,
                            modifier = Modifier.testTag(CODES_ADD_TAG),
                        )
                    }
                }
            }
        }
    }
    state.draft?.let { draft -> DraftDialog(draft, state, model) }
    state.deleting?.let { label ->
        AlertDialog(
            onDismissRequest = model::cancelDelete,
            title = { Text(stringResource(R.string.code_delete_title)) },
            text = { Text(label + "\n\n" + stringResource(R.string.codes_delete_text)) },
            confirmButton = {
                TextButton(onClick = model::confirmDelete, modifier = Modifier.testTag(CODE_DELETE_CONFIRM_TAG)) {
                    Text(stringResource(R.string.group_delete), color = Air.colors.danger)
                }
            },
            dismissButton = {
                TextButton(onClick = model::cancelDelete) { Text(stringResource(R.string.form_keep_cancel)) }
            },
        )
    }
}

/** Whole seconds until [expiresAt] on the model's monotonic clock, ticking while shown. */
@Composable
private fun remainingSeconds(expiresAt: Long): Long {
    var left by remember(expiresAt) { mutableLongStateOf(secondsUntil(expiresAt)) }
    LaunchedEffect(expiresAt) {
        while (left > 0) {
            delay(1_000)
            left = secondsUntil(expiresAt)
        }
    }
    return left
}

private fun secondsUntil(expiresAt: Long): Long =
    ((expiresAt - System.nanoTime() / 1_000_000 + 999) / 1_000).coerceAtLeast(0)

internal fun issueTextFor(issue: CodesModel.Issue): Int = when (issue) {
    CodesModel.Issue.DENIED -> R.string.form_issue_denied
    CodesModel.Issue.INVALID -> R.string.codes_issue_invalid
    CodesModel.Issue.STALE -> R.string.picker_issue_stale
    CodesModel.Issue.FAILED -> R.string.group_issue_failed
    CodesModel.Issue.CODE_FAILED -> R.string.codes_issue_code
    CodesModel.Issue.CODE_EXPIRED -> R.string.codes_issue_expired
    CodesModel.Issue.SCAN_UNREADABLE -> R.string.codes_issue_unreadable
    CodesModel.Issue.CAMERA_DENIED -> R.string.codes_issue_camera_denied
    CodesModel.Issue.CAMERA_UNAVAILABLE -> R.string.codes_issue_camera_unavailable
}

@Composable
private fun DraftDialog(draft: CodesModel.Draft, state: CodesModel.State, model: CodesModel) {
    AlertDialog(
        onDismissRequest = model::cancelDraft,
        title = { Text(stringResource(R.string.codes_add)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                state.issue?.let { IssueText(it) }
                TextButton(onClick = model::scan, modifier = Modifier.testTag(CODE_SCAN_TAG)) {
                    androidx.compose.material3.Icon(Icons.Rounded.QrCodeScanner, contentDescription = null)
                    Text("  " + stringResource(R.string.codes_scan))
                }
                OutlinedTextField(
                    value = draft.label,
                    onValueChange = { value -> model.changeDraft { it.copy(label = value) } },
                    label = { Text(stringResource(R.string.codes_label)) },
                    isError = CodesModel.DraftError.LABEL_REQUIRED in draft.errors,
                    singleLine = true,
                    modifier = Modifier.testTag(CODE_LABEL_TAG),
                )
                OutlinedTextField(
                    value = draft.secret,
                    onValueChange = { value -> model.changeDraft { it.copy(secret = value) } },
                    label = { Text(stringResource(R.string.codes_key)) },
                    isError = CodesModel.DraftError.KEY_REQUIRED in draft.errors ||
                        CodesModel.DraftError.KEY_INVALID in draft.errors,
                    supportingText = when {
                        CodesModel.DraftError.KEY_INVALID in draft.errors -> {
                            { Text(stringResource(R.string.codes_key_invalid)) }
                        }
                        CodesModel.DraftError.KEY_REQUIRED in draft.errors -> {
                            { Text(stringResource(R.string.codes_key_required)) }
                        }
                        else -> null
                    },
                    singleLine = true,
                    modifier = Modifier.testTag(CODE_KEY_TAG),
                )
                OutlinedTextField(
                    value = draft.period,
                    onValueChange = { value -> model.changeDraft { it.copy(period = value) } },
                    label = { Text(stringResource(R.string.codes_period)) },
                    isError = CodesModel.DraftError.PERIOD_INVALID in draft.errors,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                )
            }
        },
        confirmButton = {
            TextButton(onClick = model::saveDraft, enabled = !state.busy, modifier = Modifier.testTag(CODE_SAVE_TAG)) {
                Text(stringResource(R.string.form_save))
            }
        },
        dismissButton = {
            TextButton(onClick = model::cancelDraft) { Text(stringResource(R.string.form_keep_cancel)) }
        },
    )
}

@Composable
private fun IssueText(issue: CodesModel.Issue) {
    Text(
        stringResource(issueTextFor(issue)),
        color = Air.colors.danger,
        style = AirType.footnote,
        modifier = Modifier.padding(horizontal = 20.dp, vertical = 8.dp).testTag(CODES_ISSUE_TAG),
    )
}
