package com.chromvoid.air.ui.wallet

import com.chromvoid.air.bridge.wire.WalletProviderStatus
import com.chromvoid.air.bridge.wire.WalletStatusResponse
import com.chromvoid.air.bridge.wire.WalletTransactionEntry
import com.chromvoid.air.bridge.wire.WalletTransactionRebroadcastRequest
import com.chromvoid.air.bridge.wire.WalletTransactionsListRequest
import com.chromvoid.air.bridge.wire.WalletTransactionsRefreshRequest
import com.chromvoid.air.bridge.wire.WalletTransactionsSyncRequest
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
 * One account's activity, as iOS presents Core's journal: pages of
 * transactions, a sync with the network where the provider offers one, a
 * transaction's details with its status refreshed on request, and - for a
 * transfer whose broadcast is unconfirmed - the same signed transaction sent
 * again after the administrative password. Nothing is kept outside Core.
 */
public class WalletHistoryModel(
    public val walletId: String,
    public val accountId: String,
    public val network: String,
    private val store: WalletStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val clipboard: CredentialClipboard,
) {
    public enum class Phase { IDLE, READY, FAILED, REVOKED }

    public enum class Activity { IDLE, LOADING, SYNCHRONIZING, REFRESHING, REBROADCASTING }

    public enum class Issue {
        LOAD,
        SYNCHRONIZATION,
        REFRESH,
        UNAVAILABLE,
        DENIED,
        PASSWORD_REQUIRED,
        REAUTHENTICATION,
        REBROADCAST_UNKNOWN,
        REBROADCAST_INELIGIBLE,
    }

    public enum class CopyField { REFERENCE, COUNTERPARTY }

    public data class State(
        val phase: Phase = Phase.IDLE,
        val activity: Activity = Activity.IDLE,
        val entries: List<WalletTransactionEntry> = emptyList(),
        val nextCursor: String? = null,
        val selected: WalletTransactionEntry? = null,
        val issue: Issue? = null,
        val copied: Boolean = false,
        val providerReady: Boolean = false,
        val broadcastReady: Boolean = false,
        val reviewingRebroadcast: Boolean = false,
        val rebroadcastPassword: String = "",
        val passwordFocusRevision: Int = 0,
        /** Transactions whose status must be refreshed before another rebroadcast. */
        val needRefresh: Set<String> = emptySet(),
    )

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private var work: Job? = null
    private var reloadRequested = false

    /** Network history sync exists for TON; the other networks show Core's saved journal. */
    public val canSynchronize: Boolean get() = mutableState.value.providerReady && network == "ton"

    public val canOfferRebroadcast: Boolean
        get() {
            val selected = mutableState.value.selected ?: return false
            if (mutableState.value.phase == Phase.REVOKED) return false
            return selected.accountID == accountId &&
                selected.walletID == walletId &&
                selected.network == network &&
                selected.status in UNCONFIRMED
        }

    public val requiresRebroadcastRefresh: Boolean
        get() = mutableState.value.selected?.txRef?.let { it in mutableState.value.needRefresh } == true

    public val canRebroadcast: Boolean
        get() = canOfferRebroadcast && mutableState.value.broadcastReady && !requiresRebroadcastRefresh

    public fun updateAvailability(status: WalletStatusResponse) {
        if (mutableState.value.phase == Phase.REVOKED) return
        mutableState.value = mutableState.value.copy(
            broadcastReady = WalletNetwork.of(network)?.isAvailable(status) == true,
            providerReady = status.enabled &&
                status.networks.any {
                    it.network == network && it.enabled && it.providerStatus == WalletProviderStatus.Ready
                },
        )
    }

    public fun loadIfNeeded() {
        if (mutableState.value.phase == Phase.IDLE && mutableState.value.activity == Activity.IDLE) reload()
    }

    public fun reload() {
        val current = mutableState.value
        if (current.selected != null || current.phase == Phase.REVOKED) return
        if (current.activity != Activity.IDLE) {
            reloadRequested = true
            return
        }
        reloadRequested = false
        start(Operation.Reload)
    }

    public fun loadMore() {
        val current = mutableState.value
        val cursor = current.nextCursor ?: return
        if (current.selected == null) start(Operation.Page(cursor))
    }

    public fun open(txRef: String) {
        val current = mutableState.value
        if (current.phase == Phase.REVOKED || current.activity == Activity.REBROADCASTING) return
        val entry = current.entries.firstOrNull { it.txRef == txRef } ?: return
        mutableState.value = current.copy(
            selected = entry,
            copied = false,
            reviewingRebroadcast = false,
            rebroadcastPassword = "",
        )
    }

    public fun closeDetail() {
        val current = mutableState.value
        if (current.activity == Activity.REBROADCASTING) return
        mutableState.value = current.copy(
            selected = null,
            copied = false,
            reviewingRebroadcast = false,
            rebroadcastPassword = "",
        )
        if (reloadRequested) reload()
    }

    public fun refreshSelected() {
        val current = mutableState.value
        val selected = current.selected ?: return
        if (current.reviewingRebroadcast) return
        if (!current.providerReady) {
            mutableState.value = current.copy(issue = Issue.UNAVAILABLE)
            return
        }
        start(Operation.Refresh(selected.txRef))
    }

    public fun copy(field: CopyField) {
        val selected = mutableState.value.selected ?: return
        val value = when (field) {
            CopyField.REFERENCE -> selected.txHash ?: selected.messageRef ?: selected.txRef
            CopyField.COUNTERPARTY -> selected.counterparty
        }
        if (value.isNullOrEmpty()) return
        clipboard.copy(value, sensitive = false)
        mutableState.value = mutableState.value.copy(copied = true)
    }

    public fun beginRebroadcast() {
        if (mutableState.value.activity != Activity.IDLE || !canRebroadcast) return
        mutableState.value = mutableState.value.copy(
            reviewingRebroadcast = true,
            rebroadcastPassword = "",
            issue = null,
        )
    }

    public fun changeRebroadcastPassword(value: String) {
        val current = mutableState.value
        if (!current.reviewingRebroadcast || current.activity != Activity.IDLE) return
        mutableState.value = current.copy(rebroadcastPassword = value, issue = null)
    }

    public fun cancelRebroadcast() {
        if (mutableState.value.activity == Activity.REBROADCASTING) return
        mutableState.value = mutableState.value.copy(reviewingRebroadcast = false, rebroadcastPassword = "")
    }

    public fun hidePassword() {
        mutableState.value = mutableState.value.copy(rebroadcastPassword = "")
    }

    public fun confirmRebroadcast() {
        val current = mutableState.value
        val selected = current.selected ?: return
        if (!current.reviewingRebroadcast || current.activity != Activity.IDLE) return
        when {
            !canRebroadcast -> mutableState.value = current.copy(issue = Issue.UNAVAILABLE)
            current.rebroadcastPassword.isEmpty() -> mutableState.value = current.copy(
                issue = Issue.PASSWORD_REQUIRED,
                passwordFocusRevision = current.passwordFocusRevision + 1,
            )
            else -> {
                val request = WalletTransactionRebroadcastRequest(current.rebroadcastPassword, selected.txRef)
                mutableState.value = current.copy(rebroadcastPassword = "")
                start(Operation.Rebroadcast(request))
            }
        }
    }

    public fun revoke() {
        work?.cancel()
        reloadRequested = false
        mutableState.value = State(phase = Phase.REVOKED)
        clipboard.clearOwned()
    }

    private sealed interface Operation {
        data object Reload : Operation

        data class Page(val cursor: String) : Operation

        data class Refresh(val txRef: String) : Operation

        data class Rebroadcast(val request: WalletTransactionRebroadcastRequest) : Operation
    }

    private fun start(operation: Operation) {
        val current = mutableState.value
        if (current.phase == Phase.REVOKED || current.activity != Activity.IDLE) return
        mutableState.value = current.copy(
            issue = null,
            copied = false,
            activity = when (operation) {
                Operation.Reload, is Operation.Page -> Activity.LOADING
                is Operation.Refresh -> Activity.REFRESHING
                is Operation.Rebroadcast -> Activity.REBROADCASTING
            },
        )
        work = scope.launch {
            var failure = Issue.LOAD
            try {
                when (operation) {
                    Operation.Reload -> {
                        readPage(null)
                        if (canSynchronize) {
                            failure = Issue.SYNCHRONIZATION
                            mutableState.value = mutableState.value.copy(activity = Activity.SYNCHRONIZING)
                            store.syncTransactions(
                                WalletTransactionsSyncRequest(accountID = accountId, limit = PAGE),
                                generation,
                            )
                            failure = Issue.LOAD
                            readPage(null)
                        }
                    }
                    is Operation.Page -> readPage(operation.cursor)
                    is Operation.Refresh -> {
                        failure = Issue.REFRESH
                        val result = store.refreshTransaction(
                            WalletTransactionsRefreshRequest(operation.txRef),
                            generation,
                        )
                        check(result.txRef == operation.txRef && result.network == network) { "unexpected refresh" }
                        val after = mutableState.value
                        mutableState.value = applied(
                            after.copy(needRefresh = after.needRefresh - result.txRef),
                            result.txRef,
                        ) {
                            it.copy(status = result.status, txHash = result.txHash, updatedAt = result.updatedAt)
                        }
                    }
                    is Operation.Rebroadcast -> {
                        val result = store.rebroadcastTransaction(operation.request, generation)
                        check(result.txRef == operation.request.txRef && result.network == network) {
                            "unexpected rebroadcast"
                        }
                        val unknown = result.status in UNCONFIRMED
                        val after = mutableState.value
                        mutableState.value = applied(
                            after.copy(
                                reviewingRebroadcast = false,
                                needRefresh = if (unknown) after.needRefresh + result.txRef else after.needRefresh,
                                issue = if (unknown) Issue.REBROADCAST_UNKNOWN else null,
                            ),
                            result.txRef,
                        ) { it.copy(status = result.status, txHash = result.txHash, updatedAt = result.updatedAt) }
                    }
                }
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (error.failureKind == FailureKind.REVOKED) {
                    revoke()
                    return@launch
                }
                val after = mutableState.value
                mutableState.value = if (operation is Operation.Rebroadcast) {
                    when (error.failureKind) {
                        FailureKind.REAUTH_REQUIRED -> after.copy(
                            issue = Issue.REAUTHENTICATION,
                            passwordFocusRevision = after.passwordFocusRevision + 1,
                        )
                        FailureKind.DENIED -> after.copy(issue = Issue.DENIED)
                        FailureKind.UNAVAILABLE -> after.copy(issue = Issue.UNAVAILABLE)
                        // Whether it went out is unknown: the status is refreshed before any retry.
                        else -> after.copy(
                            reviewingRebroadcast = false,
                            needRefresh = after.needRefresh + operation.request.txRef,
                            issue = if (error.failureKind == FailureKind.INVALID_INPUT) {
                                Issue.REBROADCAST_INELIGIBLE
                            } else {
                                Issue.REBROADCAST_UNKNOWN
                            },
                        )
                    }
                } else {
                    after.copy(
                        issue = when (error.failureKind) {
                            FailureKind.DENIED -> Issue.DENIED
                            FailureKind.UNAVAILABLE -> Issue.UNAVAILABLE
                            else -> failure
                        },
                        phase = if (after.phase == Phase.IDLE) Phase.FAILED else after.phase,
                    )
                }
            }
            if (mutableState.value.phase != Phase.REVOKED) {
                mutableState.value = mutableState.value.copy(activity = Activity.IDLE)
                if (reloadRequested) reload()
            }
        }
    }

    private suspend fun readPage(cursor: String?) {
        val result = store.walletTransactions(
            WalletTransactionsListRequest(accountID = accountId, cursor = cursor, limit = PAGE, walletID = walletId),
            generation,
        )
        val current = mutableState.value
        val entries = if (cursor == null) {
            result.transactions
        } else {
            val known = current.entries.map { it.txRef }.toSet()
            current.entries + result.transactions.filterNot { it.txRef in known }
        }
        mutableState.value = current.copy(
            phase = Phase.READY,
            entries = entries,
            nextCursor = result.nextCursor,
            selected = current.selected?.let { chosen ->
                result.transactions.firstOrNull { it.txRef == chosen.txRef } ?: chosen
            },
        )
    }

    /** The status Core reconciled, applied to the list and the open transaction alike. */
    private fun applied(
        state: State,
        txRef: String,
        change: (WalletTransactionEntry) -> WalletTransactionEntry,
    ): State =
        state.copy(
            entries = state.entries.map { if (it.txRef == txRef) change(it) else it },
            selected = state.selected?.let { if (it.txRef == txRef) change(it) else it },
        )

    private companion object {
        const val PAGE = 50L
        val UNCONFIRMED = setOf("broadcasting", "broadcast_unknown")
    }
}
