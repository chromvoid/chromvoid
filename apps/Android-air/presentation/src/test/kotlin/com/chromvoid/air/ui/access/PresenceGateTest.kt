package com.chromvoid.air.ui.access

import com.chromvoid.air.ui.credentials.modelScope
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class PresenceGateTest {
    private class FakeCheck : PresenceCheck {
        var next = PresenceCheck.Result.ACCEPTED
        var calls = 0
        var hold: CompletableDeferred<Unit>? = null

        override suspend fun authenticate(): PresenceCheck.Result {
            calls += 1
            hold?.await()
            return next
        }

        override fun cancel() = Unit
    }

    private class MemoryPreference(override var enabled: Boolean = false) : PresencePreference

    private val check = FakeCheck()
    private val preference = MemoryPreference()

    private fun TestScope.gate(): PresenceGate = PresenceGate(check, preference, modelScope())

    @Test
    public fun `the gate is off by default and asks for nothing`(): Unit = runTest {
        val gate = gate()
        assertFalse(gate.state.value.required)
        gate.onBackground()
        assertFalse(gate.state.value.required)
        assertEquals(0, check.calls)
    }

    @Test
    public fun `turning it on needs one confirmation, and a refusal leaves it off`(): Unit = runTest {
        val gate = gate()
        check.next = PresenceCheck.Result.CANCELLED
        gate.setEnabled(true)
        advanceUntilIdle()
        assertFalse(gate.state.value.enabled)
        assertFalse(preference.enabled)

        check.next = PresenceCheck.Result.ACCEPTED
        gate.setEnabled(true)
        advanceUntilIdle()
        assertTrue(gate.state.value.enabled)
        assertTrue(preference.enabled)
        assertFalse("the person just proved presence", gate.state.value.required)
    }

    @Test
    public fun `after the app was away it asks again, and only a success admits`(): Unit = runTest {
        preference.enabled = true
        val gate = gate()
        assertTrue("a fresh start asks", gate.state.value.required)

        check.next = PresenceCheck.Result.FAILED
        gate.authenticate()
        advanceUntilIdle()
        assertTrue(gate.state.value.required)
        assertEquals(PresenceGate.Issue.NOT_CONFIRMED, gate.state.value.issue)

        check.next = PresenceCheck.Result.ACCEPTED
        gate.authenticate()
        advanceUntilIdle()
        assertFalse(gate.state.value.required)

        gate.onBackground()
        assertTrue(gate.state.value.required)
    }

    @Test
    public fun `the system's own screen during a check does not reset it`(): Unit = runTest {
        preference.enabled = true
        val gate = gate()
        check.hold = CompletableDeferred()
        gate.authenticate()
        advanceUntilIdle()

        // The screen-lock fallback is another activity: this app stops while it is shown.
        gate.onBackground()
        check.hold!!.complete(Unit)
        advanceUntilIdle()

        assertFalse(gate.state.value.required)
    }

    @Test
    public fun `a device without authentication says so`(): Unit = runTest {
        val gate = gate()
        check.next = PresenceCheck.Result.UNAVAILABLE
        gate.setEnabled(true)
        advanceUntilIdle()
        assertEquals(PresenceGate.Issue.UNAVAILABLE, gate.state.value.issue)
        assertFalse(gate.state.value.enabled)
    }

    @Test
    public fun `turning it off forgets it at once`(): Unit = runTest {
        preference.enabled = true
        val gate = gate()
        gate.setEnabled(false)
        assertFalse(gate.state.value.required)
        assertFalse(preference.enabled)
    }
}
