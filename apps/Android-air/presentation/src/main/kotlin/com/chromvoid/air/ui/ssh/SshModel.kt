package com.chromvoid.air.ui.ssh

import com.chromvoid.air.bridge.wire.PassmanagerSSHPageRequest
import com.chromvoid.air.bridge.wire.SSHKeySummary
import com.chromvoid.air.ui.credentials.CREDENTIAL_PAGE_SIZE
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
 * The SSH keys collection: Core's pages of key metadata, narrowed by a query
 * and a key type, with the creation form or one key's page above it. Every
 * page must come from one revision; a vault change between pages marks the
 * list stale instead of mixing two versions.
 */
public class SshModel(
    private val store: SshStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val clipboard: CredentialClipboard,
) {
    public enum class Status { LOADING, READY, STALE, FAILED, REVOKED }

    public enum class KeyType(public val wire: String?) { ALL(null), ED25519("ed25519"), RSA("rsa"), ECDSA("ecdsa") }

    public data class State(
        val status: Status = Status.LOADING,
        val query: String = "",
        val keyType: KeyType = KeyType.ALL,
        val keys: List<SSHKeySummary> = emptyList(),
        val loadingMore: Boolean = false,
        val canLoadMore: Boolean = false,
    ) {
        public val hasFilters: Boolean
            get() = query.isNotEmpty() || keyType != KeyType.ALL
    }

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private val mutableCreation = MutableStateFlow<SshCreationModel?>(null)

    /** The generate-or-import form, when open. */
    public val creation: StateFlow<SshCreationModel?> = mutableCreation.asStateFlow()

    private val mutableSelected = MutableStateFlow<SshDetailModel?>(null)

    /** The key opened from the list, when one is. */
    public val selected: StateFlow<SshDetailModel?> = mutableSelected.asStateFlow()

    private var revision: String? = null
    private var nextOffset: Long? = null
    private var fetch: Job? = null

    init {
        reload()
    }

    public fun reload() {
        if (mutableState.value.status == Status.REVOKED) return
        fetch?.cancel()
        revision = null
        nextOffset = null
        mutableState.value = mutableState.value.copy(
            status = Status.LOADING,
            keys = emptyList(),
            loadingMore = false,
            canLoadMore = false,
        )
        fetch = scope.launch { read(0) }
    }

    public fun search(query: String) {
        if (mutableState.value.query == query) return
        mutableState.value = mutableState.value.copy(query = query)
        reload()
    }

    public fun setKeyType(type: KeyType) {
        if (mutableState.value.keyType == type) return
        mutableState.value = mutableState.value.copy(keyType = type)
        reload()
    }

    public fun clearFilters() {
        val current = mutableState.value
        if (current.status == Status.REVOKED || !current.hasFilters) return
        mutableState.value = current.copy(query = "", keyType = KeyType.ALL)
        reload()
    }

    public fun loadMore() {
        val current = mutableState.value
        val offset = nextOffset
        if (current.status != Status.READY || current.loadingMore || offset == null) return
        mutableState.value = current.copy(loadingMore = true)
        fetch = scope.launch { read(offset) }
    }

    public fun beginCreation() {
        if (mutableState.value.status == Status.REVOKED || mutableCreation.value != null) return
        mutableCreation.value = SshCreationModel(store, generation, scope) { endCreation() }
    }

    /** Closes the form; the list reads again, since a key may have been added. */
    public fun endCreation() {
        mutableCreation.value?.close()
        mutableCreation.value = null
        reload()
    }

    public fun select(id: String) {
        val row = mutableState.value.keys.firstOrNull { it.key.id == id } ?: return
        if (mutableState.value.status != Status.READY) return
        mutableSelected.value?.close()
        mutableSelected.value = SshDetailModel(row, store, generation, scope, clipboard, onDeleted = ::closeDetail)
    }

    public fun closeDetail() {
        mutableSelected.value?.close()
        mutableSelected.value = null
        reload()
    }

    /** The screen left the foreground: a pasted key and a prepared export are dropped. */
    public fun coverSensitiveValues() {
        if (mutableCreation.value != null) endCreation()
        mutableSelected.value?.cancelExport()
    }

    public fun close() {
        fetch?.cancel()
        mutableCreation.value?.close()
        mutableCreation.value = null
        mutableSelected.value?.close()
        mutableSelected.value = null
        mutableState.value = State(Status.REVOKED)
    }

    private suspend fun read(offset: Long) {
        val current = mutableState.value
        try {
            val page = store.sshPage(
                PassmanagerSSHPageRequest(
                    keyType = current.keyType.wire,
                    limit = CREDENTIAL_PAGE_SIZE,
                    offset = offset,
                    query = current.query,
                    revision = revision,
                ),
                generation,
            )
            val next = page.nextOffset
            val previous = if (offset == 0L) emptyList() else mutableState.value.keys
            val ids = (previous + page.keys).map { it.key.id }
            val consistent = page.revision.length == REVISION_LENGTH &&
                page.keys.size <= CREDENTIAL_PAGE_SIZE &&
                (revision == null || revision == page.revision) &&
                (next == null || (next > offset && page.keys.isNotEmpty())) &&
                page.keys.all { it.key.id.isNotEmpty() && it.revision.length == REVISION_LENGTH } &&
                ids.toSet().size == ids.size
            if (!consistent) {
                settle(if (revision != null && revision != page.revision) Status.STALE else Status.FAILED)
                return
            }
            revision = page.revision
            nextOffset = next
            mutableState.value = mutableState.value.copy(
                status = Status.READY,
                keys = previous + page.keys,
                loadingMore = false,
                canLoadMore = next != null,
            )
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (error: Exception) {
            when (error.failureKind) {
                FailureKind.REVOKED -> close()
                FailureKind.STALE -> settle(Status.STALE)
                else -> settle(Status.FAILED)
            }
        }
    }

    private fun settle(status: Status) {
        revision = null
        nextOffset = null
        mutableState.value = mutableState.value.copy(
            status = status,
            keys = emptyList(),
            loadingMore = false,
            canLoadMore = false,
        )
    }

    private companion object {
        /** Core's revisions are SHA-256 hex digests. */
        const val REVISION_LENGTH = 64
    }
}
