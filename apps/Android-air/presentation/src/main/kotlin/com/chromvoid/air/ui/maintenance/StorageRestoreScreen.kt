package com.chromvoid.air.ui.maintenance

import android.net.Uri
import android.text.format.Formatter
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.maintenance.StorageRestoreModel.Issue
import com.chromvoid.air.ui.maintenance.StorageRestoreModel.Status

public const val RESTORE_CLOSE_TAG: String = "restore-close"
public const val RESTORE_SOURCE_TAG: String = "restore-source"
public const val RESTORE_REVIEW_SOURCE_TAG: String = "restore-review-source"
public const val RESTORE_PASSWORD_TAG: String = "restore-password"
public const val RESTORE_CHECK_TAG: String = "restore-check"
public const val RESTORE_CONFIRM_TAG: String = "restore-confirm"
public const val RESTORE_OTHER_TAG: String = "restore-other"
public const val RESTORE_CANCEL_TAG: String = "restore-cancel"
public const val RESTORE_ISSUE_TAG: String = "restore-issue"
public const val RESTORE_DONE_TAG: String = "restore-done"
public const val RESTORE_UNCERTAIN_TAG: String = "restore-uncertain"

/**
 * Restoring a backup, as the iOS sheet: the folder and the backup's
 * administrative password, Core's check, then what it found and one explicit
 * action that replaces the storage - or an outcome that could not be
 * confirmed, which asks for the storage to be checked rather than retried.
 */
@Composable
public fun StorageRestoreScreen(model: StorageRestoreModel, onDismiss: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val colors = Air.colors
    val context = LocalContext.current
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { tree: Uri? ->
        if (tree != null) model.chooseSource(tree)
    }
    val working = state.status == Status.REVIEWING ||
        state.status == Status.CANCELLING ||
        state.status == Status.COMMITTING
    MaintenanceSheet(
        title = stringResource(R.string.restore_title),
        onDismiss = onDismiss,
        closeTag = RESTORE_CLOSE_TAG,
        closable = !working,
    ) {
        when (state.status) {
            Status.EDITING -> {
                item(key = "intro") {
                    MaintenanceNote(stringResource(R.string.restore_intro))
                    MaintenanceNote(stringResource(R.string.restore_blank))
                }
                item(key = "source") {
                    AirSection(header = stringResource(R.string.restore_folder)) {
                        AirRow(
                            title = state.source ?: stringResource(R.string.restore_choose),
                            chevron = true,
                            onClick = { picker.launch(null) },
                            modifier = Modifier.testTag(RESTORE_SOURCE_TAG),
                        )
                    }
                }
                item(key = "password") {
                    AirSection(header = stringResource(R.string.restore_password_header)) {
                        MaintenanceSecretRow(
                            value = state.password,
                            onValueChange = model::changePassword,
                            label = stringResource(R.string.restore_password),
                            onDone = model::submit,
                            modifier = Modifier.testTag(RESTORE_PASSWORD_TAG),
                        )
                    }
                }
                item(key = "check") {
                    AirSection {
                        ActionRow(
                            stringResource(R.string.restore_check),
                            onClick = model::submit,
                            modifier = Modifier.testTag(RESTORE_CHECK_TAG),
                        )
                    }
                }
            }
            Status.REVIEW -> state.preview?.let { preview ->
                item(key = "review") {
                    AirSection(
                        header = stringResource(R.string.restore_ready),
                        footer = stringResource(R.string.restore_ready_text),
                    ) {
                        AirRow(
                            title = stringResource(R.string.restore_folder),
                            subtitle = state.source,
                            modifier = Modifier.testTag(RESTORE_REVIEW_SOURCE_TAG),
                        )
                        RowDivider()
                        AirRow(
                            title = stringResource(R.string.restore_bytes),
                            value = Formatter.formatShortFileSize(context, preview.byteCount),
                        )
                    }
                }
                item(key = "confirm") {
                    AirSection {
                        ActionRow(
                            stringResource(R.string.restore_confirm),
                            onClick = model::confirm,
                            modifier = Modifier.testTag(RESTORE_CONFIRM_TAG),
                        )
                        RowDivider()
                        ActionRow(
                            stringResource(R.string.restore_other),
                            onClick = model::cancel,
                            modifier = Modifier.testTag(RESTORE_OTHER_TAG),
                        )
                    }
                }
            }
            Status.REVIEWING, Status.CANCELLING, Status.COMMITTING -> item(key = "working") {
                AirSection {
                    MaintenanceProgress(
                        stringResource(
                            when (state.status) {
                                Status.COMMITTING -> R.string.restore_committing
                                Status.CANCELLING -> R.string.restore_cancelling
                                else -> R.string.restore_reading
                            },
                        ),
                    )
                    val progress = state.progress
                    if (state.status == Status.REVIEWING &&
                        progress != null &&
                        progress.completedBytes < progress.totalBytes
                    ) {
                        LinearProgressIndicator(
                            progress = { progress.completedBytes.toFloat() / progress.totalBytes.coerceAtLeast(1) },
                            color = colors.accent,
                            trackColor = colors.separator,
                            modifier = Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, bottom = 20.dp),
                        )
                    }
                    if (state.status == Status.REVIEWING) {
                        ActionRow(
                            stringResource(R.string.restore_cancel),
                            onClick = model::cancel,
                            modifier = Modifier.testTag(RESTORE_CANCEL_TAG),
                        )
                    }
                }
            }
            Status.COMPLETED -> item(key = "done") {
                AirSection(footer = stringResource(R.string.restore_done_text)) {
                    MaintenanceOutcome(
                        Icons.Rounded.CheckCircle,
                        colors.success,
                        stringResource(R.string.restore_done),
                        Modifier.testTag(RESTORE_DONE_TAG),
                    )
                }
            }
            Status.UNCERTAIN -> item(key = "uncertain") {
                AirSection(footer = stringResource(R.string.restore_uncertain_text)) {
                    MaintenanceOutcome(
                        Icons.Rounded.WarningAmber,
                        colors.warning,
                        stringResource(R.string.restore_uncertain),
                        Modifier.testTag(RESTORE_UNCERTAIN_TAG),
                    )
                }
            }
            Status.REVOKED -> Unit
        }
        state.issue?.let { issue ->
            item(key = "issue") {
                MaintenanceNote(
                    stringResource(restoreIssueText(issue)),
                    Modifier.testTag(RESTORE_ISSUE_TAG),
                    problem = true,
                )
            }
        }
    }
}

internal fun restoreIssueText(issue: Issue): Int = when (issue) {
    Issue.SOURCE_REQUIRED -> R.string.restore_issue_folder
    Issue.PASSWORD_REQUIRED -> R.string.restore_issue_password
    Issue.INVALID_BACKUP -> R.string.restore_issue_invalid
    Issue.TARGET_NOT_EMPTY -> R.string.restore_issue_not_empty
    Issue.FAILED -> R.string.restore_issue_failed
    Issue.CLEANUP_FAILED -> R.string.restore_issue_cleanup
    Issue.ADOPTION_REQUIRED -> R.string.maintenance_issue_adoption_required
}
