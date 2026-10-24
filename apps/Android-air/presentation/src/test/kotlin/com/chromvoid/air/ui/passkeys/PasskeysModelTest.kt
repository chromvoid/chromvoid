package com.chromvoid.air.ui.passkeys

import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.credentials.modelScope
import java.io.IOException
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
public class PasskeysModelTest {
    private fun TestScope.passkeys(store: FakePasskeyStore): PasskeysModel =
        PasskeysModel(store, 1uL, modelScope()).also {
            it.reload()
            advanceUntilIdle()
        }

    private val PasskeysModel.now: PasskeysModel.State get() = state.value

    @Test
    public fun `the passkeys are listed and searched by website or account`(): Unit = runTest {
        val store = FakePasskeyStore()
        store.passkey("p1", "login.example.test", "alice@example.test", "Alice")
        store.passkey("p2", "docs.example.test", "bob@example.test", "Боб")

        val model = passkeys(store)

        assertEquals(PasskeysModel.Phase.READY, model.now.phase)
        assertEquals(2, model.now.matches.size)
        model.search("DOCS")
        assertEquals(listOf("p2"), model.now.matches.map { it.credentialIDB64URL })
        model.search("боб")
        assertEquals(listOf("p2"), model.now.matches.map { it.credentialIDB64URL })
        model.search("nothing")
        assertTrue(model.now.matches.isEmpty())
    }

    @Test
    public fun `a passkey is deleted only after confirming, and the list is read again`(): Unit = runTest {
        val store = FakePasskeyStore()
        store.passkey("p1", "login.example.test", "alice@example.test")
        val model = passkeys(store)

        model.requestDelete()
        assertFalse(model.now.confirmingDelete)
        model.select("p1")
        assertEquals("login.example.test", model.now.selected?.rpID)
        model.requestDelete()
        model.cancelDelete()
        assertTrue(store.calls.none { it.startsWith("delete") })

        model.requestDelete()
        model.confirmDelete()
        advanceUntilIdle()

        assertEquals("delete:p1", store.calls.first { it.startsWith("delete") })
        assertEquals(PasskeysModel.Notice.DELETED, model.now.notice)
        assertNull(model.now.selected)
        assertTrue(model.now.rows.isEmpty())
        assertEquals(PasskeysModel.Phase.READY, model.now.phase)
    }

    @Test
    public fun `a passkey gone meanwhile is said to be gone`(): Unit = runTest {
        val store = FakePasskeyStore()
        store.passkey("p1", "login.example.test", "alice@example.test")
        val model = passkeys(store)
        store.goneBeforeDelete = true

        model.select("p1")
        model.requestDelete()
        model.confirmDelete()
        advanceUntilIdle()

        assertEquals(PasskeysModel.Notice.MISSING, model.now.notice)
    }

    @Test
    public fun `a deletion Core could not confirm clears the list until it is read again`(): Unit = runTest {
        val store = FakePasskeyStore()
        store.passkey("p1", "login.example.test", "alice@example.test")
        val model = passkeys(store)
        model.select("p1")
        model.requestDelete()
        store.failNext = IOException("lost")

        model.confirmDelete()
        advanceUntilIdle()

        assertEquals(PasskeysModel.Phase.UNCERTAIN, model.now.phase)
        assertEquals(PasskeysModel.Notice.UNCERTAIN, model.now.notice)
        assertTrue(model.now.rows.isEmpty())
        model.reload()
        advanceUntilIdle()
        assertEquals(PasskeysModel.Phase.READY, model.now.phase)
        assertNull(model.now.notice)
        assertEquals(1, model.now.rows.size)
    }

    @Test
    public fun `a change elsewhere reads again, a failure offers another try, and a lock drops everything`(): Unit =
        runTest {
            val store = FakePasskeyStore()
            val model = passkeys(store)
            model.synchronize(3uL)
            advanceUntilIdle()
            assertEquals(1, store.calls.count { it == "list" })

            store.passkey("p1", "login.example.test", "alice@example.test")
            model.synchronize(4uL)
            advanceUntilIdle()
            assertEquals(1, model.now.rows.size)

            store.failNext = IOException("offline")
            model.reload()
            advanceUntilIdle()
            assertEquals(PasskeysModel.Phase.FAILED, model.now.phase)

            store.failNext = BridgeException.SessionRevoked()
            model.reload()
            advanceUntilIdle()
            assertEquals(PasskeysModel.Phase.REVOKED, model.now.phase)
            assertTrue(model.now.rows.isEmpty())
            model.reload()
            assertEquals(PasskeysModel.Phase.REVOKED, model.now.phase)
        }
}
