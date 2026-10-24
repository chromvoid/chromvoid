package com.chromvoid.air.ui.wallet

import android.text.format.DateUtils
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.CallMade
import androidx.compose.material.icons.automirrored.rounded.CallReceived
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.SwapHoriz
import androidx.compose.material3.Icon
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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.bridge.wire.WalletTransactionDirection
import com.chromvoid.air.bridge.wire.WalletTransactionEntry
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.TabBarClearance
import com.chromvoid.air.ui.design.airEditableField

public const val HISTORY_TAG: String = "wallet-history"
public const val HISTORY_BACK_TAG: String = "wallet-history-back"
public const val HISTORY_REFRESH_TAG: String = "wallet-history-refresh"
public const val HISTORY_EMPTY_TAG: String = "wallet-history-empty"
public const val HISTORY_ISSUE_TAG: String = "wallet-history-issue"
public const val TRANSACTION_TAG: String = "wallet-transaction"
public const val TRANSACTION_BACK_TAG: String = "wallet-transaction-back"
public const val TRANSACTION_STATUS_TAG: String = "wallet-transaction-status"
public const val TRANSACTION_REFRESH_TAG: String = "wallet-transaction-refresh"
public const val TRANSACTION_COPY_REFERENCE_TAG: String = "wallet-transaction-copy-reference"
public const val REBROADCAST_TAG: String = "wallet-rebroadcast"
public const val REBROADCAST_PASSWORD_TAG: String = "wallet-rebroadcast-password"
public const val REBROADCAST_CONFIRM_TAG: String = "wallet-rebroadcast-confirm"

public fun transactionTag(txRef: String): String = "wallet-transaction-$txRef"

/** One account's activity, as iOS lists Core's journal; a transaction opens its details. */
@Composable
internal fun WalletHistoryScreen(
    model: WalletHistoryModel,
    accountName: String,
    onBack: () -> Unit,
    onLock: () -> Unit,
) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(model) { model.loadIfNeeded() }
    val selected = state.selected
    if (selected != null) {
        BackHandler(onBack = model::closeDetail)
        TransactionScreen(model, state, selected, accountName, onLock)
        return
    }
    BackHandler(onBack = onBack)
    AirScreen(
        title = stringResource(R.string.wallet_activity),
        largeTitle = false,
        onBack = onBack,
        backTag = HISTORY_BACK_TAG,
        backDescription = stringResource(R.string.detail_back),
        listTag = HISTORY_TAG,
        actions = {
            PillIcon(
                Icons.Rounded.Refresh,
                stringResource(R.string.wallet_refresh),
                onClick = model::reload,
                enabled = state.activity == WalletHistoryModel.Activity.IDLE &&
                    state.phase != WalletHistoryModel.Phase.REVOKED,
                modifier = Modifier.testTag(HISTORY_REFRESH_TAG),
            )
            PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock)
        },
    ) {
        item(key = "account") {
            AirSection {
                AirRow(title = stringResource(R.string.wallet_account), value = accountName)
                RowDivider()
                AirRow(
                    title = stringResource(R.string.wallet_network),
                    value = WalletNetwork.displayName(model.network),
                )
            }
        }
        state.issue?.let { issue ->
            item(key = "issue") {
                AirSection(modifier = Modifier.testTag(HISTORY_ISSUE_TAG)) {
                    AirRow(title = stringResource(historyIssueText(issue)), titleColor = Air.colors.textSecondary)
                    ActionRow(
                        stringResource(R.string.vault_try_again),
                        onClick = model::reload,
                        enabled = state.activity == WalletHistoryModel.Activity.IDLE,
                    )
                }
            }
        }
        item(key = "transactions") {
            AirSection(
                header = stringResource(R.string.wallet_transactions),
                footer = if (!model.canSynchronize) stringResource(R.string.wallet_saved_only) else null,
            ) {
                if (state.entries.isEmpty() && state.phase == WalletHistoryModel.Phase.READY) {
                    AirRow(
                        title = stringResource(R.string.wallet_no_transactions),
                        titleColor = Air.colors.textSecondary,
                        modifier = Modifier.testTag(HISTORY_EMPTY_TAG),
                    )
                }
                state.entries.forEachIndexed { index, entry ->
                    if (index > 0) RowDivider(inset = 58.dp)
                    TransactionRow(model, entry)
                }
                when {
                    state.activity != WalletHistoryModel.Activity.IDLE -> Loading(
                        if (state.activity == WalletHistoryModel.Activity.SYNCHRONIZING) {
                            R.string.wallet_syncing
                        } else {
                            R.string.wallet_loading_more
                        },
                    )
                    state.nextCursor != null -> {
                        RowDivider()
                        ActionRow(stringResource(R.string.files_load_more), onClick = model::loadMore)
                    }
                }
            }
        }
        item(key = "tab-bar-clearance") { TabBarClearance() }
    }
}

@Composable
private fun TransactionRow(model: WalletHistoryModel, entry: WalletTransactionEntry) {
    val colors = Air.colors
    val context = LocalContext.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button) { model.open(entry.txRef) }
            .heightIn(min = 56.dp)
            .padding(horizontal = 20.dp, vertical = 10.dp)
            .testTag(transactionTag(entry.txRef)),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Icon(
            directionIcon(entry.direction),
            contentDescription = null,
            tint = colors.textSecondary,
            modifier = Modifier.size(24.dp),
        )
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Text(amount(entry, entry.amount), style = AirType.body, color = colors.text)
            Text(stringResource(statusText(entry.status)), style = AirType.subheadline, color = colors.textSecondary)
            entry.counterparty?.let {
                Text(
                    it,
                    style = AirType.caption.copy(fontFamily = FontFamily.Monospace),
                    color = colors.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.MiddleEllipsis,
                )
            }
            Text(date(context, entry.createdAt), style = AirType.caption, color = colors.textSecondary)
        }
        Icon(
            Icons.AutoMirrored.Rounded.KeyboardArrowRight,
            contentDescription = null,
            tint = colors.textTertiary,
            modifier = Modifier.size(22.dp),
        )
    }
}

@Composable
private fun TransactionScreen(
    model: WalletHistoryModel,
    state: WalletHistoryModel.State,
    entry: WalletTransactionEntry,
    accountName: String,
    onLock: () -> Unit,
) {
    val colors = Air.colors
    val context = LocalContext.current
    val idle = state.activity == WalletHistoryModel.Activity.IDLE
    AirScreen(
        title = stringResource(R.string.wallet_transaction),
        largeTitle = false,
        onBack = { model.closeDetail() },
        backTag = TRANSACTION_BACK_TAG,
        backDescription = stringResource(R.string.detail_back),
        listTag = TRANSACTION_TAG,
        actions = { PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock) },
    ) {
        item(key = "summary") {
            AirSection {
                Text(
                    amount(entry, entry.amount),
                    style = AirType.title2,
                    color = colors.text,
                    modifier = Modifier.padding(horizontal = 20.dp, vertical = 14.dp),
                )
                RowDivider()
                AirRow(
                    title = stringResource(statusText(entry.status)),
                    icon = directionIcon(entry.direction),
                    modifier = Modifier.testTag(TRANSACTION_STATUS_TAG),
                )
                RowDivider()
                AirRow(
                    title = stringResource(R.string.wallet_direction),
                    value = stringResource(directionText(entry.direction)),
                )
                RowDivider()
                AirRow(title = stringResource(R.string.wallet_fee), value = amount(entry, entry.fee))
            }
        }
        item(key = "account") {
            AirSection(header = stringResource(R.string.wallet_account_details)) {
                AirRow(title = stringResource(R.string.wallet_account), value = accountName)
                RowDivider()
                AirRow(
                    title = stringResource(R.string.wallet_network),
                    value = WalletNetwork.displayName(entry.network),
                )
            }
        }
        item(key = "details") {
            AirSection(header = stringResource(R.string.wallet_transaction_details)) {
                entry.counterparty?.let { counterparty ->
                    AirRow(title = stringResource(R.string.wallet_counterparty), subtitle = counterparty)
                    ActionRow(
                        stringResource(R.string.wallet_copy_counterparty),
                        onClick = { model.copy(WalletHistoryModel.CopyField.COUNTERPARTY) },
                    )
                    RowDivider()
                }
                AirRow(
                    title = stringResource(R.string.wallet_reference),
                    subtitle = entry.txHash ?: entry.messageRef ?: entry.txRef,
                )
                ActionRow(
                    stringResource(if (state.copied) R.string.wallet_copied else R.string.wallet_copy_reference),
                    onClick = { model.copy(WalletHistoryModel.CopyField.REFERENCE) },
                    modifier = Modifier.testTag(TRANSACTION_COPY_REFERENCE_TAG),
                )
                RowDivider()
                AirRow(title = stringResource(R.string.wallet_created), value = date(context, entry.createdAt))
                RowDivider()
                AirRow(title = stringResource(R.string.wallet_updated), value = date(context, entry.updatedAt))
                entry.validUntil?.let { validUntil ->
                    RowDivider()
                    AirRow(
                        title = stringResource(R.string.wallet_valid_until),
                        value = date(context, validUntil * 1000),
                    )
                }
            }
        }
        item(key = "refresh") {
            AirSection(footer = if (!state.providerReady) stringResource(R.string.wallet_status_off) else null) {
                state.issue?.let {
                    AirRow(title = stringResource(historyIssueText(it)), titleColor = colors.textSecondary)
                }
                ActionRow(
                    stringResource(R.string.wallet_refresh_status),
                    onClick = model::refreshSelected,
                    enabled = state.providerReady && idle && !state.reviewingRebroadcast,
                    modifier = Modifier.testTag(TRANSACTION_REFRESH_TAG),
                )
                if (!idle) Loading(R.string.wallet_updating)
            }
        }
        if (model.canOfferRebroadcast) {
            item(key = "rebroadcast") { Rebroadcast(model, state, idle) }
        }
        item(key = "tab-bar-clearance") { TabBarClearance() }
    }
}

@Composable
private fun Rebroadcast(model: WalletHistoryModel, state: WalletHistoryModel.State, idle: Boolean) {
    val colors = Air.colors
    val focus = remember { FocusRequester() }
    LaunchedEffect(
        state.passwordFocusRevision,
    ) { if (state.passwordFocusRevision > 0) runCatching { focus.requestFocus() } }
    AirSection(
        header = stringResource(R.string.wallet_rebroadcast),
        footer = stringResource(R.string.wallet_rebroadcast_text),
    ) {
        when {
            model.requiresRebroadcastRefresh ->
                AirRow(title = stringResource(R.string.wallet_rebroadcast_refresh), titleColor = colors.textSecondary)
            state.reviewingRebroadcast -> {
                val label = stringResource(R.string.wallet_admin_password)
                val error = state.issue?.takeIf {
                    it == WalletHistoryModel.Issue.PASSWORD_REQUIRED || it == WalletHistoryModel.Issue.REAUTHENTICATION
                }?.let { stringResource(historyIssueText(it)) }
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 56.dp)
                        .padding(horizontal = 20.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(3.dp),
                ) {
                    Text(label, style = AirType.footnote, color = colors.textSecondary)
                    BasicTextField(
                        value = state.rebroadcastPassword,
                        onValueChange = model::changeRebroadcastPassword,
                        enabled = idle,
                        singleLine = true,
                        textStyle = AirType.body.copy(color = colors.text),
                        cursorBrush = SolidColor(colors.accent),
                        visualTransformation = PasswordVisualTransformation(),
                        keyboardOptions = KeyboardOptions(
                            keyboardType = KeyboardType.Password,
                            autoCorrectEnabled = false,
                        ),
                        modifier = Modifier
                            .fillMaxWidth()
                            .focusRequester(focus)
                            .airEditableField(label, error)
                            .testTag(REBROADCAST_PASSWORD_TAG),
                    )
                }
                RowDivider()
                ActionRow(
                    stringResource(R.string.wallet_confirm_rebroadcast),
                    onClick = model::confirmRebroadcast,
                    enabled = model.canRebroadcast && idle,
                    modifier = Modifier.testTag(REBROADCAST_CONFIRM_TAG),
                )
                RowDivider()
                ActionRow(stringResource(R.string.form_cancel), onClick = model::cancelRebroadcast, enabled = idle)
            }
            else -> ActionRow(
                stringResource(R.string.wallet_rebroadcast),
                onClick = model::beginRebroadcast,
                enabled = model.canRebroadcast && idle,
                modifier = Modifier.testTag(REBROADCAST_TAG),
            )
        }
        if (!model.canRebroadcast && !model.requiresRebroadcastRefresh) {
            AirRow(title = stringResource(R.string.wallet_rebroadcast_off), titleColor = colors.textSecondary)
        }
    }
}

/** An amount of the journal in its network's decimals when it is in the network's unit. */
private fun amount(entry: WalletTransactionEntry, value: String): String {
    val network = WalletNetwork.of(entry.network)
    return if (network != null && entry.amountUnit == network.amountUnit) network.formatted(
        value,
    ) else "$value ${entry.amountUnit}"
}

private fun date(context: android.content.Context, millis: Long): String =
    DateUtils.formatDateTime(context, millis, DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_SHOW_TIME)

private fun directionIcon(direction: WalletTransactionDirection?): ImageVector = when (direction) {
    WalletTransactionDirection.Incoming -> Icons.AutoMirrored.Rounded.CallReceived
    WalletTransactionDirection.Outgoing -> Icons.AutoMirrored.Rounded.CallMade
    else -> Icons.Rounded.SwapHoriz
}

private fun directionText(direction: WalletTransactionDirection?): Int = when (direction) {
    WalletTransactionDirection.Incoming -> R.string.wallet_incoming
    WalletTransactionDirection.Outgoing -> R.string.wallet_outgoing
    else -> R.string.wallet_unknown
}

private fun statusText(status: String): Int = when (status) {
    "pending" -> R.string.wallet_pending
    "confirmed" -> R.string.wallet_confirmed
    "failed" -> R.string.wallet_failed_status
    "broadcasting" -> R.string.wallet_broadcasting
    "broadcast_unknown" -> R.string.wallet_broadcast_unknown
    else -> R.string.wallet_unknown
}

private fun historyIssueText(issue: WalletHistoryModel.Issue): Int = when (issue) {
    WalletHistoryModel.Issue.LOAD -> R.string.wallet_history_load
    WalletHistoryModel.Issue.SYNCHRONIZATION -> R.string.wallet_history_sync
    WalletHistoryModel.Issue.REFRESH -> R.string.wallet_history_refresh
    WalletHistoryModel.Issue.UNAVAILABLE -> R.string.wallet_history_unavailable
    WalletHistoryModel.Issue.DENIED -> R.string.wallet_issue_access
    WalletHistoryModel.Issue.PASSWORD_REQUIRED -> R.string.wallet_issue_password
    WalletHistoryModel.Issue.REAUTHENTICATION -> R.string.wallet_issue_reauth
    WalletHistoryModel.Issue.REBROADCAST_UNKNOWN -> R.string.wallet_history_rebroadcast_unknown
    WalletHistoryModel.Issue.REBROADCAST_INELIGIBLE -> R.string.wallet_history_ineligible
}
