package com.chromvoid.air.ui.transfer

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

/** Removes every credential after a confirmation; an unconfirmed outcome is never retried here. */
public class CredentialClearModel(
    private val store: CredentialTransferStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val clipboard: CredentialClipboard,
) {
    public enum class Status { READY, CONFIRMING, CLEARING, FINISHED, DENIED, UNCERTAIN, REVOKED }

    private val mutableState = MutableStateFlow(Status.READY)
    public val state: StateFlow<Status> = mutableState.asStateFlow()
    private var work: Job? = null

    public fun request() {
        if (mutableState.value == Status.READY || mutableState.value == Status.FINISHED) {
            mutableState.value = Status.CONFIRMING
        }
    }

    public fun cancel() {
        if (mutableState.value == Status.CONFIRMING) mutableState.value = Status.READY
    }

    public fun confirm() {
        if (mutableState.value != Status.CONFIRMING) return
        mutableState.value = Status.CLEARING
        work = scope.launch {
            try {
                store.clearCredentials(generation)
                clipboard.clearOwned()
                mutableState.value = Status.FINISHED
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                mutableState.value = when (error.failureKind) {
                    FailureKind.REVOKED -> Status.REVOKED
                    FailureKind.DENIED -> Status.DENIED
                    else -> Status.UNCERTAIN
                }
            }
        }
    }

    public fun close() {
        work?.cancel()
        mutableState.value = Status.REVOKED
    }
}
