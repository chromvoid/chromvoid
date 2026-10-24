package com.chromvoid.air.ui.wallet

import android.content.Intent
import android.text.format.DateUtils
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ContentCopy
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.Check
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.MoreHoriz
import androidx.compose.material.icons.rounded.QrCode2
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.chromvoid.air.bridge.wire.WalletAccountMeta
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirMenuItem
import com.chromvoid.air.ui.design.AirQrCode
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DoneButton
import com.chromvoid.air.ui.design.LinkButton
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.PillText
import com.chromvoid.air.ui.design.PrimaryButton
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.SecondaryButton
import com.chromvoid.air.ui.design.TabBarClearance
import com.chromvoid.air.ui.root.CoversTabBar

public const val WALLET_NETWORK_TAG: String = "wallet-network"
public const val WALLET_NETWORK_BACK_TAG: String = "wallet-network-back"
public const val WALLET_NETWORK_MENU_TAG: String = "wallet-network-menu"
public const val WALLET_ADD_ANOTHER_TAG: String = "wallet-add-another"
public const val WALLET_NETWORK_BALANCE_TAG: String = "wallet-network-balance"
public const val WALLET_NETWORK_RECEIVE_TAG: String = "wallet-network-receive"
public const val WALLET_NETWORK_SEND_TAG: String = "wallet-network-send"
public const val WALLET_NETWORK_ACTIVITY_TAG: String = "wallet-network-activity"
public const val WALLET_COPY_ADDRESS_TAG: String = "wallet-copy-address"
public const val WALLET_NEW_ADDRESS_TAG: String = "wallet-new-address"
public const val WALLET_ADDRESS_TAG: String = "wallet-address"
public const val RECEIVE_TAG: String = "wallet-receive-sheet"
public const val RECEIVE_CLOSE_TAG: String = "wallet-receive-close"
public const val RECEIVE_ADDRESS_TAG: String = "wallet-receive-address"
public const val RECEIVE_COPY_TAG: String = "wallet-receive-copy"
public const val RECEIVE_SHARE_TAG: String = "wallet-receive-share"
public const val ADD_ACCOUNT_TAG: String = "wallet-add-account"
public const val ADD_ACCOUNT_CONFIRM_TAG: String = "wallet-add-account-confirm"
public const val ACCOUNT_ISSUE_TAG: String = "wallet-account-issue"

public fun receiveNetworkTag(network: String): String = "wallet-receive-network-$network"

public fun accountNetworkTag(network: String): String = "wallet-account-network-$network"

/** One network of the wallet: its balance, Receive, the receive address and, for Bitcoin, a fresh one. */
@Composable
internal fun WalletNetworkScreen(model: WalletModel, state: WalletModel.State, accountId: String, onLock: () -> Unit) {
    val account = state.walletAccounts.firstOrNull { it.accountID == accountId }
    val colors = Air.colors
    AirScreen(
        title = account?.let { WalletNetwork.displayName(it.network) }.orEmpty(),
        largeTitle = false,
        onBack = model::closeNetwork,
        backTag = WALLET_NETWORK_BACK_TAG,
        backDescription = stringResource(R.string.detail_back),
        listTag = WALLET_NETWORK_TAG,
        actions = {
            val derivable = account != null && account.network in state.derivableNetworks(state.selectedWallet)
            NetworkMenu(model, state, account, derivable)
            PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock)
        },
    ) {
        if (account == null) {
            item(key = "gone") {
                AirSection {
                    AirRow(title = stringResource(R.string.wallet_account_gone), titleColor = colors.textSecondary)
                }
            }
            return@AirScreen
        }
        item(key = "balance") {
            Column(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                NetworkBadge(account.network, size = 56.dp)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    if (account.accountID in state.balanceLoading) {
                        CircularProgressIndicator(
                            color = colors.accent,
                            strokeWidth = 2.dp,
                            modifier = Modifier.size(18.dp),
                        )
                    }
                    Text(
                        state.formattedBalance(account) ?: "—",
                        style = AirType.largeTitle,
                        color = colors.text,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.testTag(WALLET_NETWORK_BALANCE_TAG),
                    )
                }
                state.balance(account)?.let { balance ->
                    Text(
                        stringResource(R.string.wallet_last_updated, relativeTime(balance.fetchedAt)),
                        style = AirType.footnote,
                        color = colors.textSecondary,
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    PrimaryButton(
                        stringResource(R.string.wallet_send),
                        onClick = model::openSend,
                        enabled = state.canSend && state.accountState == WalletModel.AccountState.IDLE,
                        modifier = Modifier.weight(1f).testTag(WALLET_NETWORK_SEND_TAG),
                    )
                    SecondaryButton(
                        stringResource(R.string.wallet_receive),
                        onClick = model::openReceive,
                        enabled = state.accountState != WalletModel.AccountState.WORKING,
                        modifier = Modifier.weight(1f).testTag(WALLET_NETWORK_RECEIVE_TAG),
                    )
                }
            }
        }
        item(key = "address") {
            AirSection(
                header = stringResource(R.string.wallet_receiving_address),
                footer = stringResource(
                    when (account.network) {
                        "bitcoin" -> R.string.wallet_bitcoin_addresses
                        else -> R.string.wallet_same_address
                    },
                ),
            ) {
                val address = state.address(account)
                if (address == null) {
                    AirRow(title = stringResource(R.string.wallet_no_address), titleColor = colors.textSecondary)
                } else {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        WalletAddressText(
                            address,
                            singleLine = true,
                            modifier = Modifier.weight(1f).testTag(WALLET_ADDRESS_TAG),
                        )
                        CopyButton(copied = state.addressCopied, tag = WALLET_COPY_ADDRESS_TAG) {
                            model.copyAddress(account.accountID)
                        }
                    }
                }
                if (account.network == "bitcoin" && account.accountModel == "utxo") {
                    RowDivider()
                    AirRow(
                        title = stringResource(R.string.wallet_new_address),
                        titleColor = colors.accent,
                        value = account.nextReceiveIndex?.takeIf { it > 0 }?.let {
                            stringResource(R.string.wallet_used, it.toString())
                        },
                        enabled = state.accountState == WalletModel.AccountState.IDLE,
                        onClick = { model.generateReceivingAddress(account.accountID) },
                        modifier = Modifier.testTag(WALLET_NEW_ADDRESS_TAG),
                    )
                }
            }
        }
        item(key = "activity") {
            AirSection {
                AirRow(
                    title = stringResource(R.string.wallet_activity),
                    icon = Icons.Rounded.History,
                    chevron = true,
                    onClick = model::openHistory,
                    modifier = Modifier.testTag(WALLET_NETWORK_ACTIVITY_TAG),
                )
            }
        }
        if (state.accountState == WalletModel.AccountState.WORKING) {
            item(key = "working") { Loading(R.string.wallet_updating_account) }
        }
        item(key = "tab-bar-clearance") { TabBarClearance() }
    }
}

@Composable
private fun NetworkMenu(model: WalletModel, state: WalletModel.State, account: WalletAccountMeta?, derivable: Boolean) {
    var open by remember { mutableStateOf(false) }
    Box {
        // The menu holds its place while the account loads, so the title never moves.
        PillIcon(
            Icons.Rounded.MoreHoriz,
            stringResource(R.string.vault_more),
            onClick = { open = true },
            enabled = derivable,
            modifier = Modifier.testTag(WALLET_NETWORK_MENU_TAG),
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            AirMenuItem(
                R.string.wallet_add_another,
                Icons.Rounded.Add,
                WALLET_ADD_ANOTHER_TAG,
                enabled = state.accountState == WalletModel.AccountState.IDLE,
            ) {
                open = false
                account?.let { model.openAddAccount(it.network) }
            }
        }
    }
}

/** The receive address of the wallet, one network at a time, or a new account; drawn over the wallet. */
@Composable
internal fun WalletAccountSheet(
    model: WalletModel,
    state: WalletModel.State,
    route: WalletModel.AccountRoute,
    onLock: () -> Unit,
) {
    CoversTabBar()
    BackHandler(onBack = model::closeAccountRoute)
    val adding = route is WalletModel.AccountRoute.Add
    val working = state.accountState == WalletModel.AccountState.WORKING
    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Air.colors.canvas)
            .pointerInput(Unit) { detectTapGestures {} }
            .testTag(if (adding) ADD_ACCOUNT_TAG else RECEIVE_TAG),
    ) {
        AirScreen(
            title = stringResource(if (adding) R.string.wallet_add_account else R.string.wallet_receive),
            largeTitle = false,
            leading = {
                DoneButton(
                    stringResource(R.string.form_close),
                    onClick = { if (!working) model.closeAccountRoute() },
                    modifier = Modifier.testTag(RECEIVE_CLOSE_TAG),
                )
            },
            actions = {
                PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock)
                if (adding) {
                    PillText(
                        stringResource(R.string.wallet_add_action),
                        onClick = model::addAccount,
                        enabled = state.accountState == WalletModel.AccountState.IDLE &&
                            state.phase == WalletModel.Phase.READY,
                        emphasized = true,
                        modifier = Modifier.testTag(ADD_ACCOUNT_CONFIRM_TAG),
                    )
                }
            },
        ) {
            state.accountIssue?.let { issue ->
                item(key = "issue") {
                    AirSection(modifier = Modifier.testTag(ACCOUNT_ISSUE_TAG)) {
                        AirRow(title = stringResource(accountIssueText(issue)), titleColor = Air.colors.danger)
                    }
                }
            }
            if (state.accountState == WalletModel.AccountState.UNCERTAIN) {
                item(key = "uncertain") {
                    AirSection {
                        if (adding) {
                            ActionRow(stringResource(R.string.wallet_close_check), onClick = model::closeAccountRoute)
                        } else {
                            ActionRow(
                                stringResource(R.string.wallet_checked),
                                onClick = model::acknowledgeReconciliation,
                                enabled = state.phase == WalletModel.Phase.READY,
                            )
                        }
                    }
                }
            }
            if (adding) addAccount(model, state) else receive(model, state)
            if (working) item(key = "working") { Loading(R.string.wallet_updating_account) }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.addAccount(model: WalletModel, state: WalletModel.State) {
    item(key = "add") {
        AirSection(footer = stringResource(R.string.wallet_new_account_text)) {
            val wallet = state.accountWallet
            if (wallet == null) {
                AirRow(title = stringResource(R.string.wallet_gone), titleColor = Air.colors.textSecondary)
            } else {
                AirRow(title = stringResource(R.string.vault_wallet), value = wallet.label)
            }
        }
    }
    item(key = "networks") {
        AirSection(header = stringResource(R.string.wallet_network)) {
            state.derivableNetworks.forEachIndexed { index, network ->
                if (index > 0) RowDivider()
                val chosen = state.accountNetwork == network
                AirRow(
                    title = WalletNetwork.displayName(network),
                    enabled = state.accountState == WalletModel.AccountState.IDLE,
                    onClick = { model.chooseAccountNetwork(network) },
                    modifier = Modifier.semantics { selected = chosen }.testTag(accountNetworkTag(network)),
                    trailing = {
                        if (chosen) Icon(Icons.Rounded.Check, contentDescription = null, tint = Air.colors.accent)
                    },
                )
            }
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.receive(model: WalletModel, state: WalletModel.State) {
    val account = state.receivingAccount
    if (account == null) {
        item(key = "gone") {
            AirSection {
                AirRow(title = stringResource(R.string.wallet_account_gone), titleColor = Air.colors.textSecondary)
            }
        }
        return
    }
    if (state.walletAccounts.size > 1) {
        item(key = "chips") {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                state.walletAccounts.forEach { candidate ->
                    val active = candidate.accountID == account.accountID
                    Text(
                        WalletNetwork.displayName(candidate.network),
                        style = AirType.subheadline.copy(
                            fontWeight = if (active) FontWeight.SemiBold else FontWeight.Normal,
                        ),
                        color = if (active) Air.colors.onContainer else Air.colors.text,
                        modifier = Modifier
                            .background(if (active) Air.colors.container else Air.colors.surfaceSecondary, CircleShape)
                            .clickable(
                                enabled = state.accountState != WalletModel.AccountState.WORKING,
                                role = Role.Tab,
                            ) { model.switchReceivingAccount(candidate.accountID) }
                            .semantics { selected = active }
                            .padding(horizontal = 14.dp, vertical = 7.dp)
                            .testTag(receiveNetworkTag(candidate.network)),
                    )
                }
            }
        }
    }
    item(key = "address") { ReceiveAddress(model, state, account) }
    if (state.canDeriveReceiveAddress) {
        item(key = "new-address") {
            AirSection(footer = stringResource(R.string.wallet_bitcoin_addresses)) {
                ActionRow(
                    stringResource(R.string.wallet_new_address),
                    onClick = { model.generateReceivingAddress(account.accountID) },
                    enabled = state.accountState == WalletModel.AccountState.IDLE,
                )
            }
        }
    }
}

@Composable
private fun ReceiveAddress(model: WalletModel, state: WalletModel.State, account: WalletAccountMeta) {
    val share = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {}
    AirSection(footer = stringResource(R.string.wallet_receive_warning)) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            val address = state.receivingAddress
            if (address != null) {
                AirQrCode(address)
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Text(
                        stringResource(R.string.wallet_address_of, WalletNetwork.displayName(account.network)),
                        style = AirType.footnote,
                        color = Air.colors.textSecondary,
                    )
                    WalletAddressText(address, modifier = Modifier.testTag(RECEIVE_ADDRESS_TAG))
                }
                Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    PrimaryButton(
                        stringResource(if (state.addressCopied) R.string.wallet_copied else R.string.wallet_copy),
                        onClick = model::copyReceivingAddress,
                        modifier = Modifier.weight(1f).testTag(RECEIVE_COPY_TAG),
                    )
                    SecondaryButton(
                        stringResource(R.string.wallet_share),
                        onClick = {
                            val send = Intent(Intent.ACTION_SEND)
                                .setType("text/plain")
                                .putExtra(Intent.EXTRA_TEXT, address)
                            // Started for a result, so the app counts the share sheet as its own step.
                            share.launch(Intent.createChooser(send, null))
                        },
                        modifier = Modifier.weight(1f).testTag(RECEIVE_SHARE_TAG),
                    )
                }
            } else if (state.accountState != WalletModel.AccountState.WORKING) {
                Text(stringResource(R.string.wallet_no_address), style = AirType.body, color = Air.colors.textSecondary)
            }
        }
    }
}

/** A copy control that confirms with a check. */
@Composable
private fun CopyButton(copied: Boolean, tag: String, onClick: () -> Unit) {
    val label = stringResource(R.string.wallet_copy_address)
    Box(
        modifier = Modifier
            .size(40.dp)
            .background(Air.colors.surfaceSecondary, RoundedCornerShape(10.dp))
            .clickable(role = Role.Button, onClick = onClick)
            .semantics { contentDescription = label }
            .testTag(tag),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            if (copied) Icons.Rounded.Check else Icons.Outlined.ContentCopy,
            contentDescription = null,
            tint = Air.colors.accent,
            modifier = Modifier.size(20.dp),
        )
    }
}

/**
 * An address in monospace with its first and last six characters stressed,
 * so it can be checked at a glance against another copy.
 */
@Composable
internal fun WalletAddressText(address: String, modifier: Modifier = Modifier, singleLine: Boolean = false) {
    val colors = Air.colors
    val head = address.take(6)
    val tail = address.drop(6).takeLast(6)
    val middle = address.drop(6).dropLast(tail.length)
    Text(
        buildAnnotatedString {
            withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = colors.text)) { append(head) }
            withStyle(SpanStyle(color = colors.textSecondary)) { append(middle) }
            withStyle(SpanStyle(fontWeight = FontWeight.Bold, color = colors.text)) { append(tail) }
        },
        style = AirType.callout.copy(fontFamily = FontFamily.Monospace, fontSize = 15.sp),
        textAlign = if (singleLine) TextAlign.Start else TextAlign.Center,
        maxLines = if (singleLine) 1 else Int.MAX_VALUE,
        overflow = if (singleLine) TextOverflow.MiddleEllipsis else TextOverflow.Clip,
        modifier = modifier,
    )
}

private fun relativeTime(millis: Long): String =
    DateUtils.getRelativeTimeSpanString(millis, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString()

private fun accountIssueText(issue: WalletModel.AccountIssue): Int = when (issue) {
    WalletModel.AccountIssue.CHOOSE_NETWORK -> R.string.wallet_issue_network
    WalletModel.AccountIssue.DENIED -> R.string.wallet_issue_denied
    WalletModel.AccountIssue.UNAVAILABLE -> R.string.wallet_issue_account_unavailable
    WalletModel.AccountIssue.INVALID_INPUT -> R.string.wallet_issue_account_invalid
    WalletModel.AccountIssue.UNCERTAIN -> R.string.wallet_uncertain
}
