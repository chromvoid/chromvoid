package com.chromvoid.air.ui.wallet

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.KeyboardArrowDown
import androidx.compose.material.icons.rounded.KeyboardArrowUp
import androidx.compose.material.icons.rounded.Visibility
import androidx.compose.material.icons.rounded.VisibilityOff
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirSwitchRow
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DoneButton
import com.chromvoid.air.ui.design.PillText
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.airEditableField
import com.chromvoid.air.ui.root.CoversTabBar

public const val SETUP_TAG: String = "wallet-setup"
public const val SETUP_CANCEL_TAG: String = "wallet-setup-cancel"
public const val SETUP_SAVE_TAG: String = "wallet-setup-save"
public const val SETUP_ISSUE_TAG: String = "wallet-setup-issue"
public const val SETUP_ADVANCED_TAG: String = "wallet-setup-advanced"
public const val SETUP_PASSPHRASE_TAG: String = "wallet-setup-passphrase-toggle"
public const val SETUP_DISCARD_TAG: String = "wallet-setup-discard"

public fun setupFieldTag(field: WalletSetupModel.Field): String = "wallet-setup-${field.name.lowercase()}"

public fun setupProfileTag(profile: WalletSetupModel.RecoveryProfile): String =
    "wallet-profile-${profile.name.lowercase()}"

public fun setupImportNetworkTag(network: WalletSetupModel.ImportNetwork): String = "wallet-import-${network.wire}"

public fun setupEncodingTag(encoding: String): String = "wallet-encoding-$encoding"

/**
 * A new, restored or imported wallet, as the iOS setup sheet: a name, the
 * wallet type or the phrase it is restored from, and a private key for an
 * import; a passphrase under Advanced. A new wallet shows no phrase.
 */
@Composable
internal fun WalletSetupScreen(model: WalletSetupModel, onClose: () -> Unit) {
    CoversTabBar()
    val state by model.state.collectAsStateWithLifecycle()
    val editing = state.phase == WalletSetupModel.Phase.EDITING
    val saving = state.phase == WalletSetupModel.Phase.SAVING || state.phase == WalletSetupModel.Phase.GENERATING
    val dismiss = { if (model.requestDismiss()) onClose() }
    BackHandler(onBack = dismiss)
    val requesters = remember { WalletSetupModel.Field.entries.associateWith { FocusRequester() } }
    val listState = rememberLazyListState()
    LaunchedEffect(state.focusRevision) {
        val field = state.focus ?: return@LaunchedEffect
        val key = when (field) {
            WalletSetupModel.Field.LABEL -> "name"
            WalletSetupModel.Field.MNEMONIC -> "phrase"
            WalletSetupModel.Field.PASSPHRASE -> "advanced"
            WalletSetupModel.Field.PRIVATE_KEY -> "key"
        }
        val keys = buildList {
            if (state.issue != null) add("issue")
            add("name")
            if (model.intent == WalletSetupModel.Intent.IMPORT_KEY) {
                add("key")
            } else {
                add("profile")
                if (model.intent == WalletSetupModel.Intent.RESTORE) add("phrase")
                if (state.profile.allowsPassphrase) add("advanced")
            }
        }
        val index = keys.indexOf(key)
        if (index >= 0 && listState.layoutInfo.visibleItemsInfo.none { it.key == key }) {
            listState.animateScrollToItem(index)
        }
        runCatching { requesters.getValue(field).requestFocus() }
    }
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Air.colors.canvas)
            .pointerInput(Unit) { detectTapGestures {} }
            .testTag(SETUP_TAG),
    ) {
        AirScreen(
            title = stringResource(
                when (model.intent) {
                    WalletSetupModel.Intent.CREATE -> R.string.wallet_create
                    WalletSetupModel.Intent.RESTORE -> R.string.wallet_restore
                    WalletSetupModel.Intent.IMPORT_KEY -> R.string.wallet_import_key
                },
            ),
            largeTitle = false,
            state = listState,
            leading = {
                DoneButton(
                    stringResource(
                        when (state.phase) {
                            WalletSetupModel.Phase.UNCERTAIN -> R.string.form_close
                            else -> R.string.form_cancel
                        },
                    ),
                    onClick = { if (!saving) dismiss() },
                    modifier = Modifier.testTag(SETUP_CANCEL_TAG),
                )
            },
            actions = {
                PillText(
                    stringResource(if (saving) R.string.wallet_saving else R.string.form_save),
                    onClick = model::submit,
                    enabled = editing,
                    emphasized = true,
                    modifier = Modifier.testTag(SETUP_SAVE_TAG),
                )
            },
        ) {
            state.issue?.let { issue ->
                item(key = "issue") {
                    AirSection(modifier = Modifier.testTag(SETUP_ISSUE_TAG)) {
                        AirRow(
                            title = stringResource(setupIssueText(issue)),
                            icon = Icons.Rounded.WarningAmber,
                            iconTint = Air.colors.danger,
                            titleColor = Air.colors.danger,
                        )
                    }
                }
            }
            if (state.phase == WalletSetupModel.Phase.UNCERTAIN) return@AirScreen
            item(key = "name") {
                AirSection {
                    SetupField(model, state, WalletSetupModel.Field.LABEL, R.string.wallet_name, requesters, editing)
                }
            }
            if (model.intent == WalletSetupModel.Intent.IMPORT_KEY) {
                item(key = "key") { ImportFields(model, state, requesters, editing) }
            } else {
                item(key = "profile") { Profile(model, state, editing) }
                if (model.intent == WalletSetupModel.Intent.RESTORE) {
                    item(key = "phrase") {
                        AirSection(header = stringResource(R.string.wallet_phrase)) {
                            SetupField(
                                model,
                                state,
                                WalletSetupModel.Field.MNEMONIC,
                                R.string.wallet_phrase,
                                requesters,
                                editing,
                                secret = true,
                            )
                        }
                    }
                }
                if (state.profile.allowsPassphrase) {
                    item(key = "advanced") { Advanced(model, state, requesters, editing) }
                }
            }
        }
    }
    if (state.confirmingDiscard) {
        AlertDialog(
            onDismissRequest = model::cancelDiscard,
            title = { Text(stringResource(R.string.wallet_discard_title)) },
            text = { Text(stringResource(R.string.wallet_discard_text)) },
            confirmButton = {
                TextButton(onClick = onClose, modifier = Modifier.testTag(SETUP_DISCARD_TAG)) {
                    Text(stringResource(R.string.doc_discard), color = Air.colors.danger)
                }
            },
            dismissButton = {
                TextButton(onClick = model::cancelDiscard) { Text(stringResource(R.string.files_keep_editing)) }
            },
        )
    }
}

@Composable
private fun Profile(model: WalletSetupModel, state: WalletSetupModel.State, editing: Boolean) {
    val restoring = model.intent == WalletSetupModel.Intent.RESTORE
    val footer = buildList {
        if (state.profile == WalletSetupModel.RecoveryProfile.TON_ONLY) {
            add(stringResource(R.string.wallet_profile_ton_text))
        }
        if (state.profile == WalletSetupModel.RecoveryProfile.TELEGRAM_MULTICHAIN) {
            add(stringResource(R.string.wallet_profile_universal_text))
            if (model.intent == WalletSetupModel.Intent.CREATE) add(stringResource(R.string.wallet_create_text))
        }
    }.joinToString("\n\n").ifEmpty { null }
    AirSection(
        header = stringResource(if (restoring) R.string.wallet_profile else R.string.wallet_type),
        footer = footer,
    ) {
        if (!restoring) {
            AirRow(title = stringResource(R.string.wallet_type), value = stringResource(profileTitle(state.profile)))
        } else {
            WalletSetupModel.RecoveryProfile.available(model.intent).forEachIndexed { index, profile ->
                if (index > 0) RowDivider()
                Choice(
                    stringResource(profileTitle(profile)),
                    state.profile == profile,
                    editing,
                    setupProfileTag(profile),
                ) {
                    model.selectProfile(profile)
                }
            }
        }
    }
}

@Composable
private fun Advanced(
    model: WalletSetupModel,
    state: WalletSetupModel.State,
    requesters: Map<WalletSetupModel.Field, FocusRequester>,
    editing: Boolean,
) {
    // Plain remember: whether Advanced is open is not worth a saved-instance bundle.
    var expanded by remember { mutableStateOf(state.usePassphrase) }
    AirSection(footer = if (expanded) stringResource(R.string.wallet_passphrase_text) else null) {
        AirRow(
            title = stringResource(R.string.wallet_advanced),
            onClick = { expanded = !expanded },
            modifier = Modifier.testTag(SETUP_ADVANCED_TAG),
            trailing = {
                Icon(
                    if (expanded) Icons.Rounded.KeyboardArrowUp else Icons.Rounded.KeyboardArrowDown,
                    contentDescription = null,
                    tint = Air.colors.textTertiary,
                )
            },
        )
        if (expanded) {
            RowDivider()
            AirSwitchRow(
                title = stringResource(R.string.wallet_use_passphrase),
                checked = state.usePassphrase,
                onCheckedChange = model::setPassphraseEnabled,
                enabled = editing,
                modifier = Modifier.testTag(SETUP_PASSPHRASE_TAG),
            )
            if (state.usePassphrase) {
                RowDivider()
                SetupField(
                    model,
                    state,
                    WalletSetupModel.Field.PASSPHRASE,
                    R.string.wallet_passphrase,
                    requesters,
                    editing,
                    secret = true,
                )
            }
        }
    }
}

@Composable
private fun ImportFields(
    model: WalletSetupModel,
    state: WalletSetupModel.State,
    requesters: Map<WalletSetupModel.Field, FocusRequester>,
    editing: Boolean,
) {
    Column {
        AirSection(header = stringResource(R.string.wallet_network)) {
            model.importNetworks.forEachIndexed { index, network ->
                if (index > 0) RowDivider()
                Choice(
                    WalletNetwork.displayName(network.wire),
                    state.importNetwork == network,
                    editing,
                    setupImportNetworkTag(network),
                ) {
                    model.selectImportNetwork(network)
                }
            }
        }
        val encodings = state.importNetwork?.encodings.orEmpty()
        if (encodings.size > 1) {
            AirSection(header = stringResource(R.string.wallet_key_encoding)) {
                encodings.forEachIndexed { index, encoding ->
                    if (index > 0) RowDivider()
                    Choice(
                        encoding,
                        state.encoding == encoding,
                        editing,
                        setupEncodingTag(encoding),
                    ) { model.selectEncoding(encoding) }
                }
            }
        }
        AirSection(header = stringResource(R.string.wallet_private_key)) {
            SetupField(
                model,
                state,
                WalletSetupModel.Field.PRIVATE_KEY,
                R.string.wallet_private_key,
                requesters,
                editing,
                secret = true,
            )
        }
    }
}

@Composable
private fun Choice(title: String, chosen: Boolean, enabled: Boolean, tag: String, onChoose: () -> Unit) {
    AirRow(
        title = title,
        enabled = enabled,
        onClick = onChoose,
        modifier = Modifier.semantics { selected = chosen }.testTag(tag),
        trailing = { if (chosen) Icon(Icons.Rounded.Check, contentDescription = null, tint = Air.colors.accent) },
    )
}

@Composable
private fun SetupField(
    model: WalletSetupModel,
    state: WalletSetupModel.State,
    field: WalletSetupModel.Field,
    label: Int,
    requesters: Map<WalletSetupModel.Field, FocusRequester>,
    editing: Boolean,
    secret: Boolean = false,
) {
    val caption = stringResource(label)
    val shown = field in state.revealed
    val missing = field in state.missing
    val error = if (missing) stringResource(R.string.wallet_required) else null
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 56.dp)
            .padding(start = 20.dp, end = 8.dp, top = 10.dp, bottom = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(caption, style = AirType.footnote, color = Air.colors.textSecondary)
            val value = state.value(field)
            BasicTextField(
                value = value,
                onValueChange = { model.change(field, it) },
                enabled = editing,
                singleLine = field != WalletSetupModel.Field.MNEMONIC || !shown,
                textStyle = AirType.body.copy(
                    color = Air.colors.text,
                    fontFamily = if (secret && shown) FontFamily.Monospace else null,
                ),
                cursorBrush = SolidColor(Air.colors.accent),
                visualTransformation = when {
                    secret && !shown -> PasswordVisualTransformation()
                    else -> VisualTransformation.None
                },
                keyboardOptions = KeyboardOptions(
                    capitalization = if (secret) KeyboardCapitalization.None else KeyboardCapitalization.Sentences,
                    autoCorrectEnabled = !secret,
                    keyboardType = if (secret) KeyboardType.Password else KeyboardType.Text,
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(requesters.getValue(field))
                    .airEditableField(caption, error)
                    .testTag(setupFieldTag(field)),
            )
            if (error != null) {
                Text(error, style = AirType.footnote, color = Air.colors.danger)
            }
        }
        if (secret) {
            val description = stringResource(if (shown) R.string.wallet_hide_value else R.string.wallet_show_value)
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clickable(enabled = editing, role = Role.Button) { model.toggleVisibility(field) }
                    .semantics { contentDescription = description },
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    if (shown) Icons.Rounded.VisibilityOff else Icons.Rounded.Visibility,
                    contentDescription = null,
                    tint = Air.colors.accent,
                )
            }
        }
    }
}

private fun profileTitle(profile: WalletSetupModel.RecoveryProfile): Int = when (profile) {
    WalletSetupModel.RecoveryProfile.MULTICHAIN -> R.string.wallet_profile_multichain
    WalletSetupModel.RecoveryProfile.TELEGRAM_MULTICHAIN -> R.string.wallet_kind_universal
    WalletSetupModel.RecoveryProfile.TON_ONLY -> R.string.wallet_kind_telegram
    WalletSetupModel.RecoveryProfile.TON_LEGACY -> R.string.wallet_profile_legacy
}

private fun setupIssueText(issue: WalletSetupModel.Issue): Int = when (issue) {
    WalletSetupModel.Issue.UNAVAILABLE -> R.string.wallet_unavailable
    WalletSetupModel.Issue.CHOOSE_NETWORK -> R.string.wallet_issue_network
    WalletSetupModel.Issue.EXPIRED_PHRASE -> R.string.wallet_issue_expired
    WalletSetupModel.Issue.INVALID_INPUT -> R.string.wallet_issue_invalid
    WalletSetupModel.Issue.DENIED -> R.string.wallet_issue_denied
    WalletSetupModel.Issue.GENERATION_FAILED -> R.string.wallet_issue_generation
    WalletSetupModel.Issue.UNCERTAIN_SAVE -> R.string.wallet_issue_uncertain_save
}
