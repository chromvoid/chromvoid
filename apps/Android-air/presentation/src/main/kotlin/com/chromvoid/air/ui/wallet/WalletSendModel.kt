package com.chromvoid.air.ui.wallet

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.wire.WalletAddressBookEntry
import com.chromvoid.air.bridge.wire.WalletConfirmStatus
import com.chromvoid.air.bridge.wire.WalletFeePolicy
import com.chromvoid.air.bridge.wire.WalletFeeTier
import com.chromvoid.air.bridge.wire.WalletStatusResponse
import com.chromvoid.air.bridge.wire.WalletTransactionCancelRequest
import com.chromvoid.air.bridge.wire.WalletTransactionConfirmRequest
import com.chromvoid.air.bridge.wire.WalletTransactionConfirmResponse
import com.chromvoid.air.bridge.wire.WalletTransactionOutput
import com.chromvoid.air.bridge.wire.WalletTransactionPrepareRequest
import com.chromvoid.air.bridge.wire.WalletTransactionPrepareResponse
import com.chromvoid.air.bridge.wire.WalletTransactionQuoteOutput
import com.chromvoid.air.bridge.wire.WalletTransactionQuoteRequest
import com.chromvoid.air.bridge.wire.WalletTransactionQuoteResponse
import com.chromvoid.air.ui.support.FailureKind
import com.chromvoid.air.ui.support.failureKind
import java.util.UUID
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * A transfer, as the iOS send sheet makes one: recipients and amounts typed
 * as decimals, the network recognised from the first address, a fee quote
 * when asked, then Core's prepared intent to review - recipients, fee, total,
 * warnings to accept - and the administrative password to authorize it. Core
 * signs and broadcasts; an outcome it cannot confirm is said to be unknown
 * and the same payment is not offered again.
 */
public class WalletSendModel(
    public val walletId: String,
    accountId: String,
    network: WalletNetwork,
    status: WalletStatusResponse,
    private val store: WalletStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val now: () -> Long = System::currentTimeMillis,
    private val newId: () -> String = { UUID.randomUUID().toString() },
    /** This wallet's account on a network an address belongs to; null keeps the sender fixed. */
    private val accountFor: ((String) -> Pair<String, WalletNetwork>?)? = null,
) {
    public enum class Phase {
        EDITING,
        PREPARING,
        REVIEWING,
        STALE_REVIEW,
        CONFIRMING,
        CANCELLING,
        CANCEL_FAILED,
        SUBMITTED,
        UNCERTAIN,
        REVOKED,
    }

    public sealed interface Field {
        public data class Address(val recipient: String) : Field

        public data class Amount(val recipient: String) : Field

        public data object Comment : Field

        public data object Password : Field

        public data object Warnings : Field
    }

    public sealed interface Issue {
        public data class Required(val field: Field) : Issue

        public data class InvalidAmount(val recipient: String) : Issue

        public data object InvalidAddress : Issue

        public data object InsufficientFunds : Issue

        public data object Unavailable : Issue

        public data object Denied : Issue

        public data object Stale : Issue

        public data object QuoteRequired : Issue

        public data object Reauthentication : Issue

        public data object Warnings : Issue

        public data object Failed : Issue

        public data object CancellationFailed : Issue

        public data object Uncertain : Issue
    }

    public data class Recipient(val id: String, val address: String = "", val amount: String = "")

    public data class State(
        val phase: Phase = Phase.EDITING,
        val accountId: String,
        val network: WalletNetwork,
        val available: Boolean,
        val recipients: List<Recipient>,
        val comment: String = "",
        val feeTier: WalletFeeTier = WalletFeeTier.Standard,
        val issue: Issue? = null,
        val focus: Field? = null,
        val focusRevision: Int = 0,
        val quote: WalletTransactionQuoteResponse? = null,
        val quoting: Boolean = false,
        /** The recipient whose amount is the maximum Core quoted. */
        val maximumRecipientId: String? = null,
        val prepared: WalletTransactionPrepareResponse? = null,
        val acceptedWarnings: Set<String> = emptySet(),
        val password: String = "",
        val confirmation: WalletTransactionConfirmResponse? = null,
        val confirmingDiscard: Boolean = false,
        /** The network Core read from the first address, when exactly one accepts it. */
        val detectedNetwork: String? = null,
        /** A network the first address belongs to on which this wallet has no account. */
        val networkMismatch: String? = null,
    ) {
        val busy: Boolean get() = phase == Phase.PREPARING || phase == Phase.CONFIRMING || phase == Phase.CANCELLING

        val hasChanges: Boolean
            get() = comment.isNotEmpty() || recipients.any { it.address.isNotEmpty() || it.amount.isNotEmpty() }

        /** A prepared transfer is open: closing it cancels it with Core first. */
        val reviewing: Boolean
            get() = phase == Phase.REVIEWING || phase == Phase.STALE_REVIEW || phase == Phase.CANCEL_FAILED

        /** The saved contacts a recipient on this transfer's network can be. */
        public fun contacts(entries: List<WalletAddressBookEntry>): List<WalletAddressBookEntry> =
            entries.filter { it.network == network.network }

        public fun value(field: Field): String = when (field) {
            is Field.Address -> recipients.firstOrNull { it.id == field.recipient }?.address.orEmpty()
            is Field.Amount -> recipients.firstOrNull { it.id == field.recipient }?.amount.orEmpty()
            Field.Comment -> comment
            Field.Password -> password
            Field.Warnings -> ""
        }
    }

    private var status = status

    private val mutableState = MutableStateFlow(
        State(
            accountId = accountId,
            network = network,
            available = network.isAvailable(status),
            recipients = listOf(Recipient(newId())),
        ),
    )
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private var work: Job? = null
    private var quoteWork: Job? = null
    private var detection: Job? = null
    private var draftRevision = 0

    public val accountId: String get() = mutableState.value.accountId

    public fun updateAvailability(status: WalletStatusResponse) {
        if (mutableState.value.phase == Phase.REVOKED) return
        this.status = status
        mutableState.value = mutableState.value.copy(available = mutableState.value.network.isAvailable(status))
    }

    public fun change(field: Field, value: String) {
        val current = mutableState.value
        if (field == Field.Password) {
            if (current.phase == Phase.REVIEWING) {
                mutableState.value = current.copy(password = value, issue = null, focus = null)
            }
            return
        }
        if (current.phase != Phase.EDITING) return
        val next = when (field) {
            is Field.Address -> current.copy(
                recipients = current.recipients.map { if (it.id == field.recipient) it.copy(address = value) else it },
            )
            is Field.Amount -> current.copy(
                recipients = current.recipients.map { if (it.id == field.recipient) it.copy(amount = value) else it },
            )
            Field.Comment -> if (current.network.supportsComment) current.copy(comment = value) else return
            Field.Password, Field.Warnings -> return
        }
        mutableState.value = invalidated(next)
        if (field is Field.Address && current.recipients.firstOrNull()?.id == field.recipient) followPrimaryAddress()
    }

    public fun chooseFee(tier: WalletFeeTier) {
        val current = mutableState.value
        if (current.phase != Phase.EDITING) return
        mutableState.value = invalidated(current.copy(feeTier = tier))
    }

    public fun addRecipient() {
        val current = mutableState.value
        if (current.phase != Phase.EDITING || !current.network.multipleOutputs) return
        mutableState.value = invalidated(current.copy(recipients = current.recipients + Recipient(newId())))
    }

    public fun removeRecipient(id: String) {
        val current = mutableState.value
        if (current.phase != Phase.EDITING || current.recipients.size <= 1) return
        mutableState.value = invalidated(current.copy(recipients = current.recipients.filterNot { it.id == id }))
    }

    /** A saved contact's address for one recipient; a contact on another network is not offered. */
    public fun chooseContact(contact: WalletAddressBookEntry, recipient: String) {
        if (contact.network != mutableState.value.network.network) return
        change(Field.Address(recipient), contact.address)
    }

    public fun toggleWarning(code: String) {
        val current = mutableState.value
        val warnings = current.prepared?.preview?.warnings.orEmpty()
        if (current.phase != Phase.REVIEWING || warnings.none { it.code == code }) return
        val accepted = current.acceptedWarnings.let { if (code in it) it - code else it + code }
        mutableState.value = current.copy(acceptedWarnings = accepted, issue = null, focus = null)
    }

    /** Asks Core for the fee; with [maximumFor], also the most that recipient can receive. */
    public fun calculateQuote(maximumFor: String? = null) {
        val current = mutableState.value
        if (current.phase != Phase.EDITING) return
        val index = current.recipients.indexOfFirst { it.id == (maximumFor ?: current.recipients.firstOrNull()?.id) }
        if (index < 0 || !validate(maximumFor)) return
        val valid = invalidated(mutableState.value)
        val network = valid.network
        val request = WalletTransactionQuoteRequest(
            accountID = valid.accountId,
            feePolicy = WalletFeePolicy(valid.feeTier),
            maxOutputIndex = index.toLong(),
            network = network.network,
            outputs = valid.recipients.map {
                WalletTransactionQuoteOutput(
                    address = it.address.trim(),
                    amount = network.baseUnits(it.amount),
                    comment = comment(valid),
                )
            },
        )
        val revision = draftRevision
        mutableState.value = valid.copy(quoting = true)
        quoteWork = scope.launch {
            try {
                val result = store.quoteTransaction(request, generation)
                val after = mutableState.value
                if (draftRevision != revision || after.phase != Phase.EDITING) return@launch
                if (result.accountID != after.accountId || result.network != after.network.network) {
                    mutableState.value = after.copy(quoting = false, issue = Issue.Failed)
                    return@launch
                }
                val maximum = maximumFor?.let { id -> after.network.decimal(result.maxAmount)?.let { id to it } }
                mutableState.value = after.copy(
                    quoting = false,
                    quote = result,
                    recipients = if (maximum == null) {
                        after.recipients
                    } else {
                        after.recipients.map { if (it.id == maximum.first) it.copy(amount = maximum.second) else it }
                    },
                    maximumRecipientId = maximum?.first,
                )
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (draftRevision != revision) return@launch
                if (error.failureKind == FailureKind.REVOKED) {
                    revoke()
                    return@launch
                }
                mutableState.value = mutableState.value.copy(quoting = false, issue = issueFor(error))
            }
        }
    }

    /** Core prepares the exact transfer to review; nothing is signed yet. */
    public fun prepare() {
        val current = mutableState.value
        if (current.phase != Phase.EDITING || !validate()) return
        val checked = mutableState.value
        if (checked.maximumRecipientId != null && !quoteFresh(checked)) {
            mutableState.value = checked.copy(issue = Issue.QuoteRequired)
            return
        }
        val outputs = checked.recipients.map { recipient ->
            val amount = checked.network.baseUnits(recipient.amount) ?: run {
                mutableState.value = checked.copy(
                    issue = Issue.InvalidAmount(recipient.id),
                    focus = Field.Amount(recipient.id),
                )
                return
            }
            WalletTransactionOutput(address = recipient.address.trim(), amount = amount, comment = comment(checked))
        }
        val request = WalletTransactionPrepareRequest(
            accountID = checked.accountId,
            feePolicy = WalletFeePolicy(checked.feeTier),
            maximizeOutputIndex = checked.recipients.indexOfFirst { it.id == checked.maximumRecipientId }
                .takeIf { it >= 0 }?.toLong(),
            network = checked.network.network,
            outputs = outputs,
        )
        mutableState.value = invalidated(checked).copy(maximumRecipientId = checked.maximumRecipientId)
        start(Operation.Prepare(request))
    }

    /** Back to editing: Core forgets the prepared transfer first. */
    public fun cancelReview() {
        val current = mutableState.value
        val prepared = current.prepared ?: return
        if (!current.reviewing) return
        start(Operation.Cancel(prepared.preparationID, close = false))
    }

    public fun confirm() {
        val current = mutableState.value
        val prepared = current.prepared ?: return
        if (current.phase != Phase.REVIEWING) return
        val base = current.copy(focusRevision = current.focusRevision + 1, issue = null, focus = null)
        when {
            !current.available -> mutableState.value = base.copy(issue = Issue.Unavailable)
            prepared.expiresAt <= now() -> mutableState.value = base.copy(
                issue = Issue.Stale,
                password = "",
                phase = Phase.STALE_REVIEW,
            )
            current.acceptedWarnings != prepared.preview.warnings.map { it.code }.toSet() ->
                mutableState.value = base.copy(issue = Issue.Warnings, focus = Field.Warnings)
            current.password.isEmpty() ->
                mutableState.value = base.copy(issue = Issue.Required(Field.Password), focus = Field.Password)
            else -> {
                val request = WalletTransactionConfirmRequest(
                    acceptedWarnings = current.acceptedWarnings.sorted(),
                    masterPassword = current.password,
                    preparationID = prepared.preparationID,
                )
                mutableState.value = base.copy(password = "")
                start(Operation.Confirm(request))
            }
        }
    }

    /** Close: a draft or a prepared transfer asks first. Returns whether the sheet may close now. */
    public fun requestDismiss(): Boolean {
        val current = mutableState.value
        if (current.busy) return false
        if (current.reviewing || (current.phase == Phase.EDITING && current.hasChanges)) {
            mutableState.value = current.copy(confirmingDiscard = true)
            return false
        }
        return true
    }

    public fun cancelDiscard() {
        mutableState.value = mutableState.value.copy(confirmingDiscard = false)
    }

    /** The person discarded the transfer; a prepared one is cancelled with Core, then the sheet closes. */
    public fun discard(onClosed: () -> Unit) {
        val current = mutableState.value
        if (current.busy) return
        mutableState.value = current.copy(confirmingDiscard = false)
        val prepared = current.prepared
        if (current.reviewing && prepared != null) {
            start(Operation.Cancel(prepared.preparationID, close = true), onClosed)
        } else {
            revoke()
            onClosed()
        }
    }

    public fun hidePassword() {
        mutableState.value = mutableState.value.copy(password = "")
    }

    public fun revoke() {
        work?.cancel()
        quoteWork?.cancel()
        detection?.cancel()
        val current = mutableState.value
        mutableState.value = State(
            phase = Phase.REVOKED,
            accountId = current.accountId,
            network = current.network,
            available = false,
            recipients = emptyList(),
        )
    }

    private sealed interface Operation {
        data class Prepare(val request: WalletTransactionPrepareRequest) : Operation

        data class Confirm(val request: WalletTransactionConfirmRequest) : Operation

        data class Cancel(val preparationId: String, val close: Boolean) : Operation
    }

    private fun start(operation: Operation, onClosed: () -> Unit = {}) {
        val phase = when (operation) {
            is Operation.Prepare -> Phase.PREPARING
            is Operation.Confirm -> Phase.CONFIRMING
            is Operation.Cancel -> Phase.CANCELLING
        }
        mutableState.value = mutableState.value.let {
            it.copy(
                phase = phase,
                issue = null,
                focus = null,
                password = if (operation is Operation.Cancel) "" else it.password,
            )
        }
        work = scope.launch {
            try {
                when (operation) {
                    is Operation.Prepare -> {
                        val result = store.prepareTransaction(operation.request, generation)
                        val after = mutableState.value
                        mutableState.value = if (
                            result.accountID != after.accountId ||
                            result.walletID != walletId ||
                            result.network != after.network.network
                        ) {
                            after.copy(phase = Phase.EDITING, issue = Issue.Failed)
                        } else {
                            after.copy(
                                phase = Phase.REVIEWING,
                                prepared = result,
                                acceptedWarnings = emptySet(),
                                password = "",
                            )
                        }
                    }
                    is Operation.Confirm -> {
                        val result = store.confirmTransaction(operation.request, generation)
                        val after = mutableState.value
                        if (result.network != after.network.network || result.txRef.isEmpty()) {
                            mutableState.value = after.copy(phase = Phase.UNCERTAIN, issue = Issue.Uncertain)
                            return@launch
                        }
                        val submitted = result.status == WalletConfirmStatus.Pending
                        mutableState.value = after.copy(
                            confirmation = result,
                            phase = if (submitted) Phase.SUBMITTED else Phase.UNCERTAIN,
                            issue = if (submitted) null else Issue.Uncertain,
                        )
                    }
                    is Operation.Cancel -> {
                        val result = store.cancelTransaction(
                            WalletTransactionCancelRequest(operation.preparationId),
                            generation,
                        )
                        if (!result.cancelled) throw IllegalStateException("Core kept the preparation")
                        if (operation.close) {
                            revoke()
                            onClosed()
                        } else {
                            mutableState.value = mutableState.value.copy(
                                phase = Phase.EDITING,
                                prepared = null,
                                acceptedWarnings = emptySet(),
                            )
                        }
                    }
                }
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (error.failureKind == FailureKind.REVOKED) {
                    revoke()
                    return@launch
                }
                failed(operation, error)
            }
        }
    }

    private fun failed(operation: Operation, error: Exception) {
        val issue = issueFor(error)
        val current = mutableState.value.copy(issue = issue)
        val code = (error as? CoreRefusal)?.code
        mutableState.value = when (operation) {
            is Operation.Prepare ->
                if (code == "BROADCAST_UNKNOWN") {
                    current.copy(phase = Phase.UNCERTAIN, issue = Issue.Uncertain)
                } else {
                    current.copy(
                        phase = Phase.EDITING,
                        focus = if (issue == Issue.InvalidAddress) {
                            current.recipients.firstOrNull()?.let { Field.Address(it.id) }
                        } else {
                            current.focus
                        },
                        focusRevision = current.focusRevision + if (issue == Issue.InvalidAddress) 1 else 0,
                    )
                }
            is Operation.Cancel -> current.copy(phase = Phase.CANCEL_FAILED, issue = Issue.CancellationFailed)
            is Operation.Confirm -> when {
                error.failureKind == FailureKind.STALE -> current.copy(phase = Phase.STALE_REVIEW)
                error.failureKind == FailureKind.REAUTH_REQUIRED || error.failureKind == FailureKind.DENIED ->
                    current.copy(
                        phase = Phase.REVIEWING,
                        focus = Field.Password,
                        focusRevision = current.focusRevision + 1,
                    )
                // A disabled wallet never reached the network; any other failure during confirm may have broadcast.
                code == "WALLET_DISABLED" -> current.copy(phase = Phase.REVIEWING)
                else -> current.copy(phase = Phase.UNCERTAIN, issue = Issue.Uncertain)
            }
        }
    }

    private fun issueFor(error: Exception): Issue = when ((error as? CoreRefusal)?.code) {
        "INVALID_ADDRESS" -> Issue.InvalidAddress
        "INSUFFICIENT_FUNDS" -> Issue.InsufficientFunds
        else -> when (error.failureKind) {
            FailureKind.DENIED -> Issue.Denied
            FailureKind.UNAVAILABLE -> Issue.Unavailable
            FailureKind.REAUTH_REQUIRED -> Issue.Reauthentication
            FailureKind.STALE -> Issue.Stale
            else -> Issue.Failed
        }
    }

    /**
     * Core names the network the first address belongs to; when this wallet
     * has an account there, the draft moves to it. Each keystroke supersedes
     * the last lookup, so only the latest answer applies.
     */
    private fun followPrimaryAddress() {
        detection?.cancel()
        val address = mutableState.value.recipients.firstOrNull()?.address?.trim().orEmpty()
        mutableState.value = mutableState.value.copy(networkMismatch = null)
        if (address.isEmpty()) {
            mutableState.value = mutableState.value.copy(detectedNetwork = null)
            return
        }
        detection = scope.launch {
            val detected = try {
                store.detectWalletAddress(address, generation).network
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (_: Exception) {
                null
            }
            val current = mutableState.value.copy(detectedNetwork = detected)
            mutableState.value = current
            if (current.phase != Phase.EDITING || detected == null || detected == current.network.network) return@launch
            val target = accountFor?.invoke(detected)
            if (target == null) {
                mutableState.value = current.copy(networkMismatch = detected)
                return@launch
            }
            val (accountId, network) = target
            mutableState.value = invalidated(
                current.copy(
                    accountId = accountId,
                    network = network,
                    available = network.isAvailable(status),
                    recipients = if (network.multipleOutputs) current.recipients else current.recipients.take(1),
                    comment = if (network.supportsComment) current.comment else "",
                    feeTier = WalletFeeTier.Standard,
                ),
            )
        }
    }

    private fun validate(maximumFor: String? = null): Boolean {
        val current = mutableState.value
        val base = current.copy(focusRevision = current.focusRevision + 1, issue = null, focus = null)
        if (!current.available) {
            mutableState.value = base.copy(issue = Issue.Unavailable)
            return false
        }
        for (recipient in current.recipients) {
            if (recipient.address.isBlank()) {
                val field = Field.Address(recipient.id)
                mutableState.value = base.copy(issue = Issue.Required(field), focus = field)
                return false
            }
            val amount = current.network.baseUnits(recipient.amount)
            if (recipient.id != maximumFor && (amount == null || amount == "0")) {
                mutableState.value = base.copy(
                    issue = Issue.InvalidAmount(recipient.id),
                    focus = Field.Amount(recipient.id),
                )
                return false
            }
        }
        mutableState.value = base
        return true
    }

    private fun quoteFresh(state: State): Boolean = state.quote?.let { it.expiresAt > now() } == true

    private fun comment(
        state: State,
    ): String? = state.comment.trim().takeIf { state.network.supportsComment && it.isNotEmpty() }

    /** A changed draft drops the quote in flight and the one it had. */
    private fun invalidated(state: State): State {
        draftRevision += 1
        quoteWork?.cancel()
        quoteWork = null
        return state.copy(quote = null, quoting = false, maximumRecipientId = null, issue = null, focus = null)
    }
}
