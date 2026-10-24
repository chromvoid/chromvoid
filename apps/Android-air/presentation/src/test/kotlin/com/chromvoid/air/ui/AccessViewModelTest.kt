package com.chromvoid.air.ui

import com.chromvoid.air.ui.access.AccessField
import com.chromvoid.air.ui.access.AccessViewModel
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

public class AccessViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @Before
    public fun setUp(): Unit = Dispatchers.setMain(dispatcher)

    @After
    public fun tearDown(): Unit = Dispatchers.resetMain()

    @Test
    public fun `an empty submit keeps the draft and points at the password field`(): Unit =
        runTest(dispatcher) {
            val model = AccessViewModel(FakeAccessSession.locked())
            model.submitUnlock()
            testScheduler.advanceUntilIdle()

            val form = model.form.value
            assertEquals(AccessField.PASSWORD, form.invalidField)
            assertTrue("the form should not stay busy", !form.submitting)
        }

    @Test
    public fun `a mismatched confirmation points at the confirmation field`(): Unit =
        runTest(dispatcher) {
            val model = AccessViewModel(FakeAccessSession.firstRun())
            model.onPasswordChanged("first")
            model.onConfirmationChanged("second")
            model.submitAdministrator()
            testScheduler.advanceUntilIdle()

            assertEquals(AccessField.CONFIRMATION, model.form.value.invalidField)
        }

    @Test
    public fun `a refusal clears the password and associates its explanation with that field`(): Unit =
        runTest(dispatcher) {
            val model = AccessViewModel(FakeAccessSession.refusing("vault_locked"))
            model.onPasswordChanged("anything")
            model.submitUnlock()
            testScheduler.advanceUntilIdle()

            val form = model.form.value
            assertEquals("", form.password)
            assertEquals("vault_locked", form.refusalCode)
            assertEquals(AccessField.PASSWORD, form.invalidField)
        }

    @Test
    public fun `an accepted password leaves nothing behind in the form`(): Unit =
        runTest(dispatcher) {
            val model = AccessViewModel(FakeAccessSession.locked())
            model.onPasswordChanged("anything")
            model.submitUnlock()
            testScheduler.advanceUntilIdle()

            assertEquals(AccessFormExpectation.EMPTY, AccessFormExpectation.of(model))
        }
}

/** Keeps the "nothing is left behind" assertion readable. */
internal enum class AccessFormExpectation {
    EMPTY,
    RETAINED,
    ;

    companion object {
        fun of(model: AccessViewModel): AccessFormExpectation {
            val form = model.form.value
            val empty = form.password.isEmpty() &&
                form.confirmation.isEmpty() &&
                form.problem == null &&
                form.refusalCode == null
            return if (empty) EMPTY else RETAINED
        }
    }
}
