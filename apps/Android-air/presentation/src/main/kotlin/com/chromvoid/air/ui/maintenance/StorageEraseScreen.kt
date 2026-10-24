package com.chromvoid.air.ui.maintenance

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirSwitchRow
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.maintenance.StorageEraseModel.Issue
import com.chromvoid.air.ui.maintenance.StorageEraseModel.Status

public const val ERASE_CLOSE_TAG: String = "erase-close"
public const val ERASE_ACKNOWLEDGE_TAG: String = "erase-acknowledge"
public const val ERASE_PASSWORD_TAG: String = "erase-password"
public const val ERASE_SUBMIT_TAG: String = "erase-submit"
public const val ERASE_RETRY_TAG: String = "erase-retry"
public const val ERASE_ISSUE_TAG: String = "erase-issue"
public const val ERASE_PROGRESS_TAG: String = "erase-progress"
public const val ERASE_FORGOT_PASSWORD_TAG: String = "erase-forgot-password"

/**
 * Deleting all local data, as the iOS sheet: what goes, then - once Core has
 * reviewed it - an acknowledgement, the administrative password and one
 * destructive action. While the deletion runs the screen cannot be closed.
 */
@Composable
public fun StorageEraseScreen(
    model: StorageEraseModel,
    onDismiss: () -> Unit,
    onResetApp: (() -> Unit)? = null,
) {
    val state by model.state.collectAsStateWithLifecycle()
    MaintenanceSheet(
        title = stringResource(R.string.erase_title),
        onDismiss = onDismiss,
        closeTag = ERASE_CLOSE_TAG,
        closable = state.status != Status.COMMITTING,
        closeLabel = stringResource(R.string.erase_cancel),
    ) {
        item(key = "intro") {
            MaintenanceNote(stringResource(R.string.erase_intro))
            MaintenanceNote(stringResource(R.string.erase_intro_more))
        }
        when (state.status) {
            Status.INITIAL, Status.REVIEWING -> item(key = "preparing") {
                AirSection { MaintenanceProgress(stringResource(R.string.erase_preparing)) }
            }
            Status.READY -> {
                item(key = "confirm") {
                    AirSection {
                        AirSwitchRow(
                            title = stringResource(R.string.erase_acknowledge),
                            checked = state.acknowledged,
                            onCheckedChange = model::acknowledge,
                            modifier = Modifier.testTag(ERASE_ACKNOWLEDGE_TAG),
                        )
                        RowDivider()
                        MaintenanceSecretRow(
                            value = state.password,
                            onValueChange = model::changePassword,
                            label = stringResource(R.string.erase_password),
                            onDone = model::submit,
                            modifier = Modifier.testTag(ERASE_PASSWORD_TAG),
                        )
                    }
                }
                item(key = "submit") {
                    AirSection {
                        ActionRow(
                            stringResource(R.string.erase_submit),
                            onClick = model::submit,
                            destructive = true,
                            modifier = Modifier.testTag(ERASE_SUBMIT_TAG),
                        )
                    }
                }
            }
            Status.COMMITTING -> item(key = "deleting") {
                AirSection(modifier = Modifier.testTag(ERASE_PROGRESS_TAG)) {
                    MaintenanceProgress(stringResource(R.string.erase_deleting))
                }
            }
            Status.FAILED -> item(key = "retry") {
                AirSection {
                    ActionRow(
                        stringResource(R.string.erase_retry),
                        onClick = model::prepare,
                        modifier = Modifier.testTag(ERASE_RETRY_TAG),
                    )
                }
            }
            Status.REVOKED -> item(key = "revoked") { MaintenanceNote(stringResource(R.string.erase_revoked)) }
        }
        state.issue?.let { issue ->
            item(key = "issue") {
                MaintenanceNote(
                    stringResource(eraseIssueText(issue)),
                    Modifier.testTag(ERASE_ISSUE_TAG),
                    problem = true,
                )
            }
        }
        if (onResetApp != null && state.status != Status.COMMITTING && state.status != Status.REVOKED) {
            item(key = "forgot-password") {
                AirSection {
                    ActionRow(
                        stringResource(R.string.app_reset_forgot_password),
                        onClick = onResetApp,
                        modifier = Modifier.testTag(ERASE_FORGOT_PASSWORD_TAG),
                    )
                }
            }
        }
    }
}

internal fun eraseIssueText(issue: Issue): Int = when (issue) {
    Issue.ACKNOWLEDGEMENT_REQUIRED -> R.string.erase_issue_acknowledge
    Issue.PASSWORD_REQUIRED -> R.string.erase_issue_password
    Issue.INVALID_PASSWORD -> R.string.erase_issue_invalid
    Issue.REVIEW_FAILED -> R.string.erase_issue_review
    Issue.REVIEW_EXPIRED -> R.string.erase_issue_expired
    Issue.ADOPTION_REQUIRED -> R.string.maintenance_issue_adoption_required
}
