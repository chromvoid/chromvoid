package com.chromvoid.air.ui.wallet

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.KeyboardArrowRight
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Contacts
import androidx.compose.material.icons.outlined.Download
import androidx.compose.material.icons.outlined.IosShare
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.Add
import androidx.compose.material.icons.rounded.AddCircle
import androidx.compose.material.icons.rounded.ArrowOutward
import androidx.compose.material.icons.rounded.History
import androidx.compose.material.icons.rounded.QrCode2
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.bridge.wire.WalletAccountMeta
import com.chromvoid.air.bridge.wire.WalletSummary
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirMenuItem
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.CardCyan
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.StatusBlock
import com.chromvoid.air.ui.design.TabBarClearance

public const val WALLET_TAG: String = "wallet"
public const val WALLET_LIST_TAG: String = "wallet-list"
public const val WALLET_BACK_TAG: String = "wallet-back"
public const val WALLET_ADD_TAG: String = "wallet-add"
public const val WALLET_CARDS_TAG: String = "wallet-cards"
public const val WALLET_RECEIVE_TAG: String = "wallet-receive"
public const val WALLET_SEND_TAG: String = "wallet-send-action"
public const val WALLET_ACTIVITY_TAG: String = "wallet-activity"
public const val WALLET_ASSETS_TAG: String = "wallet-assets"
public const val WALLET_EMPTY_TAG: String = "wallet-empty"
public const val WALLET_UNAVAILABLE_TAG: String = "wallet-unavailable"
public const val WALLET_CHECKED_TAG: String = "wallet-checked"
public const val WALLET_CONTACTS_TAG: String = "wallet-contacts-action"
public const val WALLET_EXPORT_TAG: String = "wallet-export"

public fun walletSetupTag(intent: WalletSetupModel.Intent): String = "wallet-setup-${intent.name.lowercase()}"

public fun walletCardTag(walletId: String): String = "wallet-card-$walletId"

public fun walletAssetTag(network: String): String = "wallet-asset-$network"

/**
 * The wallet under the vault, as iOS shows it: the wallets as cards paged
 * sideways, the selected one's actions under its card, and its networks with
 * their balances. The network screen and the sheets draw over it.
 */
@Composable
public fun WalletRoot(model: WalletModel, onBack: () -> Unit, onLock: () -> Unit, modifier: Modifier = Modifier) {
    val state by model.state.collectAsStateWithLifecycle()
    LaunchedEffect(model) { if (state.phase == WalletModel.Phase.LOADING && state.status == null) model.reload() }
    val network = state.networkAccountId
    val history = state.history
    Box(modifier = modifier.testTag(WALLET_TAG)) {
        when {
            state.historyShown && history != null -> WalletHistoryScreen(
                history,
                accountName = state.selectedAccount?.label ?: history.accountId,
                onBack = model::closeHistory,
                onLock = onLock,
            )
            network != null -> {
                BackHandler(enabled = state.presentation == null, onBack = model::closeNetwork)
                WalletNetworkScreen(model, state, network, onLock)
            }
            else -> {
                BackHandler(enabled = state.presentation == null, onBack = onBack)
                WalletCatalog(model, state, onBack, onLock)
            }
        }
        when (val sheet = state.presentation) {
            is WalletModel.Presentation.Setup -> WalletSetupScreen(sheet.model, onClose = model::closeSetup)
            is WalletModel.Presentation.Send ->
                WalletSendScreen(
                    sheet.model,
                    model.addressBook,
                    onClose = model::closeSend,
                    onActivity = model::showSendHistory,
                    onLock = onLock,
                )
            is WalletModel.Presentation.Account -> WalletAccountSheet(model, state, sheet.route, onLock)
            WalletModel.Presentation.Contacts ->
                WalletAddressBookScreen(model.addressBook, onClose = model::closeAddressBook, onLock = onLock)
            is WalletModel.Presentation.Recovery ->
                WalletRecoveryScreen(sheet.model, onClose = model::closeRecovery, onLock = onLock)
            null -> Unit
        }
    }
}

@Composable
private fun WalletCatalog(model: WalletModel, state: WalletModel.State, onBack: () -> Unit, onLock: () -> Unit) {
    AirScreen(
        title = stringResource(R.string.vault_wallet),
        onBack = onBack,
        backTag = WALLET_BACK_TAG,
        backDescription = stringResource(R.string.detail_back),
        listTag = WALLET_LIST_TAG,
        actions = {
            AddMenu(model, state)
            PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock)
        },
    ) {
        if (state.accountState == WalletModel.AccountState.UNCERTAIN) {
            item(key = "uncertain") {
                AirSection {
                    AirRow(title = stringResource(R.string.wallet_uncertain), titleColor = Air.colors.danger)
                    ActionRow(
                        stringResource(R.string.wallet_checked),
                        onClick = model::acknowledgeReconciliation,
                        enabled = state.phase == WalletModel.Phase.READY,
                        modifier = Modifier.testTag(WALLET_CHECKED_TAG),
                    )
                }
            }
        }
        when (state.phase) {
            WalletModel.Phase.LOADING -> if (state.status == null) {
                item(key = "loading") { Loading(R.string.wallet_loading) }
            }
            WalletModel.Phase.FAILED -> item(key = "failed") {
                StatusBlock(
                    stringResource(R.string.wallet_failed),
                    action = stringResource(R.string.vault_try_again),
                    onAction = model::reload,
                )
            }
            WalletModel.Phase.REVOKED -> Unit
            WalletModel.Phase.READY -> Unit
        }
        if (state.status != null && state.phase != WalletModel.Phase.FAILED) {
            if (!state.walletsEnabled) {
                item(key = "unavailable") {
                    AirSection(modifier = Modifier.testTag(WALLET_UNAVAILABLE_TAG)) {
                        AirRow(
                            title = stringResource(R.string.wallet_unavailable),
                            titleColor = Air.colors.textSecondary,
                        )
                    }
                }
            }
            if (state.wallets.isEmpty()) {
                item(key = "empty") {
                    StatusBlock(
                        stringResource(R.string.wallet_empty),
                        message = if (state.walletsEnabled) stringResource(R.string.wallet_empty_text) else null,
                        icon = Icons.Outlined.AccountBalanceWallet,
                        modifier = Modifier.testTag(WALLET_EMPTY_TAG),
                    )
                }
            } else {
                item(key = "cards") { WalletCards(model, state) }
                item(key = "actions") { WalletActions(model, state) }
                item(key = "networks") { Networks(model, state) }
                item(key = "export") { Export(model, state) }
            }
        }
        item(key = "tab-bar-clearance") { TabBarClearance() }
    }
}

@Composable
private fun AddMenu(model: WalletModel, state: WalletModel.State) {
    var open by remember { mutableStateOf(false) }
    Box {
        PillIcon(
            Icons.Rounded.Add,
            stringResource(R.string.wallet_add),
            onClick = { open = true },
            enabled = state.phase == WalletModel.Phase.READY &&
                state.walletsEnabled &&
                state.accountState == WalletModel.AccountState.IDLE,
            modifier = Modifier.testTag(WALLET_ADD_TAG),
        )
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            listOf(
                Triple(WalletSetupModel.Intent.CREATE, R.string.wallet_create, Icons.Rounded.AddCircle),
                Triple(WalletSetupModel.Intent.RESTORE, R.string.wallet_restore, Icons.Outlined.Download),
                Triple(WalletSetupModel.Intent.IMPORT_KEY, R.string.wallet_import_key, Icons.Outlined.Key),
            ).forEach { (intent, label, icon) ->
                AirMenuItem(label, icon, walletSetupTag(intent)) {
                    open = false
                    model.beginSetup(intent)
                }
            }
        }
    }
}

/** The wallets as cards, one page each; paging selects the wallet. */
@Composable
private fun WalletCards(model: WalletModel, state: WalletModel.State) {
    val index = state.wallets.indexOfFirst { it.walletID == state.selectedWalletId }.coerceAtLeast(0)
    val pager = rememberPagerState(initialPage = index) { state.wallets.size }
    LaunchedEffect(pager, state.wallets) {
        snapshotFlow { pager.settledPage }.collect { page ->
            state.wallets.getOrNull(page)?.let { model.selectWallet(it.walletID) }
        }
    }
    LaunchedEffect(index) { if (pager.settledPage != index) pager.animateScrollToPage(index) }
    Column(modifier = Modifier.fillMaxWidth().testTag(WALLET_CARDS_TAG)) {
        HorizontalPager(
            state = pager,
            contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = 16.dp),
            pageSpacing = 12.dp,
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 4.dp),
        ) { page ->
            WalletCardFace(state, state.wallets[page], page)
        }
        if (state.wallets.size > 1) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
            ) {
                state.wallets.indices.forEach { dot ->
                    Box(
                        modifier = Modifier
                            .size(7.dp)
                            .background(
                                if (dot == pager.currentPage) Air.colors.text else Air.colors.textTertiary,
                                CircleShape,
                            ),
                    )
                }
            }
        }
    }
}

@Composable
private fun WalletCardFace(state: WalletModel.State, wallet: WalletSummary, palette: Int) {
    val accounts = state.accounts(wallet.walletID)
    val kind = stringResource(
        when {
            wallet.kind != "hd" -> R.string.wallet_kind_imported
            wallet.walletMode == "ton_only" -> R.string.wallet_kind_telegram
            wallet.mnemonicStandard == "bip39" -> R.string.wallet_kind_bip39
            else -> R.string.wallet_kind_universal
        },
    )
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(176.dp)
            .shadow(14.dp, RoundedCornerShape(18.dp), spotColor = Color.Black.copy(alpha = 0.3f))
            .background(Brush.linearGradient(CARD_GRADIENTS[palette % CARD_GRADIENTS.size]), RoundedCornerShape(18.dp))
            .border(0.5.dp, Color.White.copy(alpha = 0.18f), RoundedCornerShape(18.dp))
            .padding(18.dp)
            .semantics(mergeDescendants = true) {}
            .testTag(walletCardTag(wallet.walletID)),
    ) {
        Column {
            Row(verticalAlignment = Alignment.Top) {
                Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                    Text(
                        wallet.label,
                        style = AirType.title3.copy(fontSize = 19.sp),
                        color = Color.White,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        kind.uppercase(),
                        style = AirType.caption2.copy(fontWeight = FontWeight.SemiBold, letterSpacing = 0.6.sp),
                        color = Color.White.copy(alpha = 0.7f),
                    )
                }
                Icon(
                    Icons.Outlined.AccountBalanceWallet,
                    contentDescription = null,
                    tint = Color.White.copy(alpha = 0.9f),
                    modifier = Modifier.size(24.dp),
                )
            }
            Spacer(Modifier.weight(1f))
            if (accounts.isEmpty()) {
                Text(
                    stringResource(R.string.wallet_no_accounts),
                    style = AirType.footnote,
                    color = Color.White.copy(alpha = 0.8f),
                )
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    accounts.take(3).forEach { account ->
                        val network = WalletNetwork.of(account.network)
                        val amount = state.balance(account)?.let { balance ->
                            network?.decimal(balance.balance.total) ?: balance.balance.total
                        } ?: "—"
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .background(Color.White.copy(alpha = 0.14f), RoundedCornerShape(12.dp))
                                .padding(horizontal = 10.dp, vertical = 8.dp),
                            verticalArrangement = Arrangement.spacedBy(2.dp),
                        ) {
                            Text(
                                network?.symbol ?: account.network.uppercase(),
                                style = AirType.caption2.copy(fontWeight = FontWeight.Medium),
                                color = Color.White.copy(alpha = 0.8f),
                            )
                            Text(
                                amount,
                                style = AirType.callout.copy(fontWeight = FontWeight.SemiBold),
                                color = Color.White,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis,
                            )
                        }
                    }
                }
            }
        }
    }
}

/** The wallet's actions under its card, as round buttons. */
@Composable
private fun WalletActions(model: WalletModel, state: WalletModel.State) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        WalletAction(
            R.string.wallet_send,
            Icons.Rounded.ArrowOutward,
            primary = true,
            enabled = state.canSend && state.accountState == WalletModel.AccountState.IDLE,
            tag = WALLET_SEND_TAG,
            onClick = model::openSend,
        )
        WalletAction(
            R.string.wallet_receive,
            Icons.Rounded.QrCode2,
            enabled = state.accountState != WalletModel.AccountState.WORKING && state.selectedAccount != null,
            tag = WALLET_RECEIVE_TAG,
            onClick = model::openReceive,
        )
        WalletAction(
            R.string.wallet_activity,
            Icons.Rounded.History,
            enabled = state.selectedAccount != null,
            tag = WALLET_ACTIVITY_TAG,
            onClick = model::openHistory,
        )
        WalletAction(
            R.string.wallet_contacts,
            Icons.Outlined.Contacts,
            enabled = state.walletsEnabled && state.accountState == WalletModel.AccountState.IDLE,
            tag = WALLET_CONTACTS_TAG,
            onClick = model::openAddressBook,
        )
    }
}

/** Another wallet app can open this one from its phrase; an imported key has none. */
@Composable
private fun Export(model: WalletModel, state: WalletModel.State) {
    AirSection(
        header = stringResource(R.string.wallet_export_header),
        footer = if (state.canRecover) stringResource(R.string.wallet_export_footer) else null,
    ) {
        if (state.canRecover) {
            ActionRow(
                stringResource(R.string.wallet_export_recovery),
                onClick = model::openRecovery,
                icon = Icons.Outlined.IosShare,
                enabled = state.accountState == WalletModel.AccountState.IDLE,
                modifier = Modifier.testTag(WALLET_EXPORT_TAG),
            )
        } else {
            AirRow(title = stringResource(R.string.wallet_export_unavailable), titleColor = Air.colors.textSecondary)
        }
    }
}

@Composable
internal fun androidx.compose.foundation.layout.RowScope.WalletAction(
    label: Int,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    primary: Boolean = false,
    enabled: Boolean,
    tag: String,
    onClick: () -> Unit,
) {
    val colors = Air.colors
    Column(
        modifier = Modifier
            .weight(1f)
            .alpha(if (enabled) 1f else 0.45f)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
            .testTag(tag),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            modifier = Modifier.size(56.dp).background(if (primary) colors.button else colors.card, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                icon,
                contentDescription = null,
                tint = if (primary) colors.onButton else colors.accent,
                modifier = Modifier.size(24.dp),
            )
        }
        Text(
            stringResource(label),
            style = AirType.caption,
            color = colors.text,
            maxLines = 1,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun Networks(model: WalletModel, state: WalletModel.State) {
    AirSection(
        header = stringResource(R.string.wallet_networks),
        footer = stringResource(if (state.canSend) R.string.wallet_send_hint else R.string.wallet_send_unavailable),
        modifier = Modifier.testTag(WALLET_ASSETS_TAG),
    ) {
        val accounts = state.walletAccounts
        if (accounts.isEmpty()) {
            AirRow(title = stringResource(R.string.wallet_no_accounts), titleColor = Air.colors.textSecondary)
        }
        accounts.forEachIndexed { index, account ->
            if (index > 0) RowDivider(inset = 64.dp)
            AssetRow(state, account, onClick = { model.openNetwork(account.accountID) })
        }
    }
}

@Composable
private fun AssetRow(state: WalletModel.State, account: WalletAccountMeta, onClick: () -> Unit) {
    val colors = Air.colors
    val loading = account.accountID in state.balanceLoading
    val updating = stringResource(R.string.wallet_updating_balance)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClick = onClick)
            .heightIn(min = 56.dp)
            .padding(horizontal = 20.dp, vertical = 10.dp)
            .testTag(walletAssetTag(account.network)),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        NetworkBadge(account.network)
        Column(modifier = Modifier.weight(1f)) {
            Text(WalletNetwork.displayName(account.network), style = AirType.body, color = colors.text)
            account.label?.takeIf { it != account.network }?.let {
                Text(
                    it,
                    style = AirType.caption,
                    color = colors.textSecondary,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
        }
        if (loading) {
            CircularProgressIndicator(
                color = colors.accent,
                strokeWidth = 2.dp,
                modifier = Modifier.size(16.dp).semantics { contentDescription = updating },
            )
        }
        Text(
            state.formattedBalance(account) ?: "—",
            style = AirType.body,
            color = if (state.balance(account) == null) colors.textSecondary else colors.text,
            textAlign = TextAlign.End,
        )
        Icon(
            Icons.AutoMirrored.Rounded.KeyboardArrowRight,
            contentDescription = null,
            tint = colors.textTertiary,
            modifier = Modifier.size(22.dp),
        )
    }
}

@Composable
internal fun NetworkBadge(network: String, size: androidx.compose.ui.unit.Dp = 32.dp) {
    Box(
        modifier = Modifier.size(size).background(Air.colors.container, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            WalletNetwork.of(network)?.symbol?.take(1) ?: "?",
            style = if (size > 40.dp) AirType.title2 else AirType.caption.copy(fontWeight = FontWeight.SemiBold),
            color = Air.colors.onContainer,
        )
    }
}

@Composable
internal fun Loading(label: Int) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(24.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(color = Air.colors.accent, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
        Text(stringResource(label), style = AirType.subheadline, color = Air.colors.textSecondary)
    }
}

/** The brand cyan first, then muted alternatives so several wallets stay apart. */
private val CARD_GRADIENTS: List<List<Color>> = listOf(
    CardCyan,
    listOf(Color(0xFF5C5E73), Color(0xFF3B3D4D), Color(0xFF242630)),
    listOf(Color(0xFF4D579E), Color(0xFF333B73), Color(0xFF1F2447)),
    listOf(Color(0xFF3D735C), Color(0xFF265242), Color(0xFF173329)),
)
