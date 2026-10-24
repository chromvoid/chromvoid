package com.chromvoid.air.ui.credentials

import com.chromvoid.air.bridge.wire.CredentialSecurityAuditRow
import com.chromvoid.air.bridge.wire.PassmanagerSecurityAuditPageRequest
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
 * The security audit: Core's assessment of every password, read a page at a
 * time. Core owns every judgement - strength, reuse across the vault, a
 * missing second factor - and this holder only shows it. All pages must come
 * from one audit revision; when the vault changes between pages, the list is
 * marked stale instead of mixing two versions.
 */
public class AuditModel(
    private val store: CredentialStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
) {
    public enum class Status { LOADING, READY, STALE, FAILED, REVOKED }

    public enum class Filter(public val wire: String?) {
        ALL(null),
        WEAK("weak"),
        REUSED("reused"),
        WITHOUT_CODES("without_otp"),
        NOT_CHECKED("failed"),
    }

    public data class Counts(
        val total: Long,
        val weak: Long,
        val reused: Long,
        val withCodes: Long,
        val notChecked: Long,
    )

    public data class State(
        val status: Status = Status.LOADING,
        val filter: Filter = Filter.ALL,
        val rows: List<CredentialSecurityAuditRow> = emptyList(),
        val counts: Counts? = null,
        val loadingMore: Boolean = false,
        val canLoadMore: Boolean = false,
    )

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()
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
        mutableState.value = mutableState.value.copy(status = Status.LOADING, rows = emptyList(), canLoadMore = false)
        fetch = scope.launch { read(0) }
    }

    public fun setFilter(filter: Filter) {
        if (mutableState.value.filter == filter) return
        mutableState.value = mutableState.value.copy(filter = filter)
        reload()
    }

    public fun loadMore() {
        val current = mutableState.value
        val offset = nextOffset
        if (current.status != Status.READY || current.loadingMore || offset == null) return
        mutableState.value = current.copy(loadingMore = true)
        fetch = scope.launch { read(offset) }
    }

    public fun close() {
        fetch?.cancel()
        mutableState.value = State(Status.REVOKED)
    }

    private suspend fun read(offset: Long) {
        val filter = mutableState.value.filter
        try {
            val page = store.securityAuditPage(
                PassmanagerSecurityAuditPageRequest(
                    issue = filter.wire,
                    limit = CREDENTIAL_PAGE_SIZE,
                    offset = offset,
                    revision = revision,
                ),
                generation,
            )
            val next = page.nextOffset
            val consistent = page.algorithmVersion == ALGORITHM_VERSION &&
                (revision == null || revision == page.revision) &&
                (next == null || (next > offset && page.entries.isNotEmpty()))
            if (!consistent) {
                // Another revision means the vault changed between pages.
                val stale = revision != null && revision != page.revision
                settle(if (stale) Status.STALE else Status.FAILED)
                return
            }
            revision = page.revision
            nextOffset = next
            val previous = if (offset == 0L) emptyList() else mutableState.value.rows
            mutableState.value = mutableState.value.copy(
                status = Status.READY,
                rows = previous + page.entries,
                loadingMore = false,
                canLoadMore = next != null,
                counts = Counts(
                    total = page.totalCount,
                    weak = page.weakPasswordCount,
                    reused = page.reusedPasswordCount,
                    withCodes = page.twoFactorCount,
                    notChecked = page.failedCount,
                ),
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
        nextOffset = null
        mutableState.value = mutableState.value.copy(
            status = status,
            rows = emptyList(),
            loadingMore = false,
            canLoadMore = false,
        )
    }

    private companion object {
        /** The audit algorithm this client can explain; another version is not shown as if it were. */
        const val ALGORITHM_VERSION = 1L
    }
}
