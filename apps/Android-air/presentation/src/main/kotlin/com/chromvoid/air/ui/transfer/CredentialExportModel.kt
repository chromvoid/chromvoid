package com.chromvoid.air.ui.transfer

import com.chromvoid.air.bridge.CoreRefusal
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
 * An export: Core prepares the document, the person chooses where it goes,
 * and the bytes are dropped as soon as they are written or the choice is
 * abandoned. No copy is kept in the app's own storage.
 */
public class CredentialExportModel(
    private val store: CredentialTransferStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
) {
    public enum class Status { READY, PREPARING, CHOOSING_DESTINATION, FINISHED, FAILED, REVOKED }

    public enum class Issue { TOO_LARGE, NOT_PREPARED, NOT_SAVED }

    public data class State(
        val status: Status = Status.READY,
        val issue: Issue? = null,
        /** The document, only while the destination is being chosen. */
        val document: ByteArray? = null,
        val attempt: Int = 0,
    ) {
        override fun equals(other: Any?): Boolean =
            other is State && other.status == status && other.issue == issue &&
                other.document === document && other.attempt == attempt

        override fun hashCode(): Int = listOf(status, issue, System.identityHashCode(document), attempt).hashCode()
    }

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()
    private var work: Job? = null

    public fun prepare() {
        val current = mutableState.value
        if (current.status !in setOf(Status.READY, Status.FAILED, Status.FINISHED)) return
        mutableState.value = current.copy(status = Status.PREPARING, issue = null)
        work = scope.launch {
            try {
                val document = store.exportCredentialDocument(generation)
                mutableState.value = mutableState.value.copy(
                    status = Status.CHOOSING_DESTINATION,
                    document = document,
                    attempt = mutableState.value.attempt + 1,
                )
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                mutableState.value = if (error.failureKind == FailureKind.REVOKED) {
                    State(Status.REVOKED)
                } else {
                    val tooLarge = (error as? CoreRefusal)?.code == "CREDENTIAL_EXPORT_TOO_LARGE"
                    mutableState.value.copy(
                        status = Status.FAILED,
                        issue = if (tooLarge) Issue.TOO_LARGE else Issue.NOT_PREPARED,
                    )
                }
            }
        }
    }

    /**
     * The destination picker closed: [saved] is true when the file was
     * written, false when writing failed and null when the person cancelled.
     */
    public fun finish(saved: Boolean?) {
        val current = mutableState.value
        if (current.status != Status.CHOOSING_DESTINATION) return
        current.document?.fill(0)
        mutableState.value = current.copy(
            document = null,
            status = when (saved) {
                true -> Status.FINISHED
                false -> Status.FAILED
                null -> Status.READY
            },
            issue = if (saved == false) Issue.NOT_SAVED else null,
        )
    }

    public fun close() {
        work?.cancel()
        mutableState.value.document?.fill(0)
        mutableState.value = State(Status.REVOKED)
    }
}
