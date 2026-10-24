package com.chromvoid.air.ui.access

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.chromvoid.air.ui.AccessInputProblem
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AccessSession
import com.chromvoid.air.ui.AirSessionState
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

/** Which control an inline error belongs to, so focus can follow it. */
public enum class AccessField { PASSWORD, CONFIRMATION }

public data class AccessFormState(
    val password: String = "",
    val confirmation: String = "",
    val submitting: Boolean = false,
    val problem: AccessInputProblem? = null,
    val refusalCode: String? = null,
) {
    public val invalidField: AccessField?
        get() = when (problem) {
            AccessInputProblem.EMPTY_PASSWORD -> AccessField.PASSWORD
            AccessInputProblem.EMPTY_CONFIRMATION,
            AccessInputProblem.CONFIRMATION_MISMATCH,
            -> AccessField.CONFIRMATION
            null -> if (refusalCode != null) AccessField.PASSWORD else null
        }
}

/**
 * Owns the access draft and the entry-to-vault presentation. The password lives here only while
 * the form does; a successful attempt clears it, and so does a failed one that
 * the user abandons by leaving the foreground.
 */
public class AccessViewModel(
    private val session: AccessSession,
    private val animateUnlockCompletion: Boolean = true,
    private val now: () -> Long = { System.nanoTime() / 1_000_000 },
) : ViewModel() {
    private val mutableForm = MutableStateFlow(AccessFormState())
    public val form: StateFlow<AccessFormState> = mutableForm.asStateFlow()

    public val state: StateFlow<AirSessionState> = session.state

    private val mutableUnlockMotion = MutableStateFlow<BrandUnlockMotion>(BrandUnlockMotion.Idle)
    public val unlockMotion: StateFlow<BrandUnlockMotion> = mutableUnlockMotion.asStateFlow()
    private var reducedMotion = false
    private var completion: Job? = null

    /** Holds only the entry presentation; session authorization and immediate locking stay authoritative. */
    public val displayState: StateFlow<AirSessionState> = combine(state, unlockMotion) { actual, motion ->
        val entering = motion is BrandUnlockMotion.Deriving ||
            motion is BrandUnlockMotion.Finishing || (motion is BrandUnlockMotion.Open && !motion.transitionStarted)
        if (actual is AirSessionState.Unlocked && entering) AirSessionState.Locked else actual
    }.stateIn(viewModelScope, SharingStarted.Eagerly, state.value)

    init {
        viewModelScope.launch {
            state.collect { actual ->
                if (actual !is AirSessionState.Unlocked &&
                    (unlockMotion.value is BrandUnlockMotion.Finishing || unlockMotion.value is BrandUnlockMotion.Open)
                ) {
                    completion?.cancel()
                    mutableUnlockMotion.value = BrandUnlockMotion.Idle
                    mutableForm.value = AccessFormState()
                }
            }
        }
    }

    public fun setReducedMotion(reduced: Boolean) {
        reducedMotion = reduced
        if (reduced &&
            (unlockMotion.value is BrandUnlockMotion.Finishing || unlockMotion.value is BrandUnlockMotion.Open)
        ) {
            completion?.cancel()
            mutableUnlockMotion.value = BrandUnlockMotion.Idle
            mutableForm.value = AccessFormState()
        }
    }

    public fun onPasswordChanged(value: String) {
        mutableForm.value = mutableForm.value.copy(password = value, problem = null, refusalCode = null)
    }

    public fun onConfirmationChanged(value: String) {
        mutableForm.value =
            mutableForm.value.copy(confirmation = value, problem = null, refusalCode = null)
    }

    public fun submitAdministrator() {
        submit { session.setUpAdministrator(it.password, it.confirmation) }
    }

    public fun submitUnlock() {
        submit(unlock = true) { session.unlock(it.password) }
    }

    /** The lock of the vault's screens. */
    public fun lock() {
        viewModelScope.launch { session.lock() }
    }

    private fun submit(unlock: Boolean = false, attempt: suspend (AccessFormState) -> AccessOutcome) {
        val current = mutableForm.value
        if (current.submitting) return
        mutableForm.value = current.copy(submitting = true, problem = null, refusalCode = null)
        val startedAt = now()
        if (unlock) mutableUnlockMotion.value = BrandUnlockMotion.Deriving(startedAt)
        viewModelScope.launch {
            mutableForm.value = when (val outcome = attempt(current)) {
                AccessOutcome.Accepted -> {
                    if (unlock && state.value is AirSessionState.Unlocked &&
                        animateUnlockCompletion && !reducedMotion
                    ) {
                        finishUnlock(startedAt)
                        AccessFormState(submitting = true)
                    } else {
                        mutableUnlockMotion.value = BrandUnlockMotion.Idle
                        AccessFormState()
                    }
                }
                is AccessOutcome.Rejected -> {
                    mutableUnlockMotion.value = BrandUnlockMotion.Rest
                    current.copy(submitting = false, problem = outcome.reason)
                }
                is AccessOutcome.Refused -> {
                    mutableUnlockMotion.value = BrandUnlockMotion.Rest
                    current.copy(submitting = false, password = "", refusalCode = outcome.code)
                }
            }
        }
    }

    private fun finishUnlock(startedAt: Long) {
        val completedAt = now()
        val finishMs = BrandMotionSpec.finishDuration(startedAt, completedAt)
        // Publish the phase before yielding so a fast result cannot skip the entry screen's signal.
        mutableUnlockMotion.value = if (finishMs > 0) {
            BrandUnlockMotion.Finishing(startedAt, completedAt)
        } else BrandUnlockMotion.Open(completedAt)
        completion = viewModelScope.launch {
            if (finishMs > 0) {
                delay(finishMs)
                mutableUnlockMotion.value = BrandUnlockMotion.Open(now())
            }
            delay(BrandMotionSpec.NAVIGATE_MS)
            val ring = mutableUnlockMotion.value as BrandUnlockMotion.Open
            mutableUnlockMotion.value = ring.copy(transitionStarted = true)
            mutableForm.value = AccessFormState()
            // Navigation starts before the ring ends; a retained entry surface can finish all 550 ms.
            delay(BrandMotionSpec.RING_MS - BrandMotionSpec.NAVIGATE_MS)
            mutableUnlockMotion.value = BrandUnlockMotion.Idle
        }
    }
}
