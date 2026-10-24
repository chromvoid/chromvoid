package com.chromvoid.air.ui.maintenance

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.ffi.BridgeException
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
 * Deleting all local data, as on iOS: Core reviews the deletion as the screen
 * opens, the person acknowledges what goes and gives the administrative
 * password, and then everything is deleted. The outcome belongs to the app,
 * not to this screen: the erase replaces the session, which closes the screen
 * while the deletion is still finishing, so [onFinished] carries it on.
 */
public class StorageEraseModel(
    private val store: EraseStore,
    private val generation: ULong,
    private val scope: CoroutineScope,
    private val onFinished: (EraseOutcome) -> Unit = {},
) {
    public enum class Status { INITIAL, REVIEWING, READY, COMMITTING, FAILED, REVOKED }

    public enum class Issue {
        ACKNOWLEDGEMENT_REQUIRED,
        PASSWORD_REQUIRED,
        INVALID_PASSWORD,
        REVIEW_FAILED,
        REVIEW_EXPIRED,
        ADOPTION_REQUIRED,
    }

    public data class State(
        val status: Status = Status.INITIAL,
        val password: String = "",
        val acknowledged: Boolean = false,
        val issue: Issue? = null,
    )

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()
    private var review: EraseReview? = null
    private var work: Job? = null

    /** The screen went away while the deletion ran; only its outcome is still wanted. */
    private var dismissed = false

    /** Asks Core to review the deletion; the screen does this as it opens. */
    public fun prepare() {
        val current = mutableState.value
        if (current.status != Status.INITIAL && current.status != Status.FAILED) return
        mutableState.value = State(status = Status.REVIEWING)
        work = scope.launch {
            try {
                val reviewed = store.reviewErase(generation)
                if (mutableState.value.status != Status.REVIEWING) {
                    reviewed.cancel()
                    return@launch
                }
                review = reviewed
                mutableState.value = State(status = Status.READY)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (mutableState.value.status != Status.REVIEWING) return@launch
                mutableState.value = State(
                    status = Status.FAILED,
                    issue = if (error is BridgeException.AdoptionActionForbidden) {
                        Issue.ADOPTION_REQUIRED
                    } else {
                        Issue.REVIEW_FAILED
                    },
                )
            }
        }
    }

    public fun changePassword(value: String) {
        val current = mutableState.value
        if (current.status != Status.READY) return
        mutableState.value = current.copy(password = value, issue = null)
    }

    public fun acknowledge(value: Boolean) {
        val current = mutableState.value
        if (current.status != Status.READY) return
        mutableState.value = current.copy(acknowledged = value, issue = null)
    }

    public fun submit() {
        val current = mutableState.value
        val reviewed = review
        if (current.status != Status.READY || reviewed == null) return
        when {
            !current.acknowledged -> return refuse(Issue.ACKNOWLEDGEMENT_REQUIRED)
            current.password.isEmpty() -> return refuse(Issue.PASSWORD_REQUIRED)
        }
        // The password leaves the draft as the request is made: Core needs it once.
        mutableState.value = current.copy(password = "", status = Status.COMMITTING, issue = null)
        work = scope.launch { commit(reviewed, current.password) }
    }

    private suspend fun commit(reviewed: EraseReview, password: String) {
        try {
            val outcome = reviewed.commit(password)
            reviewed.cancel()
            finish(outcome)
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (error: Exception) {
            when {
                (error as? CoreRefusal)?.code == "INVALID_MASTER_PASSWORD" && !dismissed -> {
                    // Nothing was deleted; the same review takes another password.
                    mutableState.value = mutableState.value.copy(status = Status.READY, issue = Issue.INVALID_PASSWORD)
                }
                error.failureKind == FailureKind.REVOKED -> {
                    reviewed.cancel()
                    review = null
                    mutableState.value = State(status = Status.REVOKED)
                }
                error is EraseUnconfirmed -> finish(EraseOutcome.UNCONFIRMED)
                else -> {
                    // The review cannot be used again; a new one starts from the top.
                    reviewed.cancel()
                    review = null
                    mutableState.value = if (dismissed) {
                        State(status = Status.REVOKED)
                    } else {
                        State(
                            status = Status.FAILED,
                            issue = if (error is BridgeException.AdoptionActionForbidden) {
                                Issue.ADOPTION_REQUIRED
                            } else {
                                Issue.REVIEW_EXPIRED
                            },
                        )
                    }
                }
            }
        } finally {
            work = null
        }
    }

    private fun finish(outcome: EraseOutcome) {
        review = null
        mutableState.value = State(status = Status.REVOKED)
        onFinished(outcome)
    }

    private fun refuse(issue: Issue) {
        mutableState.value = mutableState.value.copy(issue = issue)
    }

    /**
     * The screen closed or the session moved on. A deletion already under way
     * is left to finish - stopping it halfway would leave neither the data nor
     * a clean device - and reports through [onFinished]; anything else ends.
     */
    public fun revoke() {
        if (mutableState.value.status == Status.COMMITTING) {
            dismissed = true
            return
        }
        mutableState.value = State(status = Status.REVOKED)
        work?.cancel()
        work = null
        review?.cancel()
        review = null
    }
}

/** The erase ran, but how it ended could not be confirmed. */
public class EraseUnconfirmed : Exception("The deletion result could not be confirmed")
