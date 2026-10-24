package com.chromvoid.air.ui.ssh

import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.Terminal
import androidx.compose.material.icons.rounded.UnfoldMore
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.bridge.wire.SSHKeySummary
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionPill
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSearchField
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.PillText
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.SectionFooter
import com.chromvoid.air.ui.design.TabBarClearance
import com.chromvoid.air.ui.design.airEditableField
import com.chromvoid.air.ui.root.CoversTabBar
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

public const val SSH_BACK_TAG: String = "ssh-back"
public const val SSH_SEARCH_TAG: String = "ssh-search"
public const val SSH_CREATE_TAG: String = "ssh-create"
public const val SSH_EMPTY_TAG: String = "ssh-empty"
public const val SSH_EMPTY_ADD_TAG: String = "ssh-empty-add"
public const val SSH_NO_MATCH_TAG: String = "ssh-no-match"
public const val SSH_CLEAR_FILTERS_TAG: String = "ssh-clear-filters"
public const val SSH_RELOAD_TAG: String = "ssh-reload"
public const val SSH_SAVE_TAG: String = "ssh-save"
public const val SSH_KEY_TEXT_TAG: String = "ssh-key-text"
public const val SSH_ISSUE_TAG: String = "ssh-issue"
public const val SSH_DETAIL_BACK_TAG: String = "ssh-detail-back"
public const val SSH_FINGERPRINT_TAG: String = "ssh-fingerprint"
public const val SSH_RENAME_TAG: String = "ssh-rename"
public const val SSH_NAME_TAG: String = "ssh-name"
public const val SSH_RENAME_SAVE_TAG: String = "ssh-rename-save"
public const val SSH_COPY_PUBLIC_TAG: String = "ssh-copy-public"
public const val SSH_EXPORT_PRIVATE_TAG: String = "ssh-export-private"
public const val SSH_EXPORT_CONFIRM_TAG: String = "ssh-export-confirm"
public const val SSH_EXPORT_PASSPHRASE_TAG: String = "ssh-export-passphrase"
public const val SSH_DELETE_TAG: String = "ssh-delete"
public const val SSH_DELETE_CONFIRM_TAG: String = "ssh-delete-confirm"

public fun sshRowTag(id: String): String = "ssh-row-$id"

public fun sshModeTag(mode: SshCreationModel.Mode): String = "ssh-mode-${mode.name.lowercase()}"

public fun sshAlgorithmTag(algorithm: SshCreationModel.Algorithm): String = "ssh-algorithm-${algorithm.wire}"

public fun sshFieldTag(field: SshCreationModel.Field): String = "ssh-field-${field.name.lowercase()}"

/**
 * The SSH keys collection, as the iOS SSH screen: a large title with the lock
 * and add, the search field, the key type filter, the keys. The creation form
 * or one key's page is drawn in its place; Back closes whichever is on top.
 * No SSH agent is offered: on Android the keys are kept, shown and exported.
 */
@Composable
public fun SshScreen(model: SshModel, onBack: () -> Unit, modifier: Modifier = Modifier, onLock: () -> Unit = {}) {
    val creation by model.creation.collectAsStateWithLifecycle()
    val selected by model.selected.collectAsStateWithLifecycle()
    val form = creation
    val open = selected
    when {
        form != null -> {
            val close = { if (form.requestClose()) model.endCreation() }
            BackHandler(onBack = close)
            SshCreationScreen(form, onClose = close, onDiscard = model::endCreation, modifier = modifier)
        }
        open != null -> {
            BackHandler(onBack = model::closeDetail)
            SshDetailScreen(open, onBack = model::closeDetail, onLock = onLock, modifier = modifier)
        }
        else -> {
            BackHandler(onBack = onBack)
            SshList(model, onBack, onLock, modifier)
        }
    }
}

@Composable
private fun SshList(model: SshModel, onBack: () -> Unit, onLock: () -> Unit, modifier: Modifier) {
    val state by model.state.collectAsStateWithLifecycle()
    AirScreen(
        title = stringResource(R.string.sk_title),
        modifier = modifier,
        onBack = onBack,
        backTag = SSH_BACK_TAG,
        backDescription = stringResource(R.string.detail_back),
        actions = {
            PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock)
            PillIcon(
                Icons.Rounded.Add,
                stringResource(R.string.sk_add),
                onClick = model::beginCreation,
                modifier = Modifier.testTag(SSH_CREATE_TAG),
            )
        },
    ) {
        item(key = "search") {
            AirSearchField(
                value = state.query,
                onValueChange = model::search,
                placeholder = stringResource(R.string.sk_search),
                fieldModifier = Modifier.testTag(SSH_SEARCH_TAG),
            )
        }
        item(key = "type") {
            AirSection(footer = stringResource(R.string.sk_footer)) {
                TypePicker(state.keyType, model::setKeyType)
            }
        }
        when (state.status) {
            SshModel.Status.LOADING -> item(key = "loading") {
                Box(modifier = Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Air.colors.accent)
                }
            }
            SshModel.Status.STALE, SshModel.Status.FAILED -> item(key = "failed") {
                AirSection {
                    Text(
                        stringResource(
                            if (state.status == SshModel.Status.STALE) R.string.sk_stale else R.string.ssh_failed,
                        ),
                        style = AirType.body,
                        color = Air.colors.textSecondary,
                        modifier = Modifier.padding(20.dp),
                    )
                    RowDivider()
                    ActionRow(
                        stringResource(R.string.sk_reload),
                        onClick = model::reload,
                        modifier = Modifier.testTag(SSH_RELOAD_TAG),
                    )
                }
            }
            SshModel.Status.REVOKED -> Unit
            SshModel.Status.READY -> item(key = "keys") {
                AirSection {
                    if (state.keys.isEmpty()) {
                        Text(
                            stringResource(if (state.hasFilters) R.string.sk_no_matches else R.string.sk_empty),
                            style = AirType.body,
                            color = Air.colors.textSecondary,
                            modifier = Modifier.padding(20.dp)
                                .testTag(if (state.hasFilters) SSH_NO_MATCH_TAG else SSH_EMPTY_TAG),
                        )
                        RowDivider()
                        if (state.hasFilters) {
                            ActionRow(
                                stringResource(R.string.sk_clear_filters),
                                onClick = model::clearFilters,
                                modifier = Modifier.testTag(SSH_CLEAR_FILTERS_TAG),
                            )
                        } else {
                            ActionRow(
                                stringResource(R.string.sk_add),
                                onClick = model::beginCreation,
                                modifier = Modifier.testTag(SSH_EMPTY_ADD_TAG),
                            )
                        }
                    }
                    state.keys.forEachIndexed { index, row ->
                        if (index > 0) RowDivider(inset = 58.dp)
                        KeyRow(row, onClick = { model.select(row.key.id) })
                    }
                    if (state.canLoadMore) {
                        RowDivider()
                        ActionRow(
                            stringResource(R.string.sk_load_more),
                            onClick = model::loadMore,
                            enabled = !state.loadingMore,
                        )
                    }
                }
            }
        }
        item(key = "clearance") { TabBarClearance() }
    }
}

/** "Key type  All types ⇕", the iOS picker row. */
@Composable
private fun TypePicker(selected: SshModel.KeyType, onSelect: (SshModel.KeyType) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        AirRow(
            stringResource(R.string.sk_key_type),
            value = selected.wire?.uppercase() ?: stringResource(R.string.sk_all_types),
            onClick = { open = true },
            trailing = { Icon(Icons.Rounded.UnfoldMore, contentDescription = null, tint = Air.colors.textSecondary) },
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            SshModel.KeyType.entries.forEach { type ->
                DropdownMenuItem(
                    text = { Text(
                        type.wire?.uppercase() ?: stringResource(R.string.sk_all_types),
                        style = AirType.body,
                    ) },
                    leadingIcon = {
                        Icon(
                            Icons.Rounded.Check,
                            contentDescription = null,
                            tint = if (type == selected) Air.colors.accent else Air.colors.card,
                        )
                    },
                    onClick = {
                        open = false
                        onSelect(type)
                    },
                )
            }
        }
    }
}

@Composable
private fun KeyRow(row: SSHKeySummary, onClick: () -> Unit) {
    AirRow(
        row.key.name?.ifBlank { null } ?: stringResource(R.string.sk_key),
        subtitle = listOfNotNull(
            row.key.type.uppercase(),
            row.sourceTitle,
        ).joinToString(" · ") + "\n" + row.key.fingerprint,
        icon = Icons.Rounded.Terminal,
        chevron = true,
        onClick = onClick,
        modifier = Modifier.testTag(sshRowTag(row.key.id)),
    )
}

@Composable
private fun SshCreationScreen(
    model: SshCreationModel,
    onClose: () -> Unit,
    onDiscard: () -> Unit,
    modifier: Modifier,
) {
    CoversTabBar()
    val pane = stringResource(R.string.sk_add)
    val state by model.state.collectAsStateWithLifecycle()
    val requesters = remember { SshCreationModel.Field.entries.associateWith { FocusRequester() } }
    val listState = rememberLazyListState()
    LaunchedEffect(state.focusRequest) {
        if (state.focusRequest == 0) return@LaunchedEffect
        val field = state.focus ?: return@LaunchedEffect
        val key = when (field) {
            SshCreationModel.Field.NAME -> "mode"
            SshCreationModel.Field.COMMENT -> "generate"
            SshCreationModel.Field.PRIVATE_KEY, SshCreationModel.Field.PASSPHRASE -> "import"
        }
        if (listState.layoutInfo.visibleItemsInfo.none { it.key == key }) {
            listState.animateScrollToItem(if (field == SshCreationModel.Field.NAME) 0 else 1)
        }
        requesters.getValue(field).requestFocus()
    }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val open = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) {
            scope.launch {
                val text = withContext(Dispatchers.IO) {
                    runCatching {
                        context.contentResolver.openInputStream(uri)?.use { input ->
                            val bytes = input.readNBytesCompat(SSH_KEY_FILE_LIMIT_BYTES + 1)
                            bytes.takeIf { it.size <= SSH_KEY_FILE_LIMIT_BYTES }?.toString(Charsets.UTF_8)
                        }
                    }.getOrNull()
                }
                model.fileRead(text)
            }
        }
    }
    val editing = state.status == SshCreationModel.Status.EDITING
    val generate = state.mode == SshCreationModel.Mode.GENERATE
    AirScreen(
        title = pane,
        largeTitle = false,
        modifier = modifier.imePadding().semantics { paneTitle = pane },
        state = listState,
        leading = { ActionPill { PillText(stringResource(R.string.sk_cancel), onClose) } },
        actions = {
            PillText(
                stringResource(if (generate) R.string.sk_generate else R.string.sk_import),
                onClick = model::submit,
                enabled = editing,
                emphasized = true,
                modifier = Modifier.testTag(SSH_SAVE_TAG),
            )
        },
    ) {
        item(key = "mode") {
            AirSection {
                Column(modifier = Modifier.padding(16.dp)) {
                    SingleChoiceSegmentedButtonRow(modifier = Modifier.fillMaxWidth()) {
                        SshCreationModel.Mode.entries.forEachIndexed { index, mode ->
                            SegmentedButton(
                                selected = state.mode == mode,
                                onClick = { model.setMode(mode) },
                                shape = SegmentedButtonDefaults.itemShape(index, SshCreationModel.Mode.entries.size),
                                modifier = Modifier.testTag(sshModeTag(mode)),
                            ) {
                                val label = if (mode == SshCreationModel.Mode.GENERATE) {
                                    R.string.sk_generate
                                } else {
                                    R.string.sk_import
                                }
                                Text(stringResource(label))
                            }
                        }
                    }
                }
                RowDivider()
                InputRow(model, state, SshCreationModel.Field.NAME, R.string.sk_name, requesters)
            }
        }
        if (generate) {
            item(key = "generate") {
                AirSection(footer = stringResource(R.string.sk_rsa_note)) {
                    AlgorithmPicker(state.algorithm, model::setAlgorithm)
                    RowDivider()
                    InputRow(model, state, SshCreationModel.Field.COMMENT, R.string.sk_comment, requesters)
                }
            }
        } else {
            item(key = "import") {
                AirSection(
                    header = stringResource(R.string.sk_private_key_section),
                    footer = stringResource(R.string.sk_passphrase_note),
                ) {
                    ActionRow(
                        stringResource(R.string.sk_choose_file),
                        onClick = { open.launch(arrayOf("*/*")) },
                        enabled = editing,
                    )
                    RowDivider()
                    InputRow(
                        model,
                        state,
                        SshCreationModel.Field.PRIVATE_KEY,
                        R.string.sk_private_key,
                        requesters,
                        monospace = true,
                        lines = 6,
                    )
                    RowDivider()
                    InputRow(
                        model,
                        state,
                        SshCreationModel.Field.PASSPHRASE,
                        R.string.sk_passphrase,
                        requesters,
                        secret = true,
                    )
                }
            }
        }
        state.issue?.let { issue ->
            item(key = "issue") {
                AirSection {
                    Text(
                        stringResource(creationIssueText(issue)),
                        color = Air.colors.danger,
                        style = AirType.subheadline,
                        modifier = Modifier.padding(20.dp).testTag(SSH_ISSUE_TAG),
                    )
                }
            }
        }
        if (state.status == SshCreationModel.Status.SAVING) {
            item(key = "saving") {
                Box(modifier = Modifier.fillMaxWidth().padding(24.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Air.colors.accent)
                }
            }
        }
    }
    if (state.confirmingDiscard) {
        AlertDialog(
            onDismissRequest = model::cancelDiscard,
            title = { Text(stringResource(R.string.sk_discard_q)) },
            confirmButton = { TextButton(
                onClick = onDiscard,
            ) { Text(stringResource(R.string.sk_discard), color = Air.colors.danger) } },
            dismissButton = { TextButton(onClick = model::cancelDiscard) { Text(stringResource(R.string.sk_cancel)) } },
        )
    }
}

@Composable
private fun AlgorithmPicker(selected: SshCreationModel.Algorithm, onSelect: (SshCreationModel.Algorithm) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Box {
        AirRow(
            stringResource(R.string.sk_key_type),
            value = algorithmLabel(selected),
            onClick = { open = true },
            trailing = { Icon(Icons.Rounded.UnfoldMore, contentDescription = null, tint = Air.colors.textSecondary) },
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            SshCreationModel.Algorithm.entries.forEach { algorithm ->
                DropdownMenuItem(
                    text = { Text(algorithmLabel(algorithm), style = AirType.body) },
                    leadingIcon = {
                        Icon(
                            Icons.Rounded.Check,
                            contentDescription = null,
                            tint = if (algorithm == selected) Air.colors.accent else Air.colors.card,
                        )
                    },
                    onClick = {
                        open = false
                        onSelect(algorithm)
                    },
                    modifier = Modifier.testTag(sshAlgorithmTag(algorithm)),
                )
            }
        }
    }
}

@Composable
private fun InputRow(
    model: SshCreationModel,
    state: SshCreationModel.State,
    field: SshCreationModel.Field,
    label: Int,
    requesters: Map<SshCreationModel.Field, FocusRequester>,
    secret: Boolean = false,
    monospace: Boolean = false,
    lines: Int = 1,
) {
    val caption = stringResource(label)
    val value = state.value(field)
    val error = state.errors[field]?.let { stringResource(creationIssueText(it)) }
    Column(
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 20.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(caption, style = AirType.footnote, color = Air.colors.textSecondary)
        BasicTextField(
            value = value,
            onValueChange = { model.change(field, it) },
            enabled = state.status == SshCreationModel.Status.EDITING,
            singleLine = lines == 1,
            minLines = lines,
            textStyle = (if (monospace) AirType.footnote.copy(fontFamily = FontFamily.Monospace) else AirType.body)
                .copy(color = Air.colors.text),
            cursorBrush = SolidColor(Air.colors.accent),
            visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions = KeyboardOptions(
                keyboardType = if (secret) KeyboardType.Password else KeyboardType.Text,
                autoCorrectEnabled = false,
            ),
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(requesters.getValue(field))
                .airEditableField(caption, error)
                .testTag(sshFieldTag(field)),
        )
    }
}

@Composable
private fun SshDetailScreen(model: SshDetailModel, onBack: () -> Unit, onLock: () -> Unit, modifier: Modifier) {
    val state by model.state.collectAsStateWithLifecycle()
    val row = state.row ?: return
    val nameRequester = remember { FocusRequester() }
    val listState = rememberLazyListState()
    LaunchedEffect(state.focusRequest) {
        if (state.focusRequest == 0 || !state.editing) return@LaunchedEffect
        if (listState.layoutInfo.visibleItemsInfo.none { it.key == "edit" }) listState.animateScrollToItem(1)
        nameRequester.requestFocus()
    }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val save = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) {
        uri ->
        val document = model.state.value.document
        if (uri == null || document == null) {
            model.cancelExport()
        } else {
            scope.launch {
                val written = withContext(Dispatchers.IO) {
                    runCatching {
                        context.contentResolver.openOutputStream(uri, "wt")?.use {
                            it.write(document.content.toByteArray())
                        } != null
                    }.getOrDefault(false)
                }
                model.finishExport(written)
            }
        }
    }
    LaunchedEffect(state.document) {
        state.document?.let { save.launch(it.filename) }
    }
    val ready = state.status == SshDetailModel.Status.READY
    AirScreen(
        title = stringResource(R.string.sk_key),
        largeTitle = false,
        modifier = modifier,
        state = listState,
        onBack = onBack,
        backTag = SSH_DETAIL_BACK_TAG,
        backDescription = stringResource(R.string.detail_back),
        actions = { PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock) },
    ) {
        item(key = "identity") {
            AirSection {
                AirRow(row.key.name?.ifBlank { null } ?: stringResource(R.string.sk_key), icon = Icons.Rounded.Terminal)
                RowDivider()
                AirRow(stringResource(R.string.sk_key_type), value = row.key.type.uppercase())
                RowDivider()
                Text(
                    row.key.fingerprint,
                    style = AirType.footnote.copy(fontFamily = FontFamily.Monospace),
                    color = Air.colors.text,
                    modifier = Modifier.padding(20.dp).testTag(SSH_FINGERPRINT_TAG),
                )
                row.key.comment?.takeIf { it.isNotBlank() }?.let {
                    RowDivider()
                    Text(it, style = AirType.body, color = Air.colors.textSecondary, modifier = Modifier.padding(20.dp))
                }
                row.sourceTitle?.let {
                    RowDivider()
                    AirRow(stringResource(R.string.ssh_linked), value = it)
                }
            }
        }
        when {
            state.editing -> item(key = "edit") {
                val caption = stringResource(R.string.sk_name)
                val error = state.issue?.takeIf { it == SshDetailModel.Issue.UPDATE_REFUSED }
                    ?.let { stringResource(detailIssueText(it)) }
                AirSection(header = stringResource(R.string.sk_edit)) {
                    Column(
                        modifier = Modifier.padding(horizontal = 20.dp, vertical = 14.dp),
                        verticalArrangement = Arrangement.spacedBy(3.dp),
                    ) {
                        Text(caption, style = AirType.footnote, color = Air.colors.textSecondary)
                        BasicTextField(
                            value = state.name,
                            onValueChange = model::changeName,
                            singleLine = true,
                            textStyle = AirType.body.copy(color = Air.colors.text),
                            cursorBrush = SolidColor(Air.colors.accent),
                            modifier = Modifier
                                .fillMaxWidth()
                                .focusRequester(nameRequester)
                                .airEditableField(caption, error)
                                .testTag(SSH_NAME_TAG),
                        )
                    }
                    RowDivider()
                    ActionRow(
                        stringResource(R.string.sk_save_changes),
                        onClick = model::save,
                        enabled = ready,
                        modifier = Modifier.testTag(SSH_RENAME_SAVE_TAG),
                    )
                    RowDivider()
                    ActionRow(stringResource(R.string.sk_cancel), onClick = model::cancelEdit)
                }
            }
            state.exportKind != null -> item(key = "export") {
                val private = state.exportKind == SshDetailModel.ExportKind.PRIVATE_KEY
                AirSection(
                    header = stringResource(if (private) R.string.sk_export_private else R.string.sk_export_public),
                    footer = if (private) stringResource(R.string.sk_export_note) else null,
                ) {
                    if (private) {
                        val caption = stringResource(R.string.sk_export_passphrase)
                        val error = state.issue?.takeIf { it == SshDetailModel.Issue.EXPORT_FAILED }
                            ?.let { stringResource(detailIssueText(it)) }
                        Column(
                            modifier = Modifier.padding(horizontal = 20.dp, vertical = 14.dp),
                            verticalArrangement = Arrangement.spacedBy(3.dp),
                        ) {
                            Text(caption, style = AirType.footnote, color = Air.colors.textSecondary)
                            BasicTextField(
                                value = state.passphrase,
                                onValueChange = model::changePassphrase,
                                singleLine = true,
                                textStyle = AirType.body.copy(color = Air.colors.text),
                                cursorBrush = SolidColor(Air.colors.accent),
                                visualTransformation = PasswordVisualTransformation(),
                                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .airEditableField(caption, error)
                                    .testTag(SSH_EXPORT_PASSPHRASE_TAG),
                            )
                        }
                        RowDivider()
                    }
                    ActionRow(
                        stringResource(R.string.sk_choose_location),
                        onClick = { model.export() },
                        enabled = ready,
                        modifier = Modifier.testTag(SSH_EXPORT_CONFIRM_TAG),
                    )
                    RowDivider()
                    ActionRow(stringResource(R.string.sk_cancel), onClick = model::cancelExport)
                }
            }
            else -> {
                item(key = "actions") {
                    AirSection {
                        ActionRow(
                            stringResource(if (state.copies > 0) R.string.sk_copied else R.string.sk_copy_public),
                            onClick = model::copyPublicKey,
                            enabled = ready,
                            modifier = Modifier.testTag(SSH_COPY_PUBLIC_TAG),
                        )
                        RowDivider()
                        ActionRow(
                            stringResource(R.string.sk_export_public),
                            onClick = { model.beginExport(SshDetailModel.ExportKind.PUBLIC_KEY) },
                            enabled = ready,
                        )
                        RowDivider()
                        ActionRow(
                            stringResource(R.string.sk_export_private),
                            onClick = { model.beginExport(SshDetailModel.ExportKind.PRIVATE_KEY) },
                            enabled = ready,
                            modifier = Modifier.testTag(SSH_EXPORT_PRIVATE_TAG),
                        )
                        RowDivider()
                        ActionRow(
                            stringResource(R.string.sk_edit),
                            onClick = model::beginEdit,
                            enabled = ready,
                            modifier = Modifier.testTag(SSH_RENAME_TAG),
                        )
                    }
                }
                item(key = "delete") {
                    AirSection {
                        ActionRow(
                            stringResource(R.string.sk_delete),
                            onClick = model::requestDelete,
                            destructive = true,
                            enabled = ready,
                            modifier = Modifier.testTag(SSH_DELETE_TAG),
                        )
                    }
                }
            }
        }
        state.issue?.let { issue ->
            item(key = "issue") {
                SectionFooter(stringResource(detailIssueText(issue)), modifier = Modifier.testTag(SSH_ISSUE_TAG))
            }
        }
        item(key = "clearance") { TabBarClearance() }
    }
    if (state.confirmingDelete) {
        AlertDialog(
            onDismissRequest = model::cancelDelete,
            title = { Text(stringResource(R.string.sk_delete_q)) },
            text = { Text(stringResource(R.string.sk_delete_text)) },
            confirmButton = {
                TextButton(onClick = model::confirmDelete, modifier = Modifier.testTag(SSH_DELETE_CONFIRM_TAG)) {
                    Text(stringResource(R.string.sk_delete), color = Air.colors.danger)
                }
            },
            dismissButton = { TextButton(onClick = model::cancelDelete) { Text(stringResource(R.string.sk_cancel)) } },
        )
    }
    if (state.confirmingPlaintext) {
        AlertDialog(
            onDismissRequest = model::cancelPlaintext,
            title = { Text(stringResource(R.string.sk_plain_q)) },
            text = { Text(stringResource(R.string.sk_plain_text)) },
            confirmButton = {
                TextButton(onClick = { model.export(allowPlaintext = true) }) {
                    Text(stringResource(R.string.sk_plain_ok), color = Air.colors.danger)
                }
            },
            dismissButton = { TextButton(
                onClick = model::cancelPlaintext,
            ) { Text(stringResource(R.string.sk_cancel)) } },
        )
    }
}

private fun algorithmLabel(algorithm: SshCreationModel.Algorithm): String = when (algorithm) {
    SshCreationModel.Algorithm.ED25519 -> "Ed25519"
    SshCreationModel.Algorithm.RSA -> "RSA 4096"
    SshCreationModel.Algorithm.ECDSA -> "ECDSA P-256"
}

private fun creationIssueText(issue: SshCreationModel.Issue): Int = when (issue) {
    SshCreationModel.Issue.KEY_REQUIRED -> R.string.ssh_issue_key_required
    SshCreationModel.Issue.TOO_LONG -> R.string.ssh_issue_too_long
    SshCreationModel.Issue.REFUSED -> R.string.ssh_issue_refused
    SshCreationModel.Issue.FILE_UNREADABLE -> R.string.ssh_issue_file
    SshCreationModel.Issue.UNCERTAIN -> R.string.ssh_issue_uncertain
}

private fun detailIssueText(issue: SshDetailModel.Issue): Int = when (issue) {
    SshDetailModel.Issue.UPDATE_REFUSED -> R.string.ssh_issue_update_refused
    SshDetailModel.Issue.UNCERTAIN -> R.string.ssh_issue_changed
    SshDetailModel.Issue.EXPORT_FAILED -> R.string.ssh_issue_export
    SshDetailModel.Issue.FILE_NOT_SAVED -> R.string.ssh_issue_file_not_saved
}

/** Reads at most [limit] bytes; `InputStream.readNBytes` needs API 33. */
private fun java.io.InputStream.readNBytesCompat(limit: Int): ByteArray {
    val out = java.io.ByteArrayOutputStream()
    val buffer = ByteArray(8192)
    while (out.size() < limit) {
        val read = read(buffer, 0, minOf(buffer.size, limit - out.size()))
        if (read < 0) break
        out.write(buffer, 0, read)
    }
    return out.toByteArray()
}
