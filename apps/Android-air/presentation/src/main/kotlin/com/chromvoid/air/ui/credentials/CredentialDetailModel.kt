package com.chromvoid.air.ui.credentials

import com.chromvoid.air.bridge.wire.CredentialDetail
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
 * One credential's page. It shows exactly the record it was opened for: a
 * reply about another id is a failure, and a record that no longer exists
 * says so instead of falling back to some other entry.
 *
 * Protected fields are read only when the user asks. A revealed value lives in
 * this holder until it is hidden again, the page closes or the session ends;
 * a copied value goes to the clipboard and is not kept here at all.
 */
public class CredentialDetailModel(
    public val id: String,
    private val store: CredentialStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val clipboard: CredentialClipboard,
    /** Core's card rules, for the network and grouping a card is drawn with. */
    private val cards: CardRules = CoreCardRules,
) {
    public enum class Status { LOADING, READY, MISSING, FAILED, REVOKED }

    /** Why a protected field could not be shown or copied. */
    public enum class FieldIssue { EMPTY, TOO_LARGE, FAILED }

    public data class State(
        val status: Status = Status.LOADING,
        val detail: CredentialDetail? = null,
        /** Values the user chose to show, by secret type. */
        val revealed: Map<String, String> = emptyMap(),
        /** The secret type being read, if any; one at a time. */
        val loadingSecret: String? = null,
        val issues: Map<String, FieldIssue> = emptyMap(),
        /** Increments on every copy so the screen can confirm each one. */
        val copies: Int = 0,
        val confirmingDelete: Boolean = false,
        val deleting: Boolean = false,
        /** Core refused the delete; the record stays and says why. */
        val deleteRefused: Boolean = false,
    ) {
        /** The protected fields this record type has, in display order. */
        val secretTypes: List<String>
            get() = when (detail?.entryType) {
                "login" -> listOf(PASSWORD, NOTE)
                "payment_card" -> listOf(CARD_NUMBER, CARD_CODE, NOTE)
                else -> emptyList()
            }
    }

    /**
     * The card as its face draws it: the number masked to its last four until
     * it is revealed, then in its network's groups; the code only while shown.
     */
    public data class CardFace(
        val brand: PaymentCardBrand?,
        val number: String,
        val holder: String,
        val expiry: String,
        val code: String?,
    )

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private var load: Job? = null
    private var secretRead: Job? = null

    init {
        reload()
    }

    public fun reload() {
        if (mutableState.value.status == Status.REVOKED) return
        load?.cancel()
        hideSecrets()
        // A page already on screen stays while its fresh copy loads.
        if (mutableState.value.detail == null) mutableState.value = State(Status.LOADING)
        load = scope.launch {
            try {
                val detail = store.credentialDetail(id, generation)
                mutableState.value = if (detail.id == id) State(Status.READY, detail) else State(Status.FAILED)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                mutableState.value = when (error.failureKind) {
                    FailureKind.MISSING -> State(Status.MISSING)
                    FailureKind.REVOKED -> State(Status.REVOKED)
                    else -> State(Status.FAILED)
                }
            }
        }
    }

    /** The face of the card this page shows; null for any other record. */
    public fun cardFace(state: State): CardFace? {
        val card = state.detail?.paymentCard ?: return null
        val revealed = state.revealed[CARD_NUMBER]?.let(PaymentCardText::digits)?.takeIf { it.isNotEmpty() }
        val typed = revealed?.let { cards.inspect(it).format }?.takeIf { it.network != null }
        val format = typed ?: cards.format(card.brand)
        return CardFace(
            brand = PaymentCardBrand.of(format.network),
            number = revealed?.let { PaymentCardText.grouped(it, format.groups) }
                ?: PaymentCardText.masked(card.last4, format),
            holder = card.cardholderName,
            expiry = PaymentCards.faceExpiry(card.expMonth, card.expYear),
            code = state.revealed[CARD_CODE],
        )
    }

    /** A revealed card number in its network's groups, as the face prints it. */
    public fun groupedNumber(number: String): String {
        val digits = PaymentCardText.digits(number)
        return PaymentCardText.grouped(digits, cards.inspect(digits).format.groups)
    }

    /** Shows a protected field, or hides it again if it is shown. */
    public fun reveal(type: String) {
        val current = mutableState.value
        if (type in current.revealed) {
            mutableState.value = current.copy(revealed = current.revealed - type)
            return
        }
        readSecret(type) { value ->
            mutableState.value = mutableState.value.copy(revealed = mutableState.value.revealed + (type to value))
        }
    }

    /** Copies a protected field without showing it. */
    public fun copySecret(type: String) {
        readSecret(type) { value -> copy(value, sensitive = true) }
    }

    /** Copies a field that is already on the page: the login or a website. */
    public fun copyVisible(value: String) {
        if (mutableState.value.status != Status.READY || value.isEmpty()) return
        copy(value, sensitive = false)
    }

    /** Hides every revealed value and stops a read in flight. */
    public fun hideSecrets() {
        secretRead?.cancel()
        secretRead = null
        val current = mutableState.value
        if (current.revealed.isNotEmpty() || current.loadingSecret != null || current.issues.isNotEmpty()) {
            mutableState.value = current.copy(revealed = emptyMap(), loadingSecret = null, issues = emptyMap())
        }
    }

    public fun requestDelete() {
        val current = mutableState.value
        if (current.status == Status.READY && !current.deleting) {
            mutableState.value = current.copy(confirmingDelete = true, deleteRefused = false)
        }
    }

    public fun cancelDelete() {
        mutableState.value = mutableState.value.copy(confirmingDelete = false)
    }

    /** Deletes this record; [onDeleted] closes the page once Core confirms. */
    public fun confirmDelete(onDeleted: () -> Unit) {
        val current = mutableState.value
        if (!current.confirmingDelete || current.deleting) return
        hideSecrets()
        mutableState.value = mutableState.value.copy(confirmingDelete = false, deleting = true)
        scope.launch {
            try {
                store.deleteCredential(id, generation)
                clipboard.clearOwned()
                onDeleted()
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                when (error.failureKind) {
                    FailureKind.REVOKED -> close()
                    FailureKind.MISSING -> onDeleted()
                    else -> mutableState.value = mutableState.value.copy(deleting = false, deleteRefused = true)
                }
            }
        }
    }

    public fun close() {
        load?.cancel()
        secretRead?.cancel()
        mutableState.value = State(Status.REVOKED)
    }

    private fun readSecret(type: String, deliver: (String) -> Unit) {
        val current = mutableState.value
        if (current.status != Status.READY || current.loadingSecret != null || type !in current.secretTypes) return
        mutableState.value = current.copy(loadingSecret = type, issues = current.issues - type)
        secretRead = scope.launch {
            try {
                val value = store.readCredentialSecret(id, type, generation)
                mutableState.value = mutableState.value.copy(loadingSecret = null)
                // An empty field has nothing to show or copy; replacing the
                // clipboard with nothing would only take away what was there.
                if (value.isEmpty()) issue(type, FieldIssue.EMPTY) else deliver(value)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                mutableState.value = mutableState.value.copy(loadingSecret = null)
                when (error.failureKind) {
                    FailureKind.REVOKED -> close()
                    FailureKind.MISSING -> issue(type, FieldIssue.EMPTY)
                    FailureKind.TOO_LARGE -> issue(type, FieldIssue.TOO_LARGE)
                    else -> issue(type, FieldIssue.FAILED)
                }
            }
        }
    }

    private fun copy(value: String, sensitive: Boolean) {
        clipboard.copy(value, sensitive)
        mutableState.value = mutableState.value.copy(copies = mutableState.value.copies + 1)
    }

    private fun issue(type: String, issue: FieldIssue) {
        mutableState.value = mutableState.value.copy(issues = mutableState.value.issues + (type to issue))
    }

    public companion object {
        public const val PASSWORD: String = "password"
        public const val NOTE: String = "note"
        public const val CARD_NUMBER: String = "card_pan"
        public const val CARD_CODE: String = "card_cvv"
    }
}
