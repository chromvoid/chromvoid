package com.chromvoid.air.ui.maintenance

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.maintenance.AppResetModel.Status

public const val APP_RESET_CLOSE_TAG: String = "app-reset-close"
public const val APP_RESET_ACKNOWLEDGE_TAG: String = "app-reset-acknowledge"
public const val APP_RESET_REVIEW_TAG: String = "app-reset-review"
public const val APP_RESET_CONFIRMATION_TAG: String = "app-reset-confirmation"
public const val APP_RESET_CONFIRM_TAG: String = "app-reset-confirm"
public const val APP_RESET_CANCEL_TAG: String = "app-reset-cancel"
public const val APP_RESET_ISSUE_TAG: String = "app-reset-issue"
public const val APP_RESET_PROGRESS_TAG: String = "app-reset-progress"
public const val APP_RESET_DATA_WARNING_TAG: String = "app-reset-data-warning"
public const val APP_RESET_RECOVERY_WARNING_TAG: String = "app-reset-recovery-warning"

/** Android clears the whole application's data; the shared Core erase remains password protected. */
@Composable
public fun AppResetScreen(model: AppResetModel, onDismiss: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val acknowledgement = stringResource(R.string.app_reset_acknowledge)
    MaintenanceSheet(
        title = stringResource(R.string.app_reset_title),
        onDismiss = onDismiss,
        closeTag = APP_RESET_CLOSE_TAG,
        closable = state.status != Status.REQUESTED,
        closeLabel = stringResource(R.string.erase_cancel),
    ) {
        item(key = "data-warning") {
            AirSection(
                header = stringResource(R.string.app_reset_data_heading),
                modifier = Modifier.testTag(APP_RESET_DATA_WARNING_TAG),
            ) {
                Text(
                    stringResource(R.string.app_reset_warning),
                    style = AirType.body,
                    color = Air.colors.text,
                    modifier = Modifier.padding(20.dp),
                )
            }
        }
        item(key = "recovery-warning") {
            AirSection(
                header = stringResource(R.string.app_reset_recovery_heading),
                modifier = Modifier.testTag(APP_RESET_RECOVERY_WARNING_TAG),
            ) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        stringResource(R.string.app_reset_backup),
                        style = AirType.body,
                        color = Air.colors.text,
                    )
                    Text(
                        stringResource(R.string.app_reset_passwords),
                        style = AirType.body,
                        color = Air.colors.text,
                    )
                }
            }
        }
        item(key = "restart") {
            MaintenanceNote(stringResource(R.string.app_reset_restart))
        }
        when (state.status) {
            Status.WARNING, Status.CONFIRMING -> {
                item(key = "acknowledgement") {
                    AirSection {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .testTag(APP_RESET_ACKNOWLEDGE_TAG)
                                .toggleable(
                                    value = state.acknowledged,
                                    role = Role.Checkbox,
                                    onValueChange = model::acknowledge,
                                )
                                .heightIn(min = 56.dp)
                                .padding(horizontal = 20.dp, vertical = 12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(12.dp),
                        ) {
                            Checkbox(
                                checked = state.acknowledged,
                                onCheckedChange = null,
                                modifier = Modifier.clearAndSetSemantics {},
                                colors = CheckboxDefaults.colors(
                                    checkedColor = Air.colors.button,
                                    checkmarkColor = Air.colors.onButton,
                                    uncheckedColor = Air.colors.textSecondary,
                                ),
                            )
                            Text(acknowledgement, style = AirType.body, color = Air.colors.text)
                        }
                    }
                }
                state.issue?.let {
                    item(key = "issue") {
                        MaintenanceNote(
                            stringResource(resetIssueText(it)),
                            Modifier.testTag(APP_RESET_ISSUE_TAG),
                            problem = true,
                        )
                    }
                }
                item(key = "review") {
                    AirSection {
                        ActionRow(
                            stringResource(R.string.app_reset_review),
                            onClick = model::review,
                            modifier = Modifier.testTag(APP_RESET_REVIEW_TAG),
                        )
                    }
                }
            }
            Status.REQUESTED -> item(key = "progress") {
                AirSection(modifier = Modifier.testTag(APP_RESET_PROGRESS_TAG)) {
                    MaintenanceProgress(stringResource(R.string.app_reset_requested))
                }
            }
            Status.FAILED -> item(key = "failed") {
                MaintenanceNote(
                    stringResource(state.issue?.let(::resetIssueText) ?: R.string.app_reset_failed),
                    Modifier.testTag(APP_RESET_ISSUE_TAG),
                    problem = true,
                )
                AirSection {
                    ActionRow(stringResource(R.string.app_reset_retry), onClick = model::retry)
                }
            }
            Status.REVOKED -> Unit
        }
    }
    if (state.status == Status.CONFIRMING) {
        AlertDialog(
            onDismissRequest = model::cancelConfirmation,
            title = { Text(stringResource(R.string.app_reset_confirm_title)) },
            text = { Text(stringResource(R.string.app_reset_confirm_text)) },
            confirmButton = {
                TextButton(onClick = model::confirm, modifier = Modifier.testTag(APP_RESET_CONFIRM_TAG)) {
                    Text(stringResource(R.string.app_reset_confirm), color = Air.colors.danger)
                }
            },
            dismissButton = {
                TextButton(
                    onClick = model::cancelConfirmation,
                    modifier = Modifier.testTag(APP_RESET_CANCEL_TAG),
                ) {
                    Text(stringResource(R.string.erase_cancel), color = Air.colors.accent)
                }
            },
            modifier = Modifier.testTag(APP_RESET_CONFIRMATION_TAG),
        )
    }
}

private fun resetIssueText(issue: AppResetModel.Issue): Int = when (issue) {
    AppResetModel.Issue.ACKNOWLEDGEMENT_REQUIRED -> R.string.app_reset_issue_acknowledge
    AppResetModel.Issue.ADOPTION_REQUIRED -> R.string.maintenance_issue_adoption_required
}
