package com.chromvoid.air.ui.passkeys

import com.chromvoid.air.bridge.wire.VaultPasskeyDeleteRequest
import com.chromvoid.air.bridge.wire.VaultPasskeySummary
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
 * The vault's passkeys, as the iOS Passkeys page lists them: searched by
 * website or account, each opening its details, and deleted from this vault
 * only after the person confirms. A deletion Core could not confirm clears
 * the list until it is read again.
 */
public class PasskeysModel(
    private val store: PasskeyStore,
    public val generation: ULong,
    private val scope: CoroutineScope,
) {
    public enum class Phase { LOADING, READY, DELETING, FAILED, UNCERTAIN, REVOKED }

    public enum class Notice { DELETED, MISSING, UNCERTAIN }

    public data class State(
        val phase: Phase = Phase.LOADING,
        val rows: List<VaultPasskeySummary> = emptyList(),
        val query: String = "",
        val selectedId: String? = null,
        val confirmingDelete: Boolean = false,
        val notice: Notice? = null,
    ) {
        val selected: VaultPasskeySummary? get() = rows.firstOrNull { it.credentialIDB64URL == selectedId }

        val matches: List<VaultPasskeySummary>
            get() {
                val query = query.trim()
                if (query.isEmpty()) return rows
                return rows.filter { passkey ->
                    listOf(passkey.rpID, passkey.rpName, passkey.userName, passkey.userDisplayName)
                        .any { it.contains(query, ignoreCase = true) }
                }
            }
    }

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private var sequence: ULong? = null
    private var work: Job? = null
    private var deletion: Job? = null

    public fun search(value: String) {
        if (mutableState.value.phase == Phase.REVOKED) return
        mutableState.value = mutableState.value.copy(query = value)
    }

    public fun select(id: String) {
        val current = mutableState.value
        if (current.phase != Phase.READY || current.rows.none { it.credentialIDB64URL == id }) return
        mutableState.value = current.copy(selectedId = id, notice = null)
    }

    public fun closeDetail() {
        mutableState.value = mutableState.value.copy(selectedId = null, confirmingDelete = false)
    }

    public fun requestDelete() {
        val current = mutableState.value
        if (current.phase != Phase.READY || current.selected == null) return
        mutableState.value = current.copy(confirmingDelete = true)
    }

    public fun cancelDelete() {
        mutableState.value = mutableState.value.copy(confirmingDelete = false)
    }

    /** The runtime reported a change; a deletion on its way reads again when it lands. */
    public fun synchronize(sequence: ULong) {
        val current = mutableState.value
        if (current.phase == Phase.REVOKED || this.sequence == sequence) return
        val first = this.sequence == null
        this.sequence = sequence
        if (!first && current.phase != Phase.DELETING) reload()
    }

    public fun reload() {
        val current = mutableState.value
        if (current.phase == Phase.REVOKED || current.phase == Phase.DELETING) return
        mutableState.value = current.copy(
            phase = Phase.LOADING,
            rows = emptyList(),
            selectedId = null,
            confirmingDelete = false,
        )
        work?.cancel()
        work = scope.launch { load() }
    }

    private suspend fun load() {
        try {
            val rows = store.listPasskeys(generation).passkeys
            val current = mutableState.value
            mutableState.value = current.copy(
                phase = Phase.READY,
                rows = rows,
                notice = current.notice.takeIf { it != Notice.UNCERTAIN },
            )
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

    public fun confirmDelete() {
        val current = mutableState.value
        val id = current.selectedId ?: return
        if (current.phase != Phase.READY || !current.confirmingDelete) return
        mutableState.value = current.copy(phase = Phase.DELETING, confirmingDelete = false, notice = null)
        deletion = scope.launch {
            try {
                val deleted = store.deletePasskey(VaultPasskeyDeleteRequest(id), generation).deleted
                mutableState.value = mutableState.value.copy(
                    phase = Phase.LOADING,
                    notice = if (deleted) Notice.DELETED else Notice.MISSING,
                    rows = emptyList(),
                    selectedId = null,
                )
                // An acknowledgement still reads the list Core holds.
                load()
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (error.failureKind == FailureKind.REVOKED) {
                    revoke()
                } else {
                    mutableState.value = mutableState.value.copy(
                        phase = Phase.UNCERTAIN,
                        rows = emptyList(),
                        selectedId = null,
                        notice = Notice.UNCERTAIN,
                    )
                }
            }
        }
    }

    public fun revoke() {
        work?.cancel()
        deletion?.cancel()
        mutableState.value = State(phase = Phase.REVOKED)
    }
}
