package com.chromvoid.air.ui.autofill

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.ui.credentials.modelScope
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
public class AutoFillModelTest {
    private val store = FakeAutoFillStore()

    private fun TestScope.model(): AutoFillModel =
        AutoFillModel(store, generation = 7uL, scope = modelScope()).also {
            it.reload()
            advanceUntilIdle()
        }

    @Test
    public fun `the status is read under the page's generation`(): Unit = runTest {
        val model = model()

        assertEquals(AutoFillModel.Phase.READY, model.state.value.phase)
        assertEquals(AutoFillSystem.SELECTED, model.state.value.status?.system)
        assertEquals(AutoFillModel.Access.AUTHORIZED, model.state.value.access)
        assertEquals(listOf(7uL), store.generations)
    }

    @Test
    public fun `vault access says what stops a fill, the path first`(): Unit = runTest {
        val ready = AutoFillStatus(AutoFillSystem.NOT_SELECTED, providerReady = true, vaultOpen = true)
        val cases = listOf(
            ready.copy(providerReady = false, vaultOpen = false) to AutoFillModel.Access.UNAVAILABLE,
            ready.copy(vaultOpen = false) to AutoFillModel.Access.VAULT_CLOSED,
            ready to AutoFillModel.Access.AUTHORIZED,
        )
        val model = model()
        for ((status, access) in cases) {
            store.status = status
            model.reload()
            advanceUntilIdle()
            assertEquals(status.toString(), access, model.state.value.access)
        }
    }

    @Test
    public fun `a failed read offers another attempt`(): Unit = runTest {
        store.failWith = CoreRefusal("INTERNAL", "credential_provider:status")
        val model = model()
        assertEquals(AutoFillModel.Phase.FAILED, model.state.value.phase)
        assertNull(model.state.value.status)

        store.failWith = null
        model.reload()
        advanceUntilIdle()

        assertEquals(AutoFillModel.Phase.READY, model.state.value.phase)
        assertEquals(2, store.reads)
    }

    @Test
    public fun `a lock ends the page and asks Core no more`(): Unit = runTest {
        store.failWith = CoreRefusal("SESSION_REVOKED", "credential_provider:status")
        val model = model()
        assertEquals(AutoFillModel.Phase.REVOKED, model.state.value.phase)

        model.reload()
        advanceUntilIdle()
        assertEquals(1, store.reads)
    }

    @Test
    public fun `a closed page reads nothing more`(): Unit = runTest {
        val model = model()
        model.close()
        model.reload()
        advanceUntilIdle()

        assertEquals(AutoFillModel.Phase.REVOKED, model.state.value.phase)
        assertNull(model.state.value.status)
        assertEquals(1, store.reads)
    }

    @Test
    public fun `a settings screen the device lacks is said once and cleared by the next attempt`(): Unit = runTest {
        val model = model()
        model.settingsFailed()
        assertTrue(model.state.value.settingsFailed)

        model.settingsOpened()
        assertFalse(model.state.value.settingsFailed)
    }
}
