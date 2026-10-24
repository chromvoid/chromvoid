package com.chromvoid.air.ui.credentials

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class PasswordGeneratorModelTest {
    private val store = FakeCredentialStore(listOf(summary("mail", "Mail")))
    private var used: String? = null

    private fun TestScope.generator(): PasswordGeneratorModel =
        PasswordGeneratorModel(store, generation = 1uL, scope = modelScope()) { used = it }

    @Test
    public fun `a generated candidate is shown hidden and reaches the form only on use`(): Unit = runTest {
        val model = generator()

        model.generate()
        advanceUntilIdle()

        val state = model.state.value
        assertEquals("generated-20", state.password)
        assertFalse("a candidate starts hidden", state.revealed)
        assertNull("nothing reaches the form before Use", used)

        model.toggleReveal()
        assertTrue(model.state.value.revealed)

        model.use()
        assertEquals("generated-20", used)
    }

    @Test
    public fun `changing a setting drops the candidate it no longer matches`(): Unit = runTest {
        val model = generator()
        model.generate()
        advanceUntilIdle()
        model.toggleReveal()

        model.change { it.copy(length = 32) }

        val state = model.state.value
        assertNull("the candidate was made under the old settings", state.password)
        assertFalse(state.revealed)

        model.generate()
        advanceUntilIdle()
        assertEquals("generated-32", model.state.value.password)
    }

    @Test
    public fun `the length stays within the range Core accepts`(): Unit = runTest {
        val model = generator()

        model.change { it.copy(length = 1) }
        assertEquals(PasswordGeneratorModel.MIN_LENGTH, model.state.value.settings.length)

        model.change { it.copy(length = 1_000) }
        assertEquals(PasswordGeneratorModel.MAX_LENGTH, model.state.value.settings.length)
    }

    @Test
    public fun `no character type is explained instead of asking Core`(): Unit = runTest {
        val model = generator()
        model.change { it.copy(lowercase = false, uppercase = false, digits = false, symbols = false) }

        model.generate()
        advanceUntilIdle()

        assertEquals(PasswordGeneratorModel.Issue.NO_TYPES, model.state.value.issue)
        assertNull(model.state.value.password)
        assertEquals(0, store.generatedPasswords)
    }

    @Test
    public fun `using nothing asks for a password instead of clearing the field`(): Unit = runTest {
        val model = generator()

        model.use()

        assertEquals(PasswordGeneratorModel.Issue.NOTHING_TO_USE, model.state.value.issue)
        assertNull(used)
    }

    @Test
    public fun `a refused length is explained and the sheet stays usable`(): Unit = runTest {
        val model = generator()
        store.failWith = CoreRefusal("INVALID_INPUT", "passmanager:password:generate")

        model.generate()
        advanceUntilIdle()

        assertEquals(PasswordGeneratorModel.Issue.INVALID, model.state.value.issue)
        assertEquals(PasswordGeneratorModel.Status.READY, model.state.value.status)
    }

    @Test
    public fun `a revoked session leaves no candidate`(): Unit = runTest {
        val model = generator()
        model.generate()
        advanceUntilIdle()
        store.failWith = CoreRefusal("SESSION_REVOKED", "passmanager:password:generate")

        model.generate()
        advanceUntilIdle()

        val state = model.state.value
        assertEquals(PasswordGeneratorModel.Status.REVOKED, state.status)
        assertNull(state.password)
        assertNull(used)
    }
}
