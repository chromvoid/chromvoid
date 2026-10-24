package com.chromvoid.air.ui.wallet

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.credentials.FakeClipboard
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
public class WalletAddressBookModelTest {
    private val clipboard = FakeClipboard()

    private fun TestScope.book(store: FakeWalletStore): WalletAddressBookModel =
        WalletAddressBookModel(store, 1uL, modelScope(), clipboard).also {
            it.updateNetworks(listOf("ton", "bitcoin"))
            it.reload()
            advanceUntilIdle()
        }

    private val WalletAddressBookModel.now: WalletAddressBookModel.State get() = state.value

    private fun WalletAddressBookModel.type(label: String, network: String?, address: String) {
        change(WalletAddressBookModel.Field.LABEL, label)
        change(WalletAddressBookModel.Field.NETWORK, network.orEmpty())
        change(WalletAddressBookModel.Field.ADDRESS, address)
    }

    @Test
    public fun `a new contact is saved by Core and the list read again`(): Unit = runTest {
        val store = FakeWalletStore()
        val model = book(store)
        assertEquals(WalletAddressBookModel.Phase.READY, model.now.phase)
        assertTrue(model.now.entries.isEmpty())

        model.add()
        model.type("Alice", "ton", "UQalice")
        model.save()
        advanceUntilIdle()

        val saved = store.contacts.single()
        assertEquals("Alice" to "ton", saved.label to saved.network)
        assertEquals(listOf(saved), model.now.entries)
        assertNull(model.now.draft)
        assertEquals(WalletAddressBookModel.Mutation.IDLE, model.now.mutation)
    }

    @Test
    public fun `a contact needs a name, an open network and an address, asked in that order`(): Unit = runTest {
        val store = FakeWalletStore()
        val model = book(store)
        model.add()

        model.save()
        assertEquals(WalletAddressBookModel.Field.LABEL, model.now.invalidField)
        model.type("Alice", "solana", "")
        model.save()
        assertEquals(WalletAddressBookModel.Field.NETWORK, model.now.invalidField)
        model.change(WalletAddressBookModel.Field.NETWORK, "ton")
        val revision = model.now.focusRevision
        model.save()
        assertEquals(WalletAddressBookModel.Field.ADDRESS, model.now.invalidField)
        assertEquals(revision + 1, model.now.focusRevision)
        assertTrue(store.calls.none { it.startsWith("contact-") })
    }

    @Test
    public fun `an address Core refuses for its network stays in the editor to fix`(): Unit = runTest {
        val store = FakeWalletStore()
        val model = book(store)
        model.add()
        model.type("Alice", "bitcoin", "UQalice")

        model.save()
        advanceUntilIdle()

        assertEquals(WalletAddressBookModel.Issue.InvalidAddress, model.now.issue)
        assertEquals(WalletAddressBookModel.Field.ADDRESS, model.now.invalidField)
        assertEquals("UQalice", model.now.draft?.address)
        assertTrue(store.contacts.isEmpty())
        model.change(WalletAddressBookModel.Field.ADDRESS, "bc1alice")
        assertNull(model.now.issue)
        model.save()
        advanceUntilIdle()
        assertEquals("bc1alice", store.contacts.single().address)
    }

    @Test
    public fun `an edit changes the contact and one deleted meanwhile is said to be gone`(): Unit = runTest {
        val store = FakeWalletStore()
        val model = book(store)
        model.add()
        model.type("Alice", "ton", "UQalice")
        model.save()
        advanceUntilIdle()
        val id = store.contacts.single().entryID

        model.edit(id)
        assertEquals("Alice", model.now.draft?.label)
        model.change(WalletAddressBookModel.Field.LABEL, "Alice (cold)")
        model.save()
        advanceUntilIdle()
        assertEquals("Alice (cold)", store.contacts.single().label)

        model.edit(id)
        store.contacts.clear()
        model.change(WalletAddressBookModel.Field.LABEL, "Alice again")
        model.save()
        advanceUntilIdle()
        assertEquals(WalletAddressBookModel.Issue.Missing, model.now.issue)
        assertNull(model.now.draft)
        assertTrue(model.now.entries.isEmpty())
    }

    @Test
    public fun `closing an editor with changes asks first`(): Unit = runTest {
        val model = book(FakeWalletStore())
        model.add()
        model.closeEditor()
        assertNull(model.now.draft)

        model.add()
        model.change(WalletAddressBookModel.Field.LABEL, "Bob")
        model.closeEditor()
        assertTrue(model.now.discardRequested)
        assertFalse(model.now.canDismiss)
        model.keepEditing()
        assertEquals("Bob", model.now.draft?.label)
        model.closeEditor()
        model.discard()
        assertNull(model.now.draft)
        assertTrue(model.now.canDismiss)
    }

    @Test
    public fun `a deletion is confirmed first and copying takes the address`(): Unit = runTest {
        val store = FakeWalletStore()
        val model = book(store)
        model.add()
        model.type("Alice", "ton", "UQalice")
        model.save()
        advanceUntilIdle()
        val id = store.contacts.single().entryID

        model.copyAddress(id)
        assertEquals("UQalice" to false, clipboard.copies.single())
        assertEquals(id, model.now.copiedId)

        model.requestDeletion(id)
        assertEquals(id, model.now.pendingDeletion?.entryID)
        model.cancelDeletion()
        assertEquals(1, store.contacts.size)
        model.requestDeletion(id)
        model.confirmDeletion()
        advanceUntilIdle()
        assertTrue(store.contacts.isEmpty())
        assertTrue(model.now.entries.isEmpty())
        assertNull(model.now.copiedId)
    }

    @Test
    public fun `a change Core could not confirm reads the list again and waits for a check`(): Unit = runTest {
        val store = FakeWalletStore()
        val model = book(store)
        model.add()
        model.type("Alice", "ton", "UQalice")
        store.contactFailure = IOException("lost")

        model.save()
        advanceUntilIdle()

        assertEquals(WalletAddressBookModel.Issue.Uncertain, model.now.issue)
        assertEquals(WalletAddressBookModel.Mutation.UNCERTAIN, model.now.mutation)
        assertNull(model.now.draft)
        assertTrue(store.calls.count { it == "contacts" } >= 2)
        model.add()
        assertNull(model.now.draft)
        model.acknowledgeReconciliation()
        assertEquals(WalletAddressBookModel.Mutation.IDLE, model.now.mutation)
        assertNull(model.now.issue)
    }

    @Test
    public fun `a refusal Core explains keeps the editor open`(): Unit = runTest {
        val store = FakeWalletStore()
        val model = book(store)
        model.add()
        model.type("Alice", "ton", "UQalice")
        store.contactFailure = CoreRefusal("ACCESS_DENIED", "wallet:addressBook:create")

        model.save()
        advanceUntilIdle()

        assertEquals(WalletAddressBookModel.Issue.Denied, model.now.issue)
        assertEquals(WalletAddressBookModel.Mutation.IDLE, model.now.mutation)
        assertEquals("Alice", model.now.draft?.label)
    }

    @Test
    public fun `a failed read offers another try and a lock drops everything`(): Unit = runTest {
        val store = FakeWalletStore()
        store.failNext = IOException("offline")
        val model = book(store)
        assertEquals(WalletAddressBookModel.Phase.FAILED, model.now.phase)
        model.reload()
        advanceUntilIdle()
        assertEquals(WalletAddressBookModel.Phase.READY, model.now.phase)

        model.add()
        store.failNext = BridgeException.SessionRevoked()
        model.reload()
        advanceUntilIdle()

        assertEquals(WalletAddressBookModel.Phase.REVOKED, model.now.phase)
        assertNull(model.now.draft)
        assertTrue(model.now.networks.isEmpty())
        model.add()
        model.reload()
        assertEquals(WalletAddressBookModel.Phase.REVOKED, model.now.phase)
    }
}
