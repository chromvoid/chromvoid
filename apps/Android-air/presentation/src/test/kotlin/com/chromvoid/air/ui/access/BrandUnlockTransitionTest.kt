package com.chromvoid.air.ui.access

import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AccessSession
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.FakeAccessSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class BrandUnlockTransitionTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    public fun setUp(): Unit = Dispatchers.setMain(dispatcher)

    @After
    public fun tearDown(): Unit = Dispatchers.resetMain()

    @Test
    public fun `success orders signal then ring then navigation for any accepted password`(): Unit =
        runTest(dispatcher) {
            for (password in listOf("empty-place", "existing-place")) {
                val session = delayed(FakeAccessSession.locked(), 600)
                val model = AccessViewModel(session) { testScheduler.currentTime }
                model.onPasswordChanged(password)
                model.submitUnlock()
                runCurrent()
                assertTrue(model.unlockMotion.value is BrandUnlockMotion.Deriving)
                advanceTimeBy(600)
                runCurrent()
                assertTrue(model.state.value is AirSessionState.Unlocked)
                assertEquals(AirSessionState.Locked, model.displayState.value)
                assertTrue(model.unlockMotion.value is BrandUnlockMotion.Finishing)
                assertEquals("", model.form.value.password)
                advanceTimeBy(219)
                runCurrent()
                assertTrue(model.unlockMotion.value is BrandUnlockMotion.Finishing)
                advanceTimeBy(1)
                runCurrent()
                assertTrue(model.unlockMotion.value is BrandUnlockMotion.Open)
                assertEquals(AirSessionState.Locked, model.displayState.value)
                advanceTimeBy(149)
                runCurrent()
                assertEquals(AirSessionState.Locked, model.displayState.value)
                advanceTimeBy(1)
                runCurrent()
                assertTrue(model.displayState.value is AirSessionState.Unlocked)
                assertTrue((model.unlockMotion.value as BrandUnlockMotion.Open).transitionStarted)
                advanceTimeBy(399)
                runCurrent()
                assertTrue(model.unlockMotion.value is BrandUnlockMotion.Open)
                advanceTimeBy(1)
                runCurrent()
                assertEquals(BrandUnlockMotion.Idle, model.unlockMotion.value)
            }
        }

    @Test
    public fun `a result between runs starts the ring immediately`(): Unit = runTest(dispatcher) {
        val model = AccessViewModel(delayed(FakeAccessSession.locked(), 1200)) { testScheduler.currentTime }
        model.onPasswordChanged("anything")
        model.submitUnlock()
        advanceTimeBy(1200)
        runCurrent()
        assertEquals(BrandUnlockMotion.Open(1200), model.unlockMotion.value)
        advanceTimeBy(150)
        runCurrent()
        assertTrue(model.displayState.value is AirSessionState.Unlocked)
    }

    @Test
    public fun `provider completion releases success immediately without finishing or a ring`(): Unit =
        runTest(dispatcher) {
            for (duration in listOf(600L, 1200L)) {
                for (reduced in listOf(false, true)) {
                    val model = AccessViewModel(
                        delayed(FakeAccessSession.locked(), duration),
                        animateUnlockCompletion = false,
                    ) { testScheduler.currentTime }
                    model.setReducedMotion(reduced)
                    model.onPasswordChanged("anything")
                    model.submitUnlock()
                    runCurrent()
                    assertTrue(model.unlockMotion.value is BrandUnlockMotion.Deriving)
                    advanceTimeBy(duration - 1)
                    runCurrent()
                    assertEquals(AirSessionState.Locked, model.displayState.value)
                    assertTrue(model.unlockMotion.value is BrandUnlockMotion.Deriving)
                    advanceTimeBy(1)
                    runCurrent()
                    assertEquals(BrandUnlockMotion.Idle, model.unlockMotion.value)
                    assertTrue(model.displayState.value is AirSessionState.Unlocked)
                    assertEquals(AccessFormState(), model.form.value)
                    advanceTimeBy(1000)
                    runCurrent()
                    assertEquals(BrandUnlockMotion.Idle, model.unlockMotion.value)
                }
            }
        }

    @Test
    public fun `an error returns the sign to rest without a ring or navigation`(): Unit = runTest(dispatcher) {
        val model = AccessViewModel(delayed(FakeAccessSession.refusing("disk_failure"), 600)) {
            testScheduler.currentTime
        }
        model.onPasswordChanged("anything")
        model.submitUnlock()
        advanceTimeBy(600)
        runCurrent()
        assertEquals(BrandUnlockMotion.Rest, model.unlockMotion.value)
        assertEquals(AirSessionState.Locked, model.displayState.value)
        assertEquals("disk_failure", model.form.value.refusalCode)
    }

    @Test
    public fun `reduced motion releases the result immediately with no finishing or ring`(): Unit =
        runTest(dispatcher) {
            val model = AccessViewModel(delayed(FakeAccessSession.locked(), 600)) { testScheduler.currentTime }
            model.setReducedMotion(true)
            model.onPasswordChanged("anything")
            model.submitUnlock()
            advanceTimeBy(600)
            runCurrent()
            assertEquals(BrandUnlockMotion.Idle, model.unlockMotion.value)
            assertTrue(model.displayState.value is AirSessionState.Unlocked)
        }

    @Test
    public fun `enabling reduced motion during completion releases the result immediately`(): Unit =
        runTest(dispatcher) {
            val model = AccessViewModel(FakeAccessSession.locked()) { testScheduler.currentTime }
            model.onPasswordChanged("anything")
            model.submitUnlock()
            runCurrent()
            assertTrue(model.unlockMotion.value is BrandUnlockMotion.Finishing)
            model.setReducedMotion(true)
            runCurrent()
            assertEquals(BrandUnlockMotion.Idle, model.unlockMotion.value)
            assertTrue(model.displayState.value is AirSessionState.Unlocked)
        }

    @Test
    public fun `locking during the ring cancels completion and never reopens content`(): Unit =
        runTest(dispatcher) {
            val session = FakeAccessSession.locked()
            val model = AccessViewModel(session) { testScheduler.currentTime }
            model.onPasswordChanged("anything")
            model.submitUnlock()
            advanceTimeBy(220)
            runCurrent()
            assertTrue(model.unlockMotion.value is BrandUnlockMotion.Open)
            session.move(AirSessionState.Locked)
            runCurrent()
            assertEquals(AirSessionState.Locked, model.displayState.value)
            assertEquals(BrandUnlockMotion.Idle, model.unlockMotion.value)
            advanceTimeBy(1000)
            runCurrent()
            assertEquals(AirSessionState.Locked, model.displayState.value)
        }

    private fun delayed(session: FakeAccessSession, milliseconds: Long): AccessSession =
        object : AccessSession by session {
            override suspend fun unlock(password: String): AccessOutcome {
                delay(milliseconds)
                return session.unlock(password)
            }
        }
}
