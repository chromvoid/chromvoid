package com.chromvoid.air.ui.transfer

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CheckCircle
import androidx.compose.material.icons.rounded.DeleteOutline
import androidx.compose.material.icons.rounded.Description
import androidx.compose.material.icons.rounded.FileDownload
import androidx.compose.material.icons.rounded.FileUpload
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.RadioButtonChecked
import androidx.compose.material.icons.rounded.RadioButtonUnchecked
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.bridge.wire.CredentialImportWarningCode
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DoneButton
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.RowDivider
import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

public const val TRANSFER_BACK_TAG: String = "transfer-back"
public const val IMPORT_REPLACE_TAG: String = "import-replace"
public const val IMPORT_CHOOSE_TAG: String = "import-choose"
public const val IMPORT_PASSWORD_TAG: String = "import-password"
public const val IMPORT_PASSWORD_SUBMIT_TAG: String = "import-password-submit"
public const val IMPORT_REVIEW_TAG: String = "import-review"
public const val IMPORT_APPLY_TAG: String = "import-apply"
public const val IMPORT_CONFIRM_TAG: String = "import-confirm"
public const val IMPORT_DONE_TAG: String = "import-done"
public const val IMPORT_ISSUE_TAG: String = "import-issue"
public const val EXPORT_TAG: String = "export"
public const val EXPORT_DONE_TAG: String = "export-done"
public const val CLEAR_TAG: String = "clear"
public const val CLEAR_CONFIRM_TAG: String = "clear-confirm"
public const val CLEAR_DONE_TAG: String = "clear-done"

/**
 * Import, export or clear, each as its own sheet-like screen as on iOS: a
 * Done (or Cancel) on the left, the lock on the right, the form below. Files
 * come and go through the system's document pickers; the app keeps no copy
 * of either direction's document.
 */
@Composable
public fun TransferScreen(
    tools: TransferTools,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onLock: () -> Unit = {},
) {
    val title = when (tools.mode) {
        TransferMode.IMPORT -> R.string.tr_import_title
        TransferMode.EXPORT -> R.string.tr_export_title
        TransferMode.CLEAR -> R.string.tr_clear_title
    }
    AirScreen(
        title = stringResource(title),
        largeTitle = false,
        modifier = modifier,
        leading = { DoneButton(stringResource(R.string.tr_done), onBack, Modifier.testTag(TRANSFER_BACK_TAG)) },
        actions = { PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock) },
    ) {
        item {
            when (tools.mode) {
                TransferMode.IMPORT -> ImportForm(tools.import)
                TransferMode.EXPORT -> ExportForm(tools.export)
                TransferMode.CLEAR -> ClearForm(tools.clear)
            }
        }
    }
}

@Composable
private fun Lead(icon: ImageVector, title: Int, vararg lines: Int, destructive: Boolean = false) {
    AirSection {
        Column(modifier = Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(icon, contentDescription = null, tint = if (destructive) Air.colors.danger else Air.colors.accent)
                Text(stringResource(title), style = AirType.headline, color = Air.colors.text)
            }
            lines.forEach { Text(stringResource(it), style = AirType.subheadline, color = Air.colors.textSecondary) }
        }
    }
}

@Composable
private fun Working(text: Int) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(20.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        CircularProgressIndicator(color = Air.colors.accent, strokeWidth = 2.dp, modifier = Modifier.padding(2.dp))
        Text(stringResource(text), style = AirType.body, color = Air.colors.textSecondary)
    }
}

@Composable
private fun Done(text: Int, tag: String) {
    AirRow(
        stringResource(text),
        icon = Icons.Rounded.CheckCircle,
        iconTint = Air.colors.success,
        modifier = Modifier.testTag(tag),
    )
}

@Composable
private fun ImportForm(model: CredentialImportModel) {
    val state by model.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) model.fileChosen(ContentImportSource(context, uri))
    }
    val choosing = state.status == CredentialImportModel.Status.CHOOSING ||
        state.status == CredentialImportModel.Status.FAILED
    Column {
        if (choosing) {
            Lead(Icons.Rounded.FileDownload, R.string.tr_import_lead, R.string.tr_import_text)
            AirSection(header = stringResource(R.string.tr_import_mode)) {
                ModeRow(R.string.tr_merge, !state.replacing) { model.setReplacing(false) }
                RowDivider()
                ModeRow(
                    R.string.tr_replace,
                    state.replacing,
                    Modifier.testTag(IMPORT_REPLACE_TAG),
                ) { model.setReplacing(true) }
                Text(
                    stringResource(if (state.replacing) R.string.tr_replace_text else R.string.tr_merge_text),
                    style = AirType.footnote,
                    color = Air.colors.textSecondary,
                    modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 14.dp),
                )
            }
        }
        if (state.filename.isNotEmpty()) {
            AirSection(header = stringResource(R.string.tr_selected_file)) {
                AirRow(state.filename, icon = Icons.Rounded.Description)
            }
        }
        if (state.status == CredentialImportModel.Status.PASSWORD) {
            AirSection(header = stringResource(R.string.tr_keepass_password)) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = state.sourcePassword,
                        onValueChange = model::setSourcePassword,
                        label = { Text(stringResource(R.string.tr_keepass_password)) },
                        singleLine = true,
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                        modifier = Modifier.fillMaxWidth().testTag(IMPORT_PASSWORD_TAG),
                    )
                    Text(
                        stringResource(R.string.tr_keepass_text),
                        style = AirType.footnote,
                        color = Air.colors.textSecondary,
                    )
                }
            }
        }
        val preview = state.preview
        if (preview != null && state.status != CredentialImportModel.Status.UNCERTAIN) {
            val finished = state.status == CredentialImportModel.Status.FINISHED
            AirSection(
                header = stringResource(if (finished) R.string.tr_imported else R.string.tr_ready),
                footer = if (finished) null else stringResource(
                    if (preview.source == "csv") R.string.import_csv_note else R.string.import_merge_note,
                ),
                modifier = Modifier.testTag(IMPORT_REVIEW_TAG),
            ) {
                AirRow(stringResource(R.string.tr_credentials), value = preview.entryCount.toString())
                val created = preview.createdEntryCount
                val updated = preview.updatedEntryCount
                if (created != null && updated != null) {
                    RowDivider()
                    AirRow(stringResource(R.string.tr_new), value = created.toString())
                    RowDivider()
                    AirRow(stringResource(R.string.tr_updated), value = updated.toString())
                }
                RowDivider()
                AirRow(stringResource(R.string.tr_groups), value = preview.folderCount.toString())
                RowDivider()
                AirRow(stringResource(R.string.tr_ssh), value = preview.sshKeyCount.toString())
            }
            val warnings = preview.warnings.orEmpty()
            if (warnings.isNotEmpty()) {
                AirSection(header = stringResource(R.string.tr_notes)) {
                    warnings.forEachIndexed { index, warning ->
                        if (index > 0) RowDivider()
                        AirRow(stringResource(warningText(warning.code)), value = warning.count.toString())
                    }
                }
            }
        }
        AirSection {
            state.issue?.let { issue ->
                Text(
                    stringResource(importIssueText(issue)),
                    style = AirType.subheadline,
                    color = Air.colors.danger,
                    modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 14.dp).testTag(IMPORT_ISSUE_TAG),
                )
            }
            when (state.status) {
                CredentialImportModel.Status.CHOOSING, CredentialImportModel.Status.FAILED -> ActionRow(
                    stringResource(R.string.tr_choose_file),
                    onClick = { picker.launch(arrayOf("*/*")) },
                    modifier = Modifier.testTag(IMPORT_CHOOSE_TAG),
                )
                CredentialImportModel.Status.PREPARING -> Working(R.string.tr_checking)
                CredentialImportModel.Status.PASSWORD -> {
                    ActionRow(
                        stringResource(R.string.tr_open_db),
                        onClick = model::submitPassword,
                        modifier = Modifier.testTag(IMPORT_PASSWORD_SUBMIT_TAG),
                    )
                    RowDivider()
                    ActionRow(stringResource(R.string.tr_choose_another), onClick = model::chooseAgain)
                }
                CredentialImportModel.Status.REVIEW, CredentialImportModel.Status.CONFIRMING -> {
                    ActionRow(
                        stringResource(if (state.replacing) R.string.tr_replace else R.string.tr_import_title),
                        onClick = model::requestImport,
                        destructive = state.replacing,
                        modifier = Modifier.testTag(IMPORT_APPLY_TAG),
                    )
                    RowDivider()
                    ActionRow(stringResource(R.string.tr_choose_another), onClick = model::chooseAgain)
                }
                CredentialImportModel.Status.COMMITTING -> Working(R.string.tr_importing)
                CredentialImportModel.Status.FINISHED -> Done(R.string.tr_import_done, IMPORT_DONE_TAG)
                CredentialImportModel.Status.UNCERTAIN, CredentialImportModel.Status.REVOKED -> Unit
            }
        }
    }
    if (state.status == CredentialImportModel.Status.CONFIRMING) {
        AlertDialog(
            onDismissRequest = model::cancelConfirmation,
            title = { Text(stringResource(R.string.import_replace_title)) },
            text = { Text(stringResource(R.string.import_replace_text)) },
            confirmButton = {
                TextButton(onClick = model::confirmReplacement, modifier = Modifier.testTag(IMPORT_CONFIRM_TAG)) {
                    Text(stringResource(R.string.tr_replace), color = Air.colors.danger)
                }
            },
            dismissButton = {
                TextButton(onClick = model::cancelConfirmation) { Text(stringResource(R.string.tr_cancel)) }
            },
        )
    }
}

@Composable
private fun ModeRow(label: Int, selected: Boolean, modifier: Modifier = Modifier, onClick: () -> Unit) {
    AirRow(
        stringResource(label),
        onClick = onClick,
        modifier = modifier,
        trailing = {
            Icon(
                if (selected) Icons.Rounded.RadioButtonChecked else Icons.Rounded.RadioButtonUnchecked,
                contentDescription = null,
                tint = if (selected) Air.colors.accent else Air.colors.textSecondary,
            )
        },
    )
}

@Composable
private fun ExportForm(model: CredentialExportModel) {
    val state by model.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val destination = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) {
        uri ->
        val document = model.state.value.document
        if (uri == null || document == null) {
            model.finish(null)
        } else {
            scope.launch {
                val written = withContext(Dispatchers.IO) {
                    runCatching {
                        context.contentResolver.openOutputStream(uri, "wt")?.use { it.write(document) } != null
                    }.getOrDefault(false)
                }
                model.finish(written)
            }
        }
    }
    LaunchedEffect(state.attempt) {
        if (state.status == CredentialExportModel.Status.CHOOSING_DESTINATION) {
            destination.launch("chromvoid-credentials-${LocalDate.now()}.json")
        }
    }
    Column {
        Lead(Icons.Rounded.FileUpload, R.string.tr_export_lead, R.string.tr_export_warning, R.string.tr_export_excluded)
        AirSection {
            state.issue?.let {
                Text(
                    stringResource(exportIssueText(it)),
                    style = AirType.subheadline,
                    color = Air.colors.danger,
                    modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 14.dp),
                )
            }
            when (state.status) {
                CredentialExportModel.Status.PREPARING, CredentialExportModel.Status.CHOOSING_DESTINATION ->
                    Working(R.string.tr_export_preparing)
                CredentialExportModel.Status.FINISHED -> {
                    Done(R.string.tr_export_saved, EXPORT_DONE_TAG)
                    RowDivider()
                    ActionRow(
                        stringResource(R.string.tr_export_choose),
                        onClick = model::prepare,
                        modifier = Modifier.testTag(EXPORT_TAG),
                    )
                }
                CredentialExportModel.Status.REVOKED -> Unit
                else -> ActionRow(
                    stringResource(R.string.tr_export_choose),
                    onClick = model::prepare,
                    modifier = Modifier.testTag(EXPORT_TAG),
                )
            }
        }
    }
}

@Composable
private fun ClearForm(model: CredentialClearModel) {
    val status by model.state.collectAsStateWithLifecycle()
    Column {
        Lead(
            Icons.Rounded.DeleteOutline,
            R.string.tr_clear_action,
            R.string.tr_clear_text,
            R.string.tr_clear_undo,
            destructive = true,
        )
        AirSection {
            when (status) {
                CredentialClearModel.Status.CLEARING -> Working(R.string.tr_clearing)
                CredentialClearModel.Status.FINISHED -> {
                    Done(R.string.tr_cleared, CLEAR_DONE_TAG)
                    Text(
                        stringResource(R.string.tr_clear_kept),
                        style = AirType.footnote,
                        color = Air.colors.textSecondary,
                        modifier = Modifier.padding(start = 20.dp, end = 20.dp, bottom = 14.dp),
                    )
                }
                CredentialClearModel.Status.DENIED -> Text(
                    stringResource(R.string.tr_clear_denied),
                    color = Air.colors.danger,
                    modifier = Modifier.padding(20.dp),
                )
                CredentialClearModel.Status.UNCERTAIN -> Text(
                    stringResource(R.string.tr_clear_uncertain),
                    color = Air.colors.danger,
                    modifier = Modifier.padding(20.dp),
                )
                CredentialClearModel.Status.REVOKED -> Unit
                else -> ActionRow(
                    stringResource(R.string.tr_clear_action),
                    onClick = model::request,
                    destructive = true,
                    modifier = Modifier.testTag(CLEAR_TAG),
                )
            }
        }
    }
    if (status == CredentialClearModel.Status.CONFIRMING) {
        AlertDialog(
            onDismissRequest = model::cancel,
            title = { Text(stringResource(R.string.tr_clear_confirm)) },
            text = { Text(stringResource(R.string.tr_clear_confirm_text)) },
            confirmButton = {
                TextButton(onClick = model::confirm, modifier = Modifier.testTag(CLEAR_CONFIRM_TAG)) {
                    Text(stringResource(R.string.tr_clear_all), color = Air.colors.danger)
                }
            },
            dismissButton = { TextButton(onClick = model::cancel) { Text(stringResource(R.string.tr_cancel)) } },
        )
    }
}

private fun importIssueText(issue: CredentialImportModel.Issue): Int = when (issue) {
    CredentialImportModel.Issue.UNREADABLE -> R.string.import_issue_unreadable
    CredentialImportModel.Issue.TOO_LARGE -> R.string.import_issue_too_large
    CredentialImportModel.Issue.INCOMPLETE -> R.string.import_issue_incomplete
    CredentialImportModel.Issue.UNSUPPORTED -> R.string.import_issue_unsupported
    CredentialImportModel.Issue.PASSWORD_INVALID -> R.string.import_issue_password
    CredentialImportModel.Issue.CHANGED -> R.string.import_issue_changed
    CredentialImportModel.Issue.UNCERTAIN -> R.string.import_issue_uncertain
}

private fun exportIssueText(issue: CredentialExportModel.Issue): Int = when (issue) {
    CredentialExportModel.Issue.TOO_LARGE -> R.string.export_issue_too_large
    CredentialExportModel.Issue.NOT_PREPARED -> R.string.export_issue_not_prepared
    CredentialExportModel.Issue.NOT_SAVED -> R.string.export_issue_not_saved
}

private fun warningText(code: CredentialImportWarningCode): Int = when (code) {
    CredentialImportWarningCode.UnsupportedRecords -> R.string.import_warning_unsupported
    CredentialImportWarningCode.PasskeysOmitted -> R.string.import_warning_passkeys
    CredentialImportWarningCode.OtpInNote -> R.string.import_warning_otp
    CredentialImportWarningCode.CardInNote -> R.string.import_warning_card
    CredentialImportWarningCode.EntryLimit -> R.string.import_warning_limit
    CredentialImportWarningCode.InvalidRows -> R.string.import_warning_rows
    CredentialImportWarningCode.AttachmentsOmitted -> R.string.import_warning_attachments
    CredentialImportWarningCode.IconsOmitted -> R.string.import_warning_icons
    CredentialImportWarningCode.UnmappedColumns -> R.string.import_warning_columns
    CredentialImportWarningCode.RecordsOmitted -> R.string.import_warning_omitted
    CredentialImportWarningCode.LegacyIdentifiersMatched -> R.string.import_warning_legacy
}
