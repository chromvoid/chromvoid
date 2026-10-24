package com.chromvoid.air.ui.wallet

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.wire.WalletAddressBookCreateRequest
import com.chromvoid.air.bridge.wire.WalletAddressBookDeleteRequest
import com.chromvoid.air.bridge.wire.WalletAddressBookEntry
import com.chromvoid.air.bridge.wire.WalletAddressBookUpdateRequest
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
 * The vault's wallet contacts, as the iOS address book keeps them: a name, a
 * network and an address each, with Core validating the address for its
 * network. One editor is open at a time. A change Core cannot confirm reads
 * the list again and waits until the person has checked it.
 */
public class WalletAddressBookModel(
    private val store: WalletStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val clipboard: CredentialClipboard,
) {
    public enum class Phase { LOADING, READY, FAILED, REVOKED }

    public enum class Mutation { IDLE, WORKING, UNCERTAIN }

    public enum class Field { LABEL, NETWORK, ADDRESS }

    public sealed interface Issue {
        public data class Required(val field: Field) : Issue

        public data object InvalidAddress : Issue

        public data object InvalidInput : Issue

        public data object Denied : Issue

        public data object Unavailable : Issue

        public data object Missing : Issue

        public data object Uncertain : Issue
    }

    /** The contact being written; [entryId] is null for a new one. */
    public data class Draft(
        val entryId: String?,
        val label: String = "",
        val network: String? = null,
        val address: String = "",
    )

    public data class State(
        val phase: Phase = Phase.LOADING,
        val mutation: Mutation = Mutation.IDLE,
        val entries: List<WalletAddressBookEntry> = emptyList(),
        /** The networks a contact can name: those the wallet has switched on. */
        val networks: List<String> = emptyList(),
        val draft: Draft? = null,
        val original: Draft? = null,
        val pendingDeletion: WalletAddressBookEntry? = null,
        val discardRequested: Boolean = false,
        val issue: Issue? = null,
        val copiedId: String? = null,
        /** Bumped when a field needs the person's attention. */
        val focusRevision: Int = 0,
    ) {
        val hasChanges: Boolean get() = draft != original

        /** The address book closes only with nothing open over it and nothing being saved. */
        val canDismiss: Boolean get() = mutation != Mutation.WORKING && draft == null && pendingDeletion == null

        val invalidField: Field?
            get() = when (val issue = issue) {
                is Issue.Required -> issue.field
                Issue.InvalidAddress -> Field.ADDRESS
                else -> null
            }

        public fun value(field: Field): String = when (field) {
            Field.LABEL -> draft?.label.orEmpty()
            Field.NETWORK -> draft?.network.orEmpty()
            Field.ADDRESS -> draft?.address.orEmpty()
        }
    }

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private var reads: Job? = null
    private var writes: Job? = null

    private val revoked: Boolean get() = mutableState.value.phase == Phase.REVOKED

    public fun updateNetworks(networks: List<String>) {
        if (revoked) return
        mutableState.value = mutableState.value.copy(networks = networks)
    }

    public fun reload() {
        if (revoked) return
        reads?.cancel()
        reads = scope.launch { load() }
    }

    /** Reads the contacts; a write awaits it so the list it leaves is Core's. */
    private suspend fun load() {
        mutableState.value = mutableState.value.copy(phase = Phase.LOADING, copiedId = null)
        try {
            val entries = store.walletContacts(generation).entries
            mutableState.value = mutableState.value.copy(phase = Phase.READY, entries = entries)
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

    private val editable: Boolean
        get() = mutableState.value.let {
            it.phase == Phase.READY && it.mutation == Mutation.IDLE && it.draft == null && it.pendingDeletion == null
        }

    public fun add() {
        if (!editable) return
        open(Draft(entryId = null))
    }

    public fun edit(id: String) {
        if (!editable) return
        val entry = mutableState.value.entries.firstOrNull { it.entryID == id } ?: return
        open(Draft(id, entry.label, entry.network, entry.address))
    }

    private fun open(draft: Draft) {
        mutableState.value = mutableState.value.copy(
            draft = draft,
            original = draft,
            issue = null,
            discardRequested = false,
        )
    }

    public fun change(field: Field, value: String) {
        val current = mutableState.value
        val draft = current.draft ?: return
        if (current.mutation != Mutation.IDLE || revoked) return
        val next = when (field) {
            Field.LABEL -> draft.copy(label = value)
            Field.NETWORK -> draft.copy(network = value.ifEmpty { null })
            Field.ADDRESS -> draft.copy(address = value)
        }
        mutableState.value = current.copy(draft = next, issue = null)
    }

    /** Cancel on the editor: changes ask first. */
    public fun closeEditor() {
        val current = mutableState.value
        if (current.mutation == Mutation.WORKING) return
        if (current.hasChanges) {
            mutableState.value = current.copy(discardRequested = true)
        } else {
            clearEditor()
        }
    }

    public fun keepEditing() {
        mutableState.value = mutableState.value.copy(discardRequested = false)
    }

    public fun discard() {
        if (mutableState.value.mutation == Mutation.WORKING) return
        clearEditor()
    }

    private fun clearEditor() {
        mutableState.value = mutableState.value.copy(draft = null, original = null, discardRequested = false)
    }

    public fun save() {
        val current = mutableState.value
        val draft = current.draft ?: return
        if (current.phase != Phase.READY || current.mutation != Mutation.IDLE) return
        val network = draft.network?.takeIf { it in current.networks }
        val missing = when {
            draft.label.isBlank() -> Field.LABEL
            network == null -> Field.NETWORK
            draft.address.isBlank() -> Field.ADDRESS
            else -> null
        }
        if (missing != null || network == null) {
            mutableState.value = current.copy(
                issue = Issue.Required(missing ?: Field.NETWORK),
                focusRevision = current.focusRevision + 1,
            )
            return
        }
        val id = draft.entryId
        if (id == null) {
            perform {
                store.createWalletContact(
                    WalletAddressBookCreateRequest(draft.address, draft.label, network),
                    generation,
                )
            }
            return
        }
        if (current.entries.none { it.entryID == id }) {
            mutableState.value = current.copy(issue = Issue.Missing)
            return
        }
        perform {
            store.updateWalletContact(
                WalletAddressBookUpdateRequest(draft.address, id, draft.label, network),
                generation,
            )
        }
    }

    public fun requestDeletion(id: String) {
        val current = mutableState.value
        if (current.phase != Phase.READY || current.mutation != Mutation.IDLE || current.draft != null) return
        val entry = current.entries.firstOrNull { it.entryID == id }
        mutableState.value = current.copy(pendingDeletion = entry, issue = null)
    }

    public fun cancelDeletion() {
        mutableState.value = mutableState.value.copy(pendingDeletion = null)
    }

    public fun confirmDeletion() {
        val current = mutableState.value
        val entry = current.pendingDeletion ?: return
        if (current.phase != Phase.READY || current.mutation != Mutation.IDLE) return
        mutableState.value = current.copy(pendingDeletion = null)
        perform { store.deleteWalletContact(WalletAddressBookDeleteRequest(entry.entryID), generation) }
    }

    /** The person checked the list after a change Core could not confirm. */
    public fun acknowledgeReconciliation() {
        val current = mutableState.value
        if (current.phase != Phase.READY || current.mutation != Mutation.UNCERTAIN) return
        mutableState.value = current.copy(mutation = Mutation.IDLE, issue = null)
    }

    public fun copyAddress(id: String) {
        val current = mutableState.value
        if (current.phase != Phase.READY || current.mutation == Mutation.WORKING) return
        val entry = current.entries.firstOrNull { it.entryID == id } ?: return
        clipboard.copy(entry.address, sensitive = false)
        mutableState.value = current.copy(copiedId = id)
    }

    private fun perform(operation: suspend () -> Unit) {
        mutableState.value = mutableState.value.copy(mutation = Mutation.WORKING, issue = null)
        writes = scope.launch {
            try {
                operation()
                clearEditor()
                reads?.cancel()
                load()
                if (!revoked) mutableState.value = mutableState.value.copy(mutation = Mutation.IDLE)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (error.failureKind == FailureKind.REVOKED) {
                    revoke()
                    return@launch
                }
                val issue = if ((error as? CoreRefusal)?.code == "INVALID_ADDRESS") {
                    Issue.InvalidAddress
                } else {
                    when (error.failureKind) {
                        FailureKind.INVALID_INPUT -> Issue.InvalidInput
                        FailureKind.DENIED -> Issue.Denied
                        FailureKind.UNAVAILABLE -> Issue.Unavailable
                        FailureKind.MISSING -> Issue.Missing
                        else -> Issue.Uncertain
                    }
                }
                val current = mutableState.value
                mutableState.value = current.copy(
                    issue = issue,
                    mutation = if (issue == Issue.Uncertain) Mutation.UNCERTAIN else Mutation.IDLE,
                    focusRevision = current.focusRevision + 1,
                )
                // The list is not what this editor was opened on any more: show Core's.
                if (issue == Issue.Uncertain || issue == Issue.Missing) {
                    clearEditor()
                    reads?.cancel()
                    load()
                }
            }
        }
    }

    public fun revoke() {
        reads?.cancel()
        writes?.cancel()
        clipboard.clearOwned()
        mutableState.value = State(phase = Phase.REVOKED)
    }
}
