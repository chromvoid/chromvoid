package com.chromvoid.air.ui.wallet

import com.chromvoid.air.bridge.wire.WalletAccountMeta
import com.chromvoid.air.bridge.wire.WalletAccountMetaKind
import com.chromvoid.air.bridge.wire.WalletAccountsDeriveRequest
import com.chromvoid.air.bridge.wire.WalletAddressesDeriveRequest
import com.chromvoid.air.bridge.wire.WalletBalanceGetResponse
import com.chromvoid.air.bridge.wire.WalletProviderStatus
import com.chromvoid.air.bridge.wire.WalletStatusResponse
import com.chromvoid.air.bridge.wire.WalletSummary
import com.chromvoid.air.ui.credentials.CredentialClipboard
import com.chromvoid.air.ui.support.FailureKind
import com.chromvoid.air.ui.support.failureKind
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The wallet, as iOS shows it under the vault: every wallet as a card, the
 * selected one as a single multichain account whose networks each have a
 * balance fetched live from its provider, a network screen per account, and
 * one sheet at a time over them - setup, send, the contacts, an HD wallet's
 * recovery, or an account's receive address or a new account. Core owns
 * keys, derivation and providers; a lock drops everything here.
 */
public class WalletModel(
    private val store: WalletStore,
    public val generation: ULong,
    private val scope: CoroutineScope,
    private val clipboard: CredentialClipboard,
) {
    public enum class Phase { LOADING, READY, FAILED, REVOKED }

    /** An account sheet: the receive address of one account, or a new account for a wallet. */
    public sealed interface AccountRoute {
        public data class Add(val walletId: String) : AccountRoute

        public data class Receive(val accountId: String) : AccountRoute
    }

    /** The one sheet the wallet shows at a time. */
    public sealed interface Presentation {
        public class Setup(public val model: WalletSetupModel) : Presentation

        public class Send(public val model: WalletSendModel) : Presentation

        public data class Account(val route: AccountRoute) : Presentation

        public data object Contacts : Presentation

        public class Recovery(public val model: WalletRecoveryModel) : Presentation
    }

    public enum class AccountState { IDLE, WORKING, UNCERTAIN }

    public enum class AccountIssue { CHOOSE_NETWORK, DENIED, UNAVAILABLE, INVALID_INPUT, UNCERTAIN }

    public data class State(
        val phase: Phase = Phase.LOADING,
        val status: WalletStatusResponse? = null,
        val wallets: List<WalletSummary> = emptyList(),
        val accounts: List<WalletAccountMeta> = emptyList(),
        val balances: List<WalletBalanceGetResponse> = emptyList(),
        /** Accounts whose live balance is being read. */
        val balanceLoading: Set<String> = emptySet(),
        /** The wallet whose restore discovery is running. */
        val discoveringWalletId: String? = null,
        val selectedWalletId: String? = null,
        val selectedAccountId: String? = null,
        /** The network screen pushed over the wallet, by account. */
        val networkAccountId: String? = null,
        val presentation: Presentation? = null,
        val accountState: AccountState = AccountState.IDLE,
        /** The selected account's activity. */
        val history: WalletHistoryModel? = null,
        /** The activity is pushed over the wallet or the network screen. */
        val historyShown: Boolean = false,
        val accountIssue: AccountIssue? = null,
        /** The network chosen for a new account. */
        val accountNetwork: String? = null,
        val addressCopied: Boolean = false,
    ) {
        val selectedWallet: WalletSummary? get() = wallets.firstOrNull { it.walletID == selectedWalletId }

        /** The selected wallet as one account: its networks in display order. */
        val walletAccounts: List<WalletAccountMeta> get() = selectedWalletId?.let(::accounts).orEmpty()

        val selectedAccount: WalletAccountMeta? get() = walletAccounts.firstOrNull { it.accountID == selectedAccountId }

        val walletsEnabled: Boolean get() = status?.enabled == true

        public fun accounts(walletId: String): List<WalletAccountMeta> =
            accounts.withIndex()
                .filter { it.value.walletID == walletId }
                .sortedWith(compareBy({ WalletNetwork.rank(it.value.network) }, { it.index }))
                .map { it.value }

        public fun balance(account: WalletAccountMeta): WalletBalanceGetResponse? =
            balances.firstOrNull { it.accountID == account.accountID && it.network == account.network }

        /** "1.5 TON", or null while nothing was read yet. */
        public fun formattedBalance(account: WalletAccountMeta): String? {
            val balance = balance(account) ?: return null
            return WalletNetwork.of(account.network)?.formattedTotal(balance)
                ?: "${balance.balance.total} ${balance.balance.amountUnit}"
        }

        val setup: WalletSetupModel? get() = (presentation as? Presentation.Setup)?.model

        val send: WalletSendModel? get() = (presentation as? Presentation.Send)?.model

        val recovery: WalletRecoveryModel? get() = (presentation as? Presentation.Recovery)?.model

        val contactsShown: Boolean get() = presentation == Presentation.Contacts

        /** An HD wallet's phrase can be shown again; an imported key has none to show. */
        val canRecover: Boolean get() = selectedWallet?.kind == "hd" && walletsEnabled

        /** The network an account sends on, when transfers there can be prepared now. */
        public fun sendNetwork(account: WalletAccountMeta): WalletNetwork? {
            val status = status ?: return null
            return WalletNetwork.of(account.network)?.takeIf { it.isAvailable(status) }
        }

        /** Send starts from the selected network when it can transfer, else from the wallet's first one that can. */
        val sendableAccount: WalletAccountMeta?
            get() = selectedAccount?.takeIf { sendNetwork(it) != null }
                ?: walletAccounts.firstOrNull { sendNetwork(it) != null }

        val canSend: Boolean get() = sendableAccount != null

        val accountRoute: AccountRoute? get() = (presentation as? Presentation.Account)?.route

        /** The wallet a new account is added to, or the selected one. */
        val accountWallet: WalletSummary?
            get() {
                val adding = accountRoute as? AccountRoute.Add ?: return selectedWallet
                return wallets.firstOrNull { it.walletID == adding.walletId } ?: selectedWallet
            }

        /** Networks a new account can be derived on for the wallet of the account sheet. */
        val derivableNetworks: List<String> get() = derivableNetworks(accountWallet)

        /** Networks another account can be derived on in [wallet]: a multichain phrase's, while the wallet is open. */
        public fun derivableNetworks(wallet: WalletSummary?): List<String> {
            val multichain = wallet != null && wallet.kind == "hd" && wallet.walletMode == "multichain"
            if (!multichain || !walletsEnabled) return emptyList()
            return status?.networks.orEmpty().filter { it.enabled }.map { it.network }
        }

        val receivingAccount: WalletAccountMeta?
            get() {
                val receiving = accountRoute as? AccountRoute.Receive ?: return null
                return accounts.firstOrNull { it.accountID == receiving.accountId }
            }

        val receivingAddress: String?
            get() {
                if (phase != Phase.READY || accountState == AccountState.WORKING) return null
                return receivingAccount?.let(::address)
            }

        /** A Bitcoin account hands out a fresh address for every transfer. */
        val canDeriveReceiveAddress: Boolean get() = receivingAccount?.let(::derivesAddresses) == true

        public fun address(account: WalletAccountMeta): String? =
            (account.currentReceiveAddress ?: account.address)?.takeIf { it.isNotEmpty() }

        public fun derivesAddresses(account: WalletAccountMeta): Boolean =
            account.kind == WalletAccountMetaKind.Derived &&
                account.accountModel == "utxo" &&
                account.network == "bitcoin" &&
                walletsEnabled &&
                status?.networks.orEmpty().any { it.network == account.network && it.enabled }

        /** Networks a restored wallet still has to scan for the accounts it used. */
        public fun pendingDiscovery(wallet: WalletSummary): List<String> {
            val networks = if (wallet.bitcoinDiscoveryPending == true) mutableListOf("bitcoin") else mutableListOf()
            wallet.accountDiscoveryPending.orEmpty().forEach { if (it !in networks) networks += it }
            return networks
        }

        public fun discoveryPending(account: WalletAccountMeta): Boolean =
            wallets.firstOrNull { it.walletID == account.walletID }
                ?.let { account.network in pendingDiscovery(it) } == true

        public fun providerReady(network: String): Boolean =
            status?.networks.orEmpty().any {
                it.network == network && it.enabled && it.providerStatus == WalletProviderStatus.Ready
            }
    }

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()

    /** The vault's contacts: shown on their own and offered to every transfer's recipients. */
    public val addressBook: WalletAddressBookModel = WalletAddressBookModel(store, generation, scope, clipboard)

    private var work: Job? = null
    private var mutation: Job? = null
    private var discovery: Job? = null
    private val balanceWork = mutableMapOf<String, Job>()

    /** Each account's activity, kept while the account exists so going back keeps its place. */
    private val histories = mutableMapOf<String, WalletHistoryModel>()

    /** Wallet and network pairs whose discovery ran once; a provider failure must not loop it. */
    private val discoveryAttempted = mutableSetOf<String>()
    private var sequence: ULong? = null

    /** A sheet opens only over a ready wallet showing none. */
    private val canPresent: Boolean
        get() = mutableState.value.let { it.phase == Phase.READY && it.presentation == null }

    /** The runtime reported a change; the first call only records where this model starts. */
    public fun synchronize(sequence: ULong) {
        if (mutableState.value.phase == Phase.REVOKED) return
        val previous = this.sequence
        this.sequence = sequence
        if (previous != null && previous != sequence) reload()
    }

    public fun reload() {
        if (mutableState.value.phase == Phase.REVOKED) return
        mutableState.value = mutableState.value.copy(phase = Phase.LOADING, addressCopied = false)
        work?.cancel()
        work = scope.launch {
            try {
                val status = store.walletStatus(generation)
                val wallets = store.walletList(generation).wallets
                val accounts = store.walletAccounts(null, generation)
                updateContactNetworks(status)
                val current = mutableState.value
                val selectedWallet = current.selectedWalletId?.takeIf { id -> wallets.any { it.walletID == id } }
                    ?: wallets.firstOrNull()?.walletID
                val next = current.copy(
                    phase = Phase.READY,
                    status = status,
                    wallets = wallets,
                    accounts = accounts.accounts,
                    balances = accounts.cachedBalances.orEmpty(),
                    selectedWalletId = selectedWallet,
                )
                mutableState.value = reconciled(next)
                refreshBalances()
                runPendingDiscovery()
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (error.failureKind == FailureKind.REVOKED) {
                    revoke()
                } else {
                    mutableState.value = mutableState.value.copy(phase = Phase.FAILED)
                }
            }
        }
    }

    /** A contact names a network the wallet has switched on; an open address book reads again. */
    private fun updateContactNetworks(status: WalletStatusResponse) {
        val open = if (status.enabled) status.networks.filter { it.enabled }.map { it.network } else emptyList()
        addressBook.updateNetworks(open)
        if (mutableState.value.contactsShown) addressBook.reload()
    }

    public fun selectWallet(id: String) {
        val current = mutableState.value
        if (!canPresent || current.accountState == AccountState.WORKING) return
        if (current.wallets.none { it.walletID == id }) return
        mutableState.value = reconciled(current.copy(selectedWalletId = id))
        refreshBalances()
    }

    public fun selectAccount(id: String) {
        val current = mutableState.value
        if (!canPresent || current.accountState == AccountState.WORKING) return
        if (current.walletAccounts.none { it.accountID == id }) return
        mutableState.value = reconciled(current.copy(selectedAccountId = id))
    }

    // Balances

    /**
     * Reads the live balance of every network of the selected wallet whose
     * provider is reachable. Each account has its own request, so a reload or
     * a wallet switch supersedes the last; a failed read keeps the cached value.
     */
    public fun refreshBalances() {
        val current = mutableState.value
        if (current.phase != Phase.READY || !current.walletsEnabled) return
        current.walletAccounts
            .filter { current.providerReady(it.network) && !current.discoveryPending(it) }
            .forEach(::fetchBalance)
    }

    private fun fetchBalance(account: WalletAccountMeta) {
        val id = account.accountID
        balanceWork.remove(id)?.cancel()
        mutableState.value = mutableState.value.copy(balanceLoading = mutableState.value.balanceLoading + id)
        balanceWork[id] = scope.launch {
            try {
                apply(store.walletBalance(id, generation), account)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (error.failureKind == FailureKind.REVOKED) {
                    revoke()
                    return@launch
                }
                // The cached value stays; a provider outage is not a zero balance.
            }
            mutableState.value = mutableState.value.copy(balanceLoading = mutableState.value.balanceLoading - id)
        }
    }

    private fun apply(response: WalletBalanceGetResponse, account: WalletAccountMeta) {
        if (response.accountID != account.accountID || response.network != account.network) return
        val current = mutableState.value
        val index = current.balances.indexOfFirst {
            it.accountID == response.accountID && it.network == response.network
        }
        val balances = when {
            index < 0 -> current.balances + response
            current.balances[index].fetchedAt > response.fetchedAt -> return
            else -> current.balances.toMutableList().also { it[index] = response }
        }
        mutableState.value = current.copy(balances = balances)
    }

    /** Each pending restore discovery runs once, one network at a time; the catalog then reads again. */
    private fun runPendingDiscovery() {
        val current = mutableState.value
        if (current.phase != Phase.READY || !current.walletsEnabled || discovery?.isActive == true) return
        val pending = current.wallets.flatMap { wallet ->
            current.pendingDiscovery(wallet).mapNotNull { network ->
                val key = "${wallet.walletID}:$network"
                val account = current.accounts.firstOrNull { it.walletID == wallet.walletID && it.network == network }
                if (key in discoveryAttempted || !current.providerReady(network)) return@mapNotNull null
                if (account == null) return@mapNotNull null
                discoveryAttempted += key
                wallet.walletID to account
            }
        }
        if (pending.isEmpty()) return
        discovery = scope.launch {
            var discovered = false
            for ((walletId, account) in pending) {
                mutableState.value = mutableState.value.copy(discoveringWalletId = walletId)
                try {
                    apply(store.discoverWalletAddresses(account.accountID, generation), account)
                    discovered = true
                } catch (cancellation: CancellationException) {
                    throw cancellation
                } catch (error: Exception) {
                    if (error.failureKind == FailureKind.REVOKED) {
                        revoke()
                        return@launch
                    }
                }
            }
            mutableState.value = mutableState.value.copy(discoveringWalletId = null)
            if (discovered) reload()
        }
    }

    // The network screen

    /** Pushes the network screen of one account of the selected wallet and selects it. */
    public fun openNetwork(accountId: String) {
        val current = mutableState.value
        if (!canPresent || current.networkAccountId != null) return
        if (current.walletAccounts.none { it.accountID == accountId }) return
        mutableState.value = reconciled(current.copy(selectedAccountId = accountId, networkAccountId = accountId))
    }

    public fun closeNetwork() {
        mutableState.value = mutableState.value.copy(networkAccountId = null)
    }

    /** Copies an account's current address from its network screen. */
    public fun copyAddress(accountId: String) {
        val current = mutableState.value
        val account = current.accounts.firstOrNull { it.accountID == accountId } ?: return
        if (current.phase != Phase.READY) return
        val address = current.address(account) ?: return
        clipboard.copy(address, sensitive = false)
        mutableState.value = current.copy(addressCopied = true)
    }

    // Setup

    public fun beginSetup(intent: WalletSetupModel.Intent) {
        val current = mutableState.value
        val status = current.status
        if (!canPresent || current.accountState != AccountState.IDLE || status == null || !status.enabled) return
        val model = WalletSetupModel(intent, status, store, generation, scope) { walletId, accountId ->
            val after = mutableState.value
            if (after.phase == Phase.REVOKED || after.setup == null) return@WalletSetupModel
            after.setup?.revoke()
            mutableState.value = after.copy(
                presentation = null,
                selectedWalletId = walletId,
                selectedAccountId = accountId,
            )
            reload()
        }
        mutableState.value = current.copy(presentation = Presentation.Setup(model))
    }

    /** Cancel on the setup form; a save that may have happened reads the wallets again. */
    public fun closeSetup() {
        val setup = mutableState.value.setup ?: return
        val phase = setup.state.value.phase
        setup.revoke()
        mutableState.value = mutableState.value.copy(presentation = null)
        if (phase == WalletSetupModel.Phase.SAVING || phase == WalletSetupModel.Phase.UNCERTAIN) reload()
    }

    // Receive and new accounts

    public fun openReceive() {
        val current = mutableState.value
        val account = current.selectedAccount ?: return
        if (!canPresent || current.accountState == AccountState.WORKING) return
        mutableState.value = current.copy(
            presentation = Presentation.Account(AccountRoute.Receive(account.accountID)),
            addressCopied = false,
        )
    }

    /** Receive is one surface for the whole wallet: another network shows that account's address. */
    public fun switchReceivingAccount(accountId: String) {
        val current = mutableState.value
        if (current.accountRoute !is AccountRoute.Receive || current.phase != Phase.READY) return
        if (current.accountState == AccountState.WORKING) return
        if (current.walletAccounts.none { it.accountID == accountId }) return
        mutableState.value = reconciled(
            current.copy(
                presentation = Presentation.Account(AccountRoute.Receive(accountId)),
                selectedAccountId = accountId,
                addressCopied = false,
            ),
        )
    }

    public fun copyReceivingAddress() {
        val current = mutableState.value
        val address = current.receivingAddress ?: return
        clipboard.copy(address, sensitive = false)
        mutableState.value = current.copy(addressCopied = true)
    }

    /** Another account on a network, from that network's screen; [network] preselects it. */
    public fun openAddAccount(network: String? = null) {
        val current = mutableState.value
        val wallet = current.selectedWallet ?: return
        if (!canPresent || current.accountState != AccountState.IDLE) return
        val next = current.copy(
            presentation = Presentation.Account(AccountRoute.Add(wallet.walletID)),
            accountIssue = null,
        )
        if (next.derivableNetworks.isEmpty()) return
        mutableState.value = next.copy(accountNetwork = network?.takeIf { it in next.derivableNetworks })
    }

    public fun chooseAccountNetwork(network: String?) {
        val current = mutableState.value
        if (current.accountRoute !is AccountRoute.Add || current.accountState != AccountState.IDLE) return
        mutableState.value = current.copy(accountNetwork = network, accountIssue = null)
    }

    public fun addAccount() {
        val current = mutableState.value
        val route = current.accountRoute as? AccountRoute.Add ?: return
        if (current.phase != Phase.READY || current.accountState != AccountState.IDLE) return
        if (route.walletId != current.selectedWalletId || current.accountWallet == null) {
            mutableState.value = current.copy(accountIssue = AccountIssue.UNAVAILABLE)
            return
        }
        val network = current.accountNetwork?.takeIf { it in current.derivableNetworks }
        if (network == null) {
            mutableState.value = current.copy(accountIssue = AccountIssue.CHOOSE_NETWORK)
            return
        }
        mutate {
            val result = store.deriveWalletAccount(
                WalletAccountsDeriveRequest(network = network, walletID = route.walletId),
                generation,
            )
            val after = mutableState.value
            mutableState.value = after.copy(
                selectedWalletId = route.walletId,
                selectedAccountId = result.accountID,
                presentation = if (after.presentation is Presentation.Account) null else after.presentation,
                accountNetwork = null,
            )
        }
    }

    /** Hands out the next receive address of a Bitcoin account. */
    public fun generateReceivingAddress(accountId: String) {
        val current = mutableState.value
        val account = current.walletAccounts.firstOrNull { it.accountID == accountId } ?: return
        if (current.phase != Phase.READY || current.accountState != AccountState.IDLE) return
        if (!current.derivesAddresses(account)) return
        mutate {
            store.deriveWalletAddress(
                WalletAddressesDeriveRequest(accountID = accountId, purpose = "receive"),
                generation,
            )
        }
    }

    public fun closeAccountRoute() {
        val current = mutableState.value
        if (current.accountRoute == null || current.accountState == AccountState.WORKING) return
        mutableState.value = current.copy(
            presentation = null,
            accountNetwork = null,
            addressCopied = false,
            accountIssue = if (current.accountState == AccountState.UNCERTAIN) current.accountIssue else null,
        )
    }

    /** The person checked the accounts after an operation Core could not confirm. */
    public fun acknowledgeReconciliation() {
        val current = mutableState.value
        if (current.phase != Phase.READY || current.accountState != AccountState.UNCERTAIN) return
        if (current.accountRoute is AccountRoute.Add) return
        mutableState.value = current.copy(accountState = AccountState.IDLE, accountIssue = null)
    }

    // Send

    public fun openSend() {
        val current = mutableState.value
        val status = current.status ?: return
        val account = current.sendableAccount ?: return
        val network = current.sendNetwork(account) ?: return
        if (!canPresent || current.historyShown || current.accountState != AccountState.IDLE) return
        val walletId = account.walletID
        val model = WalletSendModel(
            walletId,
            account.accountID,
            network,
            status,
            store,
            generation,
            scope,
        ) { detected ->
            val target = mutableState.value.accounts.firstOrNull { it.walletID == walletId && it.network == detected }
            val profile = WalletNetwork.of(detected)
            if (target == null || profile == null) null else target.accountID to profile
        }
        mutableState.value = current.copy(presentation = Presentation.Send(model))
        addressBook.reload()
    }

    /** Close on the send sheet; a transfer that went out, or may have, reads the wallet again. */
    public fun closeSend() {
        val send = mutableState.value.send ?: return
        val phase = send.state.value.phase
        if (send.state.value.busy) return
        send.revoke()
        mutableState.value = mutableState.value.copy(presentation = null)
        if (phase == WalletSendModel.Phase.SUBMITTED || phase == WalletSendModel.Phase.UNCERTAIN) reload()
    }

    /** View activity after a transfer: the sheet closes and the sending account's activity reads again. */
    public fun showSendHistory() {
        val sending = mutableState.value.send?.state?.value ?: return
        if (sending.phase != WalletSendModel.Phase.SUBMITTED && sending.phase != WalletSendModel.Phase.UNCERTAIN) return
        closeSend()
        // Send may have moved to another network than the one selected; its activity is that account's.
        val current = mutableState.value
        if (current.walletAccounts.any { it.accountID == sending.accountId }) {
            mutableState.value = reconciled(current.copy(selectedAccountId = sending.accountId))
        }
        val history = mutableState.value.history ?: return
        history.closeDetail()
        history.reload()
        mutableState.value = mutableState.value.copy(historyShown = true)
    }

    // Activity

    public fun openHistory() {
        val current = mutableState.value
        if (!canPresent || current.historyShown || current.history == null) return
        mutableState.value = current.copy(historyShown = true)
    }

    public fun closeHistory() {
        val history = mutableState.value.history
        if (history?.state?.value?.activity == WalletHistoryModel.Activity.REBROADCASTING) return
        history?.closeDetail()
        mutableState.value = mutableState.value.copy(historyShown = false)
    }

    // Recovery

    public fun openRecovery() {
        val current = mutableState.value
        val wallet = current.selectedWallet ?: return
        if (!canPresent || !current.canRecover || current.historyShown) return
        if (current.accountState != AccountState.IDLE) return
        val rotating = current.accounts.firstOrNull {
            it.walletID == wallet.walletID && it.network == "ton" && it.mnemonicStandard == "rotation"
        }
        val model = WalletRecoveryModel(
            wallet.walletID,
            wallet.label,
            rotating?.accountID,
            store,
            generation,
            scope,
            clipboard,
        )
        mutableState.value = current.copy(presentation = Presentation.Recovery(model))
    }

    public fun closeRecovery() {
        val recovery = mutableState.value.recovery ?: return
        recovery.revoke()
        mutableState.value = mutableState.value.copy(presentation = null)
    }

    // Contacts

    public fun openAddressBook() {
        val current = mutableState.value
        if (!canPresent || !current.walletsEnabled || current.historyShown) return
        if (current.accountState != AccountState.IDLE) return
        mutableState.value = current.copy(presentation = Presentation.Contacts)
        addressBook.reload()
    }

    /** Done on the address book; an editor or a deletion still open keeps it. */
    public fun closeAddressBook() {
        val current = mutableState.value
        if (!current.contactsShown || !addressBook.state.value.canDismiss) return
        mutableState.value = current.copy(presentation = null)
    }

    // Lifecycle

    /** The app left the foreground: nothing typed stays readable on screen. */
    public fun coverSensitiveValues() {
        mutableState.value.setup?.hideValues()
        mutableState.value.recovery?.hideValues()
        mutableState.value.send?.hidePassword()
        histories.values.forEach(WalletHistoryModel::hidePassword)
    }

    public fun revoke() {
        val current = mutableState.value
        if (current.phase == Phase.REVOKED) return
        current.setup?.revoke()
        current.send?.revoke()
        current.recovery?.revoke()
        addressBook.revoke()
        histories.values.forEach(WalletHistoryModel::revoke)
        histories.clear()
        work?.cancel()
        mutation?.cancel()
        discovery?.cancel()
        balanceWork.values.forEach(Job::cancel)
        balanceWork.clear()
        clipboard.clearOwned()
        mutableState.value = State(phase = Phase.REVOKED)
    }

    private fun mutate(operation: suspend () -> Unit) {
        mutableState.value = mutableState.value.copy(
            accountState = AccountState.WORKING,
            accountIssue = null,
            addressCopied = false,
        )
        mutation = scope.launch {
            try {
                operation()
                reloadNow()
                mutableState.value = mutableState.value.copy(accountState = AccountState.IDLE)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                val issue = when (error.failureKind) {
                    FailureKind.REVOKED -> {
                        revoke()
                        return@launch
                    }
                    FailureKind.INVALID_INPUT -> AccountIssue.INVALID_INPUT
                    FailureKind.DENIED -> AccountIssue.DENIED
                    FailureKind.UNAVAILABLE -> AccountIssue.UNAVAILABLE
                    else -> AccountIssue.UNCERTAIN
                }
                val uncertain = issue == AccountIssue.UNCERTAIN
                mutableState.value = mutableState.value.copy(
                    accountIssue = issue,
                    accountState = if (uncertain) AccountState.UNCERTAIN else AccountState.IDLE,
                )
                if (uncertain) reloadNow()
            }
        }
    }

    /** Reads the catalog again inside a running operation, keeping its state. */
    private suspend fun reloadNow() {
        val status = store.walletStatus(generation)
        val wallets = store.walletList(generation).wallets
        val accounts = store.walletAccounts(null, generation)
        updateContactNetworks(status)
        val current = mutableState.value
        mutableState.value = reconciled(
            current.copy(
                phase = Phase.READY,
                status = status,
                wallets = wallets,
                accounts = accounts.accounts,
                balances = (accounts.cachedBalances.orEmpty() + current.balances)
                    .groupBy { it.accountID to it.network }
                    .map { (_, same) -> same.maxBy { it.fetchedAt } },
                selectedWalletId = current.selectedWalletId?.takeIf { id -> wallets.any { it.walletID == id } }
                    ?: wallets.firstOrNull()?.walletID,
            ),
        )
        refreshBalances()
    }

    /**
     * Keeps the selection, the pushed screens and the open send pointing at
     * accounts that still exist, and the selected account's activity at hand.
     */
    private fun reconciled(state: State): State {
        val accounts = state.walletAccounts
        val selected = state.selectedAccountId?.takeIf { id -> accounts.any { it.accountID == id } }
            ?: accounts.firstOrNull()?.accountID
        val network = state.networkAccountId?.takeIf { id -> accounts.any { it.accountID == id } }
        var next = state.copy(selectedAccountId = selected, networkAccountId = network)
        next.recovery?.let { recovery ->
            // The phrase belongs to one HD wallet; if it is gone, so is its sheet.
            if (next.wallets.none { it.walletID == recovery.walletId && it.kind == "hd" }) {
                recovery.revoke()
                next = next.copy(presentation = null)
            }
        }
        next.send?.let { send ->
            val sending = send.state.value
            val exists = next.accounts.any {
                it.accountID == sending.accountId &&
                    it.walletID == send.walletId &&
                    it.network == sending.network.network
            }
            if (!exists) {
                send.revoke()
                next = next.copy(presentation = null)
            } else {
                next.status?.let(send::updateAvailability)
            }
        }
        histories.entries.removeAll { (id, history) ->
            val gone = next.accounts.none {
                it.accountID == id && it.walletID == history.walletId && it.network == history.network
            }
            if (gone) history.revoke()
            gone
        }
        next.status?.let { status -> histories.values.forEach { it.updateAvailability(status) } }
        val history = next.selectedAccount?.let { account ->
            histories.getOrPut(account.accountID) {
                WalletHistoryModel(
                    account.walletID,
                    account.accountID,
                    account.network,
                    store,
                    generation,
                    scope,
                    clipboard,
                )
                    .also { model -> next.status?.let(model::updateAvailability) }
            }
        }
        // Another account's activity is not the one that was pushed.
        return if (history !== next.history) next.copy(history = history, historyShown = false) else next
    }
}
