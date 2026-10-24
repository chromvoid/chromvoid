package com.chromvoid.air.ui.maintenance

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirSection

public const val BACKUP_CLOSE_TAG: String = "backup-close"
public const val BACKUP_DESTINATION_TAG: String = "backup-destination"
public const val BACKUP_PASSWORD_TAG: String = "backup-password"
public const val BACKUP_SUBMIT_TAG: String = "backup-submit"
public const val BACKUP_CANCEL_TAG: String = "backup-cancel"
public const val BACKUP_ISSUE_TAG: String = "backup-issue"
public const val BACKUP_DONE_TAG: String = "backup-done"

/**
 * Saving a backup, as the iOS sheet: the folder, the administrative password
 * and one action, then what happened. The folder comes from the system
 * picker, so nothing outside it is ever written.
 */
@Composable
public fun StorageBackupScreen(model: StorageBackupModel, onDismiss: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val colors = Air.colors
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocumentTree()) { tree: Uri? ->
        if (tree != null) model.chooseDestination(tree)
    }
    val working = state.status == StorageBackupModel.Status.WORKING ||
        state.status == StorageBackupModel.Status.CANCELLING
    MaintenanceSheet(
        title = stringResource(R.string.backup_title),
        onDismiss = onDismiss,
        closeTag = BACKUP_CLOSE_TAG,
        closable = !working,
    ) {
        when (state.status) {
            StorageBackupModel.Status.EDITING -> {
                item(key = "intro") { MaintenanceNote(stringResource(R.string.backup_intro)) }
                item(key = "destination") {
                    AirSection(header = stringResource(R.string.backup_destination)) {
                        AirRow(
                            title = state.destination ?: stringResource(R.string.backup_choose),
                            chevron = true,
                            onClick = { picker.launch(null) },
                            modifier = Modifier.testTag(BACKUP_DESTINATION_TAG),
                        )
                    }
                }
                item(key = "password") {
                    AirSection(header = stringResource(R.string.backup_password)) {
                        MaintenanceSecretRow(
                            value = state.password,
                            onValueChange = model::changePassword,
                            label = stringResource(R.string.backup_password),
                            onDone = model::submit,
                            modifier = Modifier.testTag(BACKUP_PASSWORD_TAG),
                            placeholder = null,
                        )
                    }
                }
                item(key = "submit") {
                    AirSection {
                        ActionRow(
                            stringResource(R.string.backup_submit),
                            onClick = model::submit,
                            modifier = Modifier.testTag(BACKUP_SUBMIT_TAG),
                        )
                    }
                }
            }
            StorageBackupModel.Status.WORKING, StorageBackupModel.Status.CANCELLING -> item(key = "working") {
                val cancelling = state.status == StorageBackupModel.Status.CANCELLING
                AirSection {
                    MaintenanceProgress(
                        stringResource(if (cancelling) R.string.backup_cancelling else R.string.backup_working),
                    )
                    state.progress?.let { progress ->
                        AirRow(
                            title = stringResource(
                                R.string.backup_progress,
                                progress.artifact.toString(),
                                progress.total.toString(),
                            ),
                        )
                    }
                    if (!cancelling) {
                        ActionRow(
                            stringResource(R.string.backup_cancel),
                            onClick = model::cancel,
                            destructive = true,
                            modifier = Modifier.testTag(BACKUP_CANCEL_TAG),
                        )
                    }
                }
            }
            StorageBackupModel.Status.DONE -> item(key = "done") {
                AirSection(footer = stringResource(R.string.backup_saved_text)) {
                    MaintenanceOutcome(
                        Icons.Rounded.CheckCircle,
                        colors.success,
                        stringResource(R.string.backup_saved),
                        Modifier.testTag(BACKUP_DONE_TAG),
                    )
                    state.savedTo?.let { AirRow(title = it) }
                }
            }
            StorageBackupModel.Status.REVOKED -> Unit
        }
        state.issue?.let { issue ->
            item(key = "issue") {
                MaintenanceNote(
                    stringResource(backupIssueText(issue)),
                    Modifier.testTag(BACKUP_ISSUE_TAG),
                    problem = true,
                )
            }
        }
    }
}

internal fun backupIssueText(issue: StorageBackupModel.Issue): Int = when (issue) {
    StorageBackupModel.Issue.DESTINATION_REQUIRED -> R.string.backup_issue_directory
    StorageBackupModel.Issue.PASSWORD_REQUIRED -> R.string.backup_issue_password
    StorageBackupModel.Issue.REAUTHENTICATION -> R.string.backup_issue_auth
    StorageBackupModel.Issue.FAILED -> R.string.backup_issue_failed
    StorageBackupModel.Issue.CLEANUP_FAILED -> R.string.backup_issue_cleanup
}
