package com.chromvoid.air.session

import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.AccessInputProblem
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AdoptionIssue
import com.chromvoid.air.ui.AirSessionState
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class AirSessionTest {
    @Test
    public fun `adoption outcomes remain distinct and never open administration`(): Unit = runTest {
        val outcomes = listOf(
            Triple(BridgeException.AdoptionBlocked(), "AdoptionBlocked", AdoptionIssue.BLOCKED),
            Triple(
                BridgeException.AdoptionLegacyRootOutsideDataDir(),
                "AdoptionLegacyRootOutsideDataDir",
                AdoptionIssue.LEGACY_ROOT_OUTSIDE_DATA_DIR,
            ),
            Triple(
                BridgeException.AdoptionLegacyRootUnavailable(),
                "AdoptionLegacyRootUnavailable",
                AdoptionIssue.LEGACY_ROOT_UNAVAILABLE,
            ),
            Triple(
                BridgeException.AdoptionPepperUnavailable(),
                "AdoptionPepperUnavailable",
                AdoptionIssue.PEPPER_UNAVAILABLE,
            ),
            Triple(
                BridgeException.AdoptionStorageUnavailable(),
                "AdoptionStorageUnavailable",
                AdoptionIssue.STORAGE_UNAVAILABLE,
            ),
            Triple(
                BridgeException.AdoptionActionForbidden(),
                "AdoptionActionForbidden",
                AdoptionIssue.ACTION_FORBIDDEN,
            ),
        )
        for ((error, code, issue) in outcomes) {
            val session = AirSession({ throw error }, backgroundScope)
            session.start()
            assertEquals(AirSessionState.Unavailable(code, issue), session.state.value)
            assertNull(session.administration.value)
        }
    }

    @Test
    public fun `retry opens the runtime after its device key becomes available`(): Unit = runTest {
        var attempts = 0
        val session = AirSession({
            attempts += 1
            if (attempts == 1) throw BridgeException.AdoptionPepperUnavailable()
            FakeSessionRuntime()
        }, backgroundScope)
        session.start()
        assertEquals(AdoptionIssue.PEPPER_UNAVAILABLE, (session.state.value as AirSessionState.Unavailable).adoption)

        session.start()

        assertEquals(2, attempts)
        assertEquals(AirSessionState.Locked, session.state.value)
        assertEquals(1uL, session.administration.value)
    }

    @Test
    public fun `other startup failures do not acquire an adoption outcome`(): Unit = runTest {
        val session = AirSession({ throw BridgeException.SessionRevoked() }, backgroundScope)
        session.start()

        assertEquals(AirSessionState.Unavailable("SessionRevoked"), session.state.value)
        assertNull(session.administration.value)
    }

    @Test
    public fun `a vault without an administrator asks for one instead of a password`(): Unit = runTest {
        val session = AirSession({ FakeSessionRuntime(masterConfigured = false) }, backgroundScope)
        session.start()

        assertEquals(AirSessionState.NeedsAdministrator, session.state.value)
    }

    @Test
    public fun `a mismatched confirmation never reaches Core`(): Unit = runTest {
        val runtime = FakeSessionRuntime(masterConfigured = false)
        val session = AirSession({ runtime }, backgroundScope)
        session.start()

        val outcome = session.setUpAdministrator("first", "second")

        assertEquals(AccessOutcome.Rejected(AccessInputProblem.CONFIRMATION_MISMATCH), outcome)
        assertEquals(0, runtime.setupCalls)
        assertEquals(AirSessionState.NeedsAdministrator, session.state.value)
    }

    @Test
    public fun `an empty password is a form problem, not a refusal`(): Unit = runTest {
        val session = AirSession({ FakeSessionRuntime() }, backgroundScope)
        session.start()

        val outcome = session.unlock("")

        assertEquals(AccessOutcome.Rejected(AccessInputProblem.EMPTY_PASSWORD), outcome)
        assertEquals(AirSessionState.Locked, session.state.value)
    }

    @Test
    public fun `an accepted password opens the session that Rust reports`(): Unit = runTest {
        val session = AirSession({ FakeSessionRuntime() }, backgroundScope)
        session.start()

        val outcome = session.unlock("anything")

        assertEquals(AccessOutcome.Accepted, outcome)
        assertTrue(session.state.value is AirSessionState.Unlocked)
    }

    @Test
    public fun `a refusal is passed through by code and leaves the vault closed`(): Unit = runTest {
        val session = AirSession({ FakeSessionRuntime(unlockRefusal = "vault_locked") }, backgroundScope)
        session.start()

        val outcome = session.unlock("anything")

        assertEquals(AccessOutcome.Refused("vault_locked"), outcome)
        assertEquals(AirSessionState.Locked, session.state.value)
    }

    @Test
    public fun `leaving the foreground revokes access and then locks`(): Unit = runTest {
        val runtime = FakeSessionRuntime()
        val session = AirSession({ runtime }, backgroundScope)
        session.start()
        session.unlock("anything")

        session.deactivate()

        assertEquals(1, runtime.deactivateCount)
        assertEquals(1, runtime.lockCount)
        assertEquals(AirSessionState.Locked, session.state.value)
    }

    @Test
    public fun `administration follows the generation Core admits it under`(): Unit = runTest {
        val runtime = FakeSessionRuntime()
        val session = AirSession({ runtime }, backgroundScope)
        assertNull("nothing before the runtime opens", session.administration.value)
        session.start()
        assertEquals("a locked vault is administered", 1uL, session.administration.value)

        session.unlock("anything")
        assertEquals(runtime.snapshot().generation, session.administration.value)

        runtime.deactivate()
        session.refresh()
        assertNull("not while leaving the foreground", session.administration.value)

        session.lock()
        assertEquals("the lock is a generation of its own", 2uL, session.administration.value)
    }

    @Test
    public fun `leaving the foreground keeps the vault open unless Settings asks to lock`(): Unit = runTest {
        val runtime = FakeSessionRuntime()
        val preferences = MemorySessionPreferences()
        val session = AirSession({ runtime }, backgroundScope, preferences)
        session.start()
        session.unlock("anything")
        val open = session.state.value

        session.leaveForeground()
        assertEquals(open, session.state.value)
        assertEquals(0, runtime.deactivateCount)

        preferences.lockOnLeave = true
        session.leaveForeground()
        assertEquals(1, runtime.deactivateCount)
        assertEquals(AirSessionState.Locked, session.state.value)
    }

    @Test
    public fun `turning the screen off keeps an open vault unlocked by default`(): Unit = runTest {
        val runtime = FakeSessionRuntime()
        val session = AirSession({ runtime }, backgroundScope, MemorySessionPreferences())
        session.start()
        session.unlock("anything")

        session.screenOff()

        assertEquals(0, runtime.lockCount)
        assertTrue(session.state.value is AirSessionState.Unlocked)
    }

    @Test
    public fun `turning the screen off locks an open vault when enabled`(): Unit = runTest {
        val runtime = FakeSessionRuntime()
        val session = AirSession({ runtime }, backgroundScope, MemorySessionPreferences(lockOnScreenOff = true))
        session.start()
        session.unlock("anything")

        session.screenOff()

        assertEquals(AirSessionState.Locked, session.state.value)
        session.screenOff()
        assertEquals("a locked vault is not locked again", 1, runtime.lockCount)
    }

    @Test
    public fun `turning the screen off locks an open vault without preferences`(): Unit = runTest {
        val runtime = FakeSessionRuntime()
        val session = AirSession({ runtime }, backgroundScope, null)
        session.start()
        session.unlock("anything")

        session.screenOff()

        assertEquals(1, runtime.lockCount)
        assertEquals(AirSessionState.Locked, session.state.value)
    }

    @Test
    public fun `the stored inactivity lock is given to the runtime when it opens`(): Unit = runTest {
        val runtime = FakeSessionRuntime()
        val session = AirSession({ runtime }, backgroundScope, MemorySessionPreferences(autoLockSeconds = 300))

        session.start()

        assertEquals(listOf(1uL to 300uL), runtime.autoLockCalls)
    }

    @Test
    public fun `a new inactivity lock applies to the current generation`(): Unit = runTest {
        val runtime = FakeSessionRuntime()
        val session = AirSession({ runtime }, backgroundScope, MemorySessionPreferences())
        session.start()
        session.unlock("anything")

        assertTrue(session.applyAutoLock(900))

        assertEquals(runtime.current.generation to 900uL, runtime.autoLockCalls.single())
    }

    @Test
    public fun `a runtime that cannot open reports why instead of pretending to be locked`(): Unit =
        runTest {
            val session = AirSession({ throw UnsatisfiedLinkError("no library") }, backgroundScope)
            session.start()

            assertEquals(AirSessionState.Unavailable("MissingNativeLibrary"), session.state.value)
        }

    @Test
    public fun `a lock Rust decides on its own reaches the shell`(): Unit = runTest {
        val runtime = FakeSessionRuntime()
        val session = AirSession({ runtime }, backgroundScope)
        session.start()
        session.unlock("anything")
        assertTrue(session.state.value is AirSessionState.Unlocked)

        runtime.lockFromRust()
        runCurrent()

        assertEquals(AirSessionState.Locked, session.state.value)
        assertEquals(runtime.current.sequence, session.sequence.value)
    }
}
