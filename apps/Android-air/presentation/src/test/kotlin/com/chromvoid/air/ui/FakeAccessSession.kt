package com.chromvoid.air.ui

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * A session the access screens can drive without a runtime. It applies the
 * same [AccessInput] rules the real session applies before Core, and past them
 * answers as configured: accept, or refuse with [refusal] as Core would.
 */
internal class FakeAccessSession(
    initial: AirSessionState,
    private val refusal: String? = null,
) : AccessSession {
    private val mutableState = MutableStateFlow(initial)
    override val state: StateFlow<AirSessionState> = mutableState
    override val sequence: StateFlow<ULong> = MutableStateFlow(0uL)
    private val mutableAdministration = MutableStateFlow(administrationOf(initial))
    override val administration: StateFlow<ULong?> = mutableAdministration

    var refreshes: Int = 0

    override suspend fun refresh() {
        refreshes += 1
    }

    override suspend fun setUpAdministrator(password: String, confirmation: String): AccessOutcome =
        AccessInput.administratorProblem(password, confirmation)?.let { AccessOutcome.Rejected(it) }
            ?: answer(AirSessionState.Locked)

    override suspend fun unlock(password: String): AccessOutcome =
        AccessInput.unlockProblem(password)?.let { AccessOutcome.Rejected(it) }
            ?: answer(AirSessionState.Unlocked(generation = 1uL))

    private fun answer(next: AirSessionState): AccessOutcome {
        refusal?.let { return AccessOutcome.Refused(it) }
        move(next)
        return AccessOutcome.Accepted
    }

    /** Moves the session as Core would: every transition is a new generation. */
    fun move(next: AirSessionState) {
        mutableAdministration.value = administrationOf(next)
        mutableState.value = next
    }

    companion object {
        private var generations = 0uL

        /** Locked and first-run sessions get a generation of their own; an unlocked one keeps its own. */
        private fun administrationOf(state: AirSessionState): ULong? = when (state) {
            is AirSessionState.Unlocked -> state.generation
            AirSessionState.Locked, AirSessionState.NeedsAdministrator -> 100uL + ++generations
            AirSessionState.Starting, is AirSessionState.Unavailable -> null
        }

        fun locked(): FakeAccessSession = FakeAccessSession(AirSessionState.Locked)

        fun firstRun(): FakeAccessSession = FakeAccessSession(AirSessionState.NeedsAdministrator)

        fun refusing(code: String): FakeAccessSession = FakeAccessSession(AirSessionState.Locked, code)
    }

    var locks: Int = 0

    override suspend fun lock() {
        locks += 1
        move(AirSessionState.Locked)
    }
}
