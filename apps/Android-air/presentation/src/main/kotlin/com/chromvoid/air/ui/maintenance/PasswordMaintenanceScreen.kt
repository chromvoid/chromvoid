package com.chromvoid.air.ui.maintenance

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.maintenance.PasswordMaintenanceModel.Field
import com.chromvoid.air.ui.maintenance.PasswordMaintenanceModel.Status

public const val MAINTENANCE_CLOSE_TAG: String = "maintenance-close"
public const val MAINTENANCE_SUBMIT_TAG: String = "maintenance-submit"
public const val MAINTENANCE_ISSUE_TAG: String = "maintenance-issue"
public const val MAINTENANCE_DONE_TAG: String = "maintenance-done"
public const val MAINTENANCE_UNCERTAIN_TAG: String = "maintenance-uncertain"

public fun maintenanceFieldTag(field: Field): String = "maintenance-${field.name.lowercase()}"

/**
 * Changing the vault or the administrative password, as the iOS sheet: the
 * three fields, one action, and afterwards what happened - including a change
 * that could not be confirmed, which asks for access to be checked rather
 * than offering another attempt.
 */
@Composable
public fun PasswordMaintenanceScreen(model: PasswordMaintenanceModel, onDismiss: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val colors = Air.colors
    val vault = model.kind == PasswordMaintenanceModel.Kind.VAULT
    val requesters = remember { Field.entries.associateWith { FocusRequester() } }
    LaunchedEffect(state.focusRevision) {
        state.invalidField?.let { field -> requesters[field]?.requestFocus() }
    }
    MaintenanceSheet(
        title = stringResource(if (vault) R.string.maint_vault_title else R.string.maint_admin_title),
        onDismiss = onDismiss,
        closeTag = MAINTENANCE_CLOSE_TAG,
        closable = state.status != Status.WORKING,
    ) {
            when (state.status) {
                Status.EDITING -> {
                    item(key = "intro") {
                        MaintenanceNote(
                            stringResource(if (vault) R.string.maint_vault_intro else R.string.maint_admin_intro),
                        )
                    }
                    item(key = "current") {
                        AirSection(header = stringResource(R.string.maint_current)) {
                            SecretRow(model, state, Field.CURRENT, R.string.maint_current, requesters)
                        }
                    }
                    item(key = "new") {
                        AirSection(header = stringResource(R.string.maint_new)) {
                            SecretRow(model, state, Field.NEW, R.string.maint_new, requesters)
                            RowDivider()
                            SecretRow(
                                model,
                                state,
                                Field.CONFIRMATION,
                                R.string.maint_repeat,
                                requesters,
                                placeholder = stringResource(R.string.maint_repeat),
                            )
                        }
                    }
                    item(key = "submit") {
                        AirSection(
                            footer = stringResource(
                                if (vault) R.string.maint_vault_footer else R.string.maint_admin_footer,
                            ),
                        ) {
                            ActionRow(
                                stringResource(R.string.maint_submit),
                                onClick = model::submit,
                                modifier = Modifier.testTag(MAINTENANCE_SUBMIT_TAG),
                            )
                        }
                    }
                }
                Status.WORKING -> item(key = "working") {
                    AirSection(footer = stringResource(R.string.maint_keep_open)) {
                        MaintenanceProgress(stringResource(R.string.maint_working))
                    }
                }
                Status.DONE -> item(key = "done") {
                    Outcome(
                        icon = Icons.Rounded.CheckCircle,
                        tint = colors.success,
                        title = stringResource(R.string.maint_done),
                        message = if (state.backupRecommended) {
                            stringResource(if (vault) R.string.maint_vault_footer else R.string.maint_admin_footer)
                        } else {
                            null
                        },
                        tag = MAINTENANCE_DONE_TAG,
                    )
                }
                Status.UNCERTAIN -> item(key = "uncertain") {
                    Outcome(
                        icon = Icons.Rounded.WarningAmber,
                        tint = colors.warning,
                        title = stringResource(R.string.maint_uncertain),
                        message = stringResource(R.string.maint_uncertain_text),
                        tag = MAINTENANCE_UNCERTAIN_TAG,
                    )
                }
                Status.REVOKED -> Unit
            }
            state.issue?.let { issue ->
                item(key = "issue") {
                    MaintenanceNote(
                        stringResource(maintenanceIssueText(issue)),
                        Modifier.testTag(MAINTENANCE_ISSUE_TAG),
                        problem = true,
                    )
                }
            }
    }
}

@Composable
private fun SecretRow(
    model: PasswordMaintenanceModel,
    state: PasswordMaintenanceModel.State,
    field: Field,
    label: Int,
    requesters: Map<Field, FocusRequester>,
    placeholder: String? = null,
) {
    val colors = Air.colors
    val value = when (field) {
        Field.CURRENT -> state.current
        Field.NEW -> state.replacement
        Field.CONFIRMATION -> state.confirmation
    }
    val caption = stringResource(label)
    Box(
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 20.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (value.isEmpty() && placeholder != null) {
            Text(placeholder, style = AirType.body, color = colors.textSecondary)
        }
        BasicTextField(
            value = value,
            onValueChange = { model.change(field, it) },
            singleLine = true,
            textStyle = AirType.body.copy(color = colors.text),
            cursorBrush = SolidColor(colors.accent),
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Password,
                autoCorrectEnabled = false,
                imeAction = if (field == Field.CONFIRMATION) ImeAction.Done else ImeAction.Next,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(requesters.getValue(field))
                .semantics { contentDescription = caption }
                .testTag(maintenanceFieldTag(field)),
        )
    }
}

@Composable
private fun Outcome(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: androidx.compose.ui.graphics.Color,
    title: String,
    message: String?,
    tag: String,
) {
    AirSection(footer = message) {
        MaintenanceOutcome(icon, tint, title, Modifier.testTag(tag))
    }
}

internal fun maintenanceIssueText(issue: PasswordMaintenanceModel.Issue): Int = when (issue) {
    PasswordMaintenanceModel.Issue.CURRENT_REQUIRED -> R.string.maint_issue_current
    PasswordMaintenanceModel.Issue.NEW_REQUIRED -> R.string.maint_issue_new
    PasswordMaintenanceModel.Issue.MISMATCH -> R.string.maint_issue_mismatch
    PasswordMaintenanceModel.Issue.SAME -> R.string.maint_issue_same
    PasswordMaintenanceModel.Issue.REAUTHENTICATION -> R.string.maint_issue_auth
    PasswordMaintenanceModel.Issue.POLICY -> R.string.maint_issue_policy
    PasswordMaintenanceModel.Issue.CANCELLED -> R.string.maint_issue_cancelled
}
