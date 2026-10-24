package com.chromvoid.air.ui.wallet

import android.text.format.DateUtils
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.Schedule
import androidx.compose.material.icons.rounded.WarningAmber
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.bridge.wire.WalletAddressBookEntry
import com.chromvoid.air.bridge.wire.WalletFeeTier
import com.chromvoid.air.bridge.wire.WalletWarning
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSegment
import com.chromvoid.air.ui.design.AirSegmentedControl
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirSwitchRow
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DoneButton
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.PrimaryButton
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.airEditableField
import com.chromvoid.air.ui.root.CoversTabBar

public const val SEND_TAG: String = "wallet-send"
public const val SEND_CLOSE_TAG: String = "wallet-send-close"
public const val SEND_NETWORK_TAG: String = "wallet-send-network"
public const val SEND_ISSUE_TAG: String = "wallet-send-issue"
public const val SEND_ADD_RECIPIENT_TAG: String = "wallet-send-add-recipient"
public const val SEND_COMMENT_TAG: String = "wallet-send-comment"
public const val SEND_QUOTE_TAG: String = "wallet-send-quote"
public const val SEND_FEE_TAG: String = "wallet-send-fee"
public const val SEND_REVIEW_TAG: String = "wallet-send-review"
public const val SEND_TOTAL_TAG: String = "wallet-send-total"
public const val SEND_PASSWORD_TAG: String = "wallet-send-password"
public const val SEND_CONFIRM_TAG: String = "wallet-send-confirm"
public const val SEND_BACK_TO_EDITING_TAG: String = "wallet-send-back-to-editing"
public const val SEND_RESULT_TAG: String = "wallet-send-result"
public const val SEND_VIEW_ACTIVITY_TAG: String = "wallet-send-view-activity"
public const val SEND_DISCARD_TAG: String = "wallet-send-discard"

public fun sendAddressTag(index: Int): String = "wallet-send-address-$index"

public fun sendAmountTag(index: Int): String = "wallet-send-amount-$index"

public fun sendMaximumTag(index: Int): String = "wallet-send-maximum-$index"

public fun sendFeeTierTag(tier: WalletFeeTier): String = "wallet-send-fee-${tier.value}"

public fun sendWarningTag(code: String): String = "wallet-send-warning-$code"

public fun sendContactTag(index: Int): String = "wallet-send-contact-$index"

public fun sendContactOptionTag(entryId: String): String = "wallet-send-contact-option-$entryId"

/**
 * A transfer, as the iOS send sheet: the network the address belongs to, the
 * recipients and amounts, the fee; then the exact transfer Core prepared to
 * review and authorize with the administrative password; then its outcome.
 */
@Composable
internal fun WalletSendScreen(
    model: WalletSendModel,
    addressBook: WalletAddressBookModel,
    onClose: () -> Unit,
    onActivity: () -> Unit,
    onLock: () -> Unit,
) {
    CoversTabBar()
    val state by model.state.collectAsStateWithLifecycle()
    val contacts by addressBook.state.collectAsStateWithLifecycle()
    val close = { if (model.requestDismiss()) onClose() }
    BackHandler { if (!state.busy) close() }
    val requesters = remember { mutableMapOf<WalletSendModel.Field, FocusRequester>() }
    val listState = rememberLazyListState()
    LaunchedEffect(state.focusRevision) {
        val field = state.focus ?: return@LaunchedEffect
        val key = when (field) {
            is WalletSendModel.Field.Address -> "recipient-${field.recipient}"
            is WalletSendModel.Field.Amount -> "recipient-${field.recipient}"
            WalletSendModel.Field.Comment -> "fee"
            WalletSendModel.Field.Password -> "authorize"
            WalletSendModel.Field.Warnings -> "warnings"
        }
        val index = sendSectionKeys(state).indexOf(key)
        if (index >= 0 && listState.layoutInfo.visibleItemsInfo.none { it.key == key }) {
            listState.animateScrollToItem(index)
        }
        requesters[field]?.let { runCatching { it.requestFocus() } }
    }
    val editing = state.phase == WalletSendModel.Phase.EDITING || state.phase == WalletSendModel.Phase.PREPARING
    val result = state.phase == WalletSendModel.Phase.SUBMITTED || state.phase == WalletSendModel.Phase.UNCERTAIN
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Air.colors.canvas)
            .pointerInput(Unit) { detectTapGestures {} }
            .testTag(SEND_TAG),
    ) {
        AirScreen(
            title = stringResource(if (editing) R.string.wallet_send else R.string.wallet_review),
            largeTitle = false,
            state = listState,
            leading = {
                DoneButton(
                    stringResource(R.string.form_close),
                    onClick = { if (!state.busy) close() },
                    modifier = Modifier.testTag(SEND_CLOSE_TAG),
                )
            },
            actions = { PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock) },
        ) {
            item(key = "network") { NetworkSection(state) }
            state.issue?.let { issue ->
                item(key = "issue") {
                    AirSection(modifier = Modifier.testTag(SEND_ISSUE_TAG)) {
                        AirRow(
                            title = stringResource(sendIssueText(issue)),
                            icon = Icons.Rounded.WarningAmber,
                            iconTint = Air.colors.danger,
                            titleColor = Air.colors.danger,
                        )
                    }
                }
            }
            when {
                editing -> input(model, state, state.contacts(contacts.entries), requesters)
                result -> item(key = "result") { Result(state, onActivity) }
                state.phase != WalletSendModel.Phase.REVOKED -> review(model, state, requesters)
            }
            if (state.busy) item(key = "busy") { Loading(R.string.wallet_updating) }
        }
    }
    if (state.confirmingDiscard) {
        AlertDialog(
            onDismissRequest = model::cancelDiscard,
            title = { Text(stringResource(R.string.wallet_send_discard_title)) },
            text = { Text(stringResource(R.string.wallet_send_discard_text)) },
            confirmButton = {
                TextButton(onClick = { model.discard(onClose) }, modifier = Modifier.testTag(SEND_DISCARD_TAG)) {
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
private fun NetworkSection(state: WalletSendModel.State) {
    val detected = state.detectedNetwork
    val footer = when {
        state.networkMismatch != null ->
            stringResource(R.string.wallet_send_mismatch, WalletNetwork.displayName(state.networkMismatch))
        detected != null && detected == state.network.network ->
            stringResource(R.string.wallet_send_detected, WalletNetwork.displayName(detected))
        else -> stringResource(R.string.wallet_send_paste)
    }
    AirSection(footer = footer) {
        AirRow(
            title = stringResource(R.string.wallet_network),
            value = state.network.displayName,
            modifier = Modifier.testTag(SEND_NETWORK_TAG),
        )
    }
}

private fun LazyListScope.input(
    model: WalletSendModel,
    state: WalletSendModel.State,
    contacts: List<WalletAddressBookEntry>,
    requesters: MutableMap<WalletSendModel.Field, FocusRequester>,
) {
    val enabled = state.phase == WalletSendModel.Phase.EDITING
    if (!state.available) {
        item(key = "off") {
            AirSection {
                AirRow(title = stringResource(R.string.wallet_send_off), titleColor = Air.colors.textSecondary)
            }
        }
    }
    state.recipients.forEachIndexed { index, recipient ->
        item(key = "recipient-${recipient.id}") {
            AirSection(header = stringResource(R.string.wallet_recipient, (index + 1).toString())) {
                SendField(
                    model,
                    state,
                    WalletSendModel.Field.Address(recipient.id),
                    stringResource(R.string.wallet_address),
                    requesters,
                    enabled,
                    Modifier.testTag(sendAddressTag(index)),
                    monospace = true,
                )
                RowDivider()
                ContactChooser(contacts, enabled, index) { model.chooseContact(it, recipient.id) }
                RowDivider()
                SendField(
                    model,
                    state,
                    WalletSendModel.Field.Amount(recipient.id),
                    stringResource(R.string.wallet_amount, state.network.symbol),
                    requesters,
                    enabled,
                    Modifier.testTag(sendAmountTag(index)),
                    keyboard = KeyboardType.Decimal,
                )
                RowDivider()
                ActionRow(
                    stringResource(
                        when (state.maximumRecipientId) {
                            recipient.id -> R.string.wallet_max_selected
                            else -> R.string.wallet_use_max
                        },
                    ),
                    onClick = { model.calculateQuote(maximumFor = recipient.id) },
                    enabled = enabled && !state.quoting && state.available,
                    modifier = Modifier.testTag(sendMaximumTag(index)),
                )
                if (state.recipients.size > 1) {
                    RowDivider()
                    ActionRow(
                        stringResource(R.string.wallet_remove_recipient),
                        onClick = { model.removeRecipient(recipient.id) },
                        enabled = enabled,
                        destructive = true,
                    )
                }
            }
        }
    }
    if (state.network.multipleOutputs) {
        item(key = "add-recipient") {
            AirSection {
                ActionRow(
                    stringResource(R.string.wallet_add_recipient),
                    onClick = model::addRecipient,
                    enabled = enabled,
                    modifier = Modifier.testTag(SEND_ADD_RECIPIENT_TAG),
                )
            }
        }
    }
    item(key = "fee") {
        AirSection(header = stringResource(R.string.wallet_fee)) {
            FeeTiers(state.feeTier, enabled, model::chooseFee)
            if (state.network.supportsComment) {
                RowDivider()
                SendField(
                    model,
                    state,
                    WalletSendModel.Field.Comment,
                    stringResource(R.string.wallet_comment),
                    requesters,
                    enabled,
                    Modifier.testTag(SEND_COMMENT_TAG),
                )
            }
            RowDivider()
            ActionRow(
                stringResource(R.string.wallet_calculate_fee),
                onClick = { model.calculateQuote() },
                enabled = enabled && !state.quoting && state.available,
                modifier = Modifier.testTag(SEND_QUOTE_TAG),
            )
            if (state.quoting) Loading(R.string.wallet_calculating)
            state.quote?.currentPreview?.let { preview ->
                RowDivider()
                AirRow(
                    title = stringResource(R.string.wallet_estimated_fee),
                    value = amount(state, preview.estimatedFee, preview.amountUnit),
                    modifier = Modifier.testTag(SEND_FEE_TAG),
                )
            }
        }
    }
    item(key = "review") {
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp)) {
            PrimaryButton(
                stringResource(R.string.wallet_review),
                onClick = model::prepare,
                enabled = enabled && state.available,
                busy = state.phase == WalletSendModel.Phase.PREPARING,
                modifier = Modifier.fillMaxWidth().testTag(SEND_REVIEW_TAG),
            )
            Text(
                stringResource(R.string.wallet_review_text),
                style = AirType.footnote,
                color = Air.colors.textSecondary,
                modifier = Modifier.padding(horizontal = 4.dp, vertical = 8.dp),
            )
        }
    }
}

private fun LazyListScope.review(
    model: WalletSendModel,
    state: WalletSendModel.State,
    requesters: MutableMap<WalletSendModel.Field, FocusRequester>,
) {
    val prepared = state.prepared ?: return
    val preview = prepared.preview
    preview.outputs.forEachIndexed { index, output ->
        item(key = "output-$index") {
            AirSection(header = stringResource(R.string.wallet_recipient, (index + 1).toString())) {
                Column(
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 14.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        amount(state, output.amount, preview.amountUnit),
                        style = AirType.title3,
                        color = Air.colors.text,
                    )
                    Text(
                        output.address,
                        style = AirType.footnote.copy(fontFamily = FontFamily.Monospace),
                        color = Air.colors.textSecondary,
                    )
                    output.comment?.let { Text(it, style = AirType.body, color = Air.colors.text) }
                }
            }
        }
    }
    item(key = "summary") {
        val context = LocalContext.current
        AirSection {
            AirRow(
                title = stringResource(R.string.wallet_fee),
                value = amount(state, preview.estimatedFee, preview.amountUnit),
            )
            RowDivider()
            AirRow(
                title = stringResource(R.string.wallet_total),
                value = amount(state, preview.totalDebit, preview.amountUnit),
                modifier = Modifier.testTag(SEND_TOTAL_TAG),
            )
            RowDivider()
            AirRow(
                title = stringResource(R.string.wallet_valid_until),
                value = DateUtils.formatDateTime(context, prepared.expiresAt, DateUtils.FORMAT_SHOW_TIME),
            )
        }
    }
    if (preview.warnings.isNotEmpty()) {
        item(key = "warnings") {
            AirSection(header = stringResource(R.string.wallet_confirm_warnings)) {
                preview.warnings.forEachIndexed { index, warning ->
                    if (index > 0) RowDivider()
                    val warningFocus = requesters.getOrPut(WalletSendModel.Field.Warnings) { FocusRequester() }
                    AirSwitchRow(
                        title = warningText(warning),
                        checked = warning.code in state.acceptedWarnings,
                        onCheckedChange = { model.toggleWarning(warning.code) },
                        enabled = state.phase == WalletSendModel.Phase.REVIEWING,
                        modifier = Modifier
                            .then(if (index == 0) Modifier.focusRequester(warningFocus) else Modifier)
                            .testTag(sendWarningTag(warning.code)),
                    )
                }
            }
        }
    }
    if (state.phase == WalletSendModel.Phase.REVIEWING || state.phase == WalletSendModel.Phase.CONFIRMING) {
        item(key = "authorize") {
            AirSection(footer = stringResource(R.string.wallet_admin_text)) {
                SendField(
                    model,
                    state,
                    WalletSendModel.Field.Password,
                    stringResource(R.string.wallet_admin_password),
                    requesters,
                    state.phase == WalletSendModel.Phase.REVIEWING,
                    Modifier.testTag(SEND_PASSWORD_TAG),
                    secret = true,
                )
            }
            Box(modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
                PrimaryButton(
                    stringResource(R.string.wallet_confirm_transfer),
                    onClick = model::confirm,
                    enabled = !state.busy,
                    busy = state.phase == WalletSendModel.Phase.CONFIRMING,
                    modifier = Modifier.fillMaxWidth().testTag(SEND_CONFIRM_TAG),
                )
            }
        }
    }
    item(key = "back") {
        AirSection {
            ActionRow(
                stringResource(
                    when (state.phase) {
                        WalletSendModel.Phase.CANCEL_FAILED -> R.string.wallet_retry_cancel
                        else -> R.string.wallet_back_to_editing
                    },
                ),
                onClick = model::cancelReview,
                enabled = !state.busy,
                modifier = Modifier.testTag(SEND_BACK_TO_EDITING_TAG),
            )
        }
    }
}

@Composable
private fun Result(state: WalletSendModel.State, onActivity: () -> Unit) {
    val submitted = state.phase == WalletSendModel.Phase.SUBMITTED
    AirSection(modifier = Modifier.testTag(SEND_RESULT_TAG)) {
        AirRow(
            title = stringResource(if (submitted) R.string.wallet_submitted else R.string.wallet_outcome_unknown),
            icon = if (submitted) Icons.Rounded.Schedule else Icons.Rounded.WarningAmber,
            iconTint = if (submitted) Air.colors.accent else Air.colors.warning,
        )
        state.confirmation?.let { confirmation ->
            RowDivider()
            Text(
                confirmation.txHash ?: confirmation.txRef,
                style = AirType.footnote.copy(fontFamily = FontFamily.Monospace),
                color = Air.colors.textSecondary,
                modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
            )
        }
        RowDivider()
        Text(
            stringResource(if (submitted) R.string.wallet_submitted_text else R.string.wallet_unknown_text),
            style = AirType.body,
            color = Air.colors.text,
            modifier = Modifier.padding(horizontal = 20.dp, vertical = 12.dp),
        )
        RowDivider()
        ActionRow(
            stringResource(R.string.wallet_view_activity),
            onClick = onActivity,
            modifier = Modifier.testTag(SEND_VIEW_ACTIVITY_TAG),
        )
    }
}

@Composable
private fun FeeTiers(selected: WalletFeeTier, enabled: Boolean, onSelect: (WalletFeeTier) -> Unit) {
    val tiers = listOf(
        WalletFeeTier.Slow to R.string.wallet_fee_slow,
        WalletFeeTier.Standard to R.string.wallet_fee_standard,
        WalletFeeTier.Fast to R.string.wallet_fee_fast,
    )
    AirSegmentedControl(
        segments = tiers.map { (tier, label) -> AirSegment(stringResource(label), sendFeeTierTag(tier)) },
        selectedIndex = tiers.indexOfFirst { it.first == selected },
        onSelect = { onSelect(tiers[it].first) },
        enabled = enabled,
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
    )
}

/** The saved contacts on the transfer's network, offered for one recipient's address. */
@Composable
private fun ContactChooser(
    contacts: List<WalletAddressBookEntry>,
    enabled: Boolean,
    index: Int,
    onChoose: (WalletAddressBookEntry) -> Unit,
) {
    var open by remember { mutableStateOf(false) }
    Box {
        ActionRow(
            stringResource(R.string.wallet_choose_contact),
            onClick = { open = true },
            icon = Icons.Outlined.AccountCircle,
            enabled = enabled,
            modifier = Modifier.testTag(sendContactTag(index)),
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            if (contacts.isEmpty()) {
                DropdownMenuItem(
                    text = {
                        Text(
                            stringResource(R.string.wallet_no_contacts_network),
                            style = AirType.body,
                            color = Air.colors.textSecondary,
                        )
                    },
                    enabled = false,
                    onClick = {},
                )
            }
            contacts.forEach { contact ->
                DropdownMenuItem(
                    text = {
                        Column {
                            Text(contact.label, style = AirType.body, color = Air.colors.text)
                            Text(
                                contact.address,
                                style = AirType.caption.copy(fontFamily = FontFamily.Monospace),
                                color = Air.colors.textSecondary,
                                maxLines = 1,
                                overflow = TextOverflow.MiddleEllipsis,
                            )
                        }
                    },
                    onClick = {
                        open = false
                        onChoose(contact)
                    },
                    modifier = Modifier.testTag(sendContactOptionTag(contact.entryID)),
                )
            }
        }
    }
}

@Composable
private fun SendField(
    model: WalletSendModel,
    state: WalletSendModel.State,
    field: WalletSendModel.Field,
    label: String,
    requesters: MutableMap<WalletSendModel.Field, FocusRequester>,
    enabled: Boolean,
    modifier: Modifier,
    keyboard: KeyboardType = KeyboardType.Text,
    monospace: Boolean = false,
    secret: Boolean = false,
) {
    val requester = requesters.getOrPut(field) { FocusRequester() }
    val value = state.value(field)
    val issue = state.issue?.takeIf { issue ->
        when (issue) {
            is WalletSendModel.Issue.Required -> issue.field == field
            is WalletSendModel.Issue.InvalidAmount -> field == WalletSendModel.Field.Amount(issue.recipient)
            WalletSendModel.Issue.InvalidAddress -> field is WalletSendModel.Field.Address &&
                state.recipients.size == 1
            WalletSendModel.Issue.Reauthentication -> field == WalletSendModel.Field.Password
            WalletSendModel.Issue.Denied -> field == WalletSendModel.Field.Password && state.focus == field
            else -> false
        }
    }
    val error = issue?.let { stringResource(sendIssueText(it)) }
    Column(
        modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 20.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        Text(label, style = AirType.footnote, color = Air.colors.textSecondary)
        BasicTextField(
            value = value,
            onValueChange = { model.change(field, it) },
            enabled = enabled,
            singleLine = !monospace,
            textStyle = AirType.body.copy(
                color = Air.colors.text,
                fontFamily = if (monospace) FontFamily.Monospace else null,
            ),
            cursorBrush = SolidColor(Air.colors.accent),
            visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions = KeyboardOptions(
                capitalization = KeyboardCapitalization.None,
                autoCorrectEnabled = false,
                keyboardType = if (secret) KeyboardType.Password else keyboard,
            ),
            modifier = modifier.fillMaxWidth().focusRequester(requester).airEditableField(label, error),
        )
        if (error != null) Text(error, style = AirType.footnote, color = Air.colors.danger)
    }
}

private fun sendSectionKeys(state: WalletSendModel.State): List<String> = buildList {
    add("network")
    if (state.issue != null) add("issue")
    if (state.phase == WalletSendModel.Phase.EDITING || state.phase == WalletSendModel.Phase.PREPARING) {
        if (!state.available) add("off")
        state.recipients.forEach { add("recipient-${it.id}") }
        if (state.network.multipleOutputs) add("add-recipient")
        add("fee")
        add("review")
    } else {
        state.prepared?.preview?.let { preview ->
            preview.outputs.indices.forEach { add("output-$it") }
            add("summary")
            if (preview.warnings.isNotEmpty()) add("warnings")
            if (state.phase == WalletSendModel.Phase.REVIEWING || state.phase == WalletSendModel.Phase.CONFIRMING) {
                add("authorize")
            }
            add("back")
        }
    }
}

/** An amount in base units as the network's decimal when it is in the network's unit. */
private fun amount(state: WalletSendModel.State, value: String, unit: String): String =
    if (unit == state.network.amountUnit) state.network.formatted(value) else "$value $unit"

@Composable
private fun warningText(warning: WalletWarning): String = when (warning.code) {
    "dust_change_to_fee" -> stringResource(R.string.wallet_warning_dust)
    "destination_uninitialized_bounceable" -> stringResource(R.string.wallet_warning_uninitialized)
    else -> warning.message
}

private fun sendIssueText(issue: WalletSendModel.Issue): Int = when (issue) {
    is WalletSendModel.Issue.Required ->
        when (issue.field) {
            WalletSendModel.Field.Password -> R.string.wallet_issue_password
            else -> R.string.wallet_issue_address
        }
    is WalletSendModel.Issue.InvalidAmount -> R.string.wallet_issue_amount
    WalletSendModel.Issue.InvalidAddress -> R.string.wallet_issue_invalid_address
    WalletSendModel.Issue.InsufficientFunds -> R.string.wallet_issue_funds
    WalletSendModel.Issue.Unavailable -> R.string.wallet_send_off
    WalletSendModel.Issue.Denied -> R.string.wallet_issue_access
    WalletSendModel.Issue.Stale -> R.string.wallet_issue_stale
    WalletSendModel.Issue.QuoteRequired -> R.string.wallet_issue_quote
    WalletSendModel.Issue.Reauthentication -> R.string.wallet_issue_reauth
    WalletSendModel.Issue.Warnings -> R.string.wallet_issue_warnings
    WalletSendModel.Issue.Failed -> R.string.wallet_issue_failed
    WalletSendModel.Issue.CancellationFailed -> R.string.wallet_issue_cancel
    WalletSendModel.Issue.Uncertain -> R.string.wallet_issue_uncertain
}
