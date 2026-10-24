package com.chromvoid.air.ui.wallet

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.wire.WalletStatusResponse
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.credentials.FakeClipboard
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
public class WalletHistoryModelTest {
    private val store = FakeWalletStore().apply { wallet("Main", listOf("ton", "bitcoin")) }
    private val ton = store.accounts.first { it.network == "ton" }
    private val clipboard = FakeClipboard()

    private fun TestScope.history(network: String = "ton"): WalletHistoryModel {
        val account = store.accounts.first { it.network == network }
        return WalletHistoryModel(
            account.walletID,
            account.accountID,
            network,
            store,
            1uL,
            modelScope(),
            clipboard,
        ).also {
            it.updateAvailability(
                WalletStatusResponse(enabled = true, initialized = true, networks = store.networks, walletCount = 1),
            )
        }
    }

    private val WalletHistoryModel.now: WalletHistoryModel.State get() = state.value

    @Test
    public fun `TON activity reads the journal, syncs with the network and reads again`(): Unit = runTest {
        store.journal += store.entry(ton, "tx1")
        val model = history()

        model.loadIfNeeded()
        advanceUntilIdle()

        assertEquals(WalletHistoryModel.Phase.READY, model.now.phase)
        assertEquals(listOf("tx1"), model.now.entries.map { it.txRef })
        assertEquals(1, store.syncs)
        assertEquals(2, store.calls.count { it.startsWith("transactions:") })
    }

    @Test
    public fun `other networks show the saved journal without a sync, page by page`(): Unit = runTest {
        val bitcoin = store.accounts.first { it.network == "bitcoin" }
        repeat(3) { store.journal += store.entry(bitcoin, "b$it") }
        store.pageSize = 2
        val model = history("bitcoin")

        model.reload()
        advanceUntilIdle()
        assertFalse(model.canSynchronize)
        assertEquals(listOf("b0", "b1"), model.now.entries.map { it.txRef })

        model.loadMore()
        advanceUntilIdle()
        assertEquals(listOf("b0", "b1", "b2"), model.now.entries.map { it.txRef })
        assertNull(model.now.nextCursor)
        assertEquals(0, store.syncs)
    }

    @Test
    public fun `a transaction opens, copies its reference and refreshes its status`(): Unit = runTest {
        store.journal += store.entry(ton, "tx1", status = "pending")
        val model = history()
        model.reload()
        advanceUntilIdle()

        model.open("tx1")
        model.copy(WalletHistoryModel.CopyField.REFERENCE)
        assertEquals("tx1", clipboard.copies.last().first)
        store.refreshStatus = "confirmed"
        model.refreshSelected()
        advanceUntilIdle()

        assertEquals("confirmed", model.now.selected?.status)
        assertEquals("confirmed", model.now.entries.single().status)
        model.closeDetail()
        assertNull(model.now.selected)
    }

    @Test
    public fun `an unconfirmed broadcast is sent again after the administrative password`(): Unit = runTest {
        store.journal += store.entry(ton, "tx1", status = "broadcast_unknown")
        val model = history()
        model.reload()
        advanceUntilIdle()
        model.open("tx1")
        assertTrue(model.canOfferRebroadcast)
        assertTrue(model.canRebroadcast)

        model.beginRebroadcast()
        model.confirmRebroadcast()
        assertEquals(WalletHistoryModel.Issue.PASSWORD_REQUIRED, model.now.issue)
        model.changeRebroadcastPassword("wrong")
        model.confirmRebroadcast()
        advanceUntilIdle()
        assertEquals(WalletHistoryModel.Issue.REAUTHENTICATION, model.now.issue)
        assertTrue(model.now.reviewingRebroadcast)

        model.changeRebroadcastPassword("admin")
        model.confirmRebroadcast()
        assertEquals("", model.now.rebroadcastPassword)
        advanceUntilIdle()
        assertFalse(model.now.reviewingRebroadcast)
        assertEquals("pending", model.now.selected?.status)
        assertFalse(model.canOfferRebroadcast)
    }

    @Test
    public fun `a rebroadcast whose outcome is unknown must be refreshed before another`(): Unit = runTest {
        store.journal += store.entry(ton, "tx1", status = "broadcast_unknown")
        store.rebroadcastStatus = "broadcast_unknown"
        val model = history()
        model.reload()
        advanceUntilIdle()
        model.open("tx1")
        model.beginRebroadcast()
        model.changeRebroadcastPassword("admin")
        model.confirmRebroadcast()
        advanceUntilIdle()

        assertEquals(WalletHistoryModel.Issue.REBROADCAST_UNKNOWN, model.now.issue)
        assertTrue(model.requiresRebroadcastRefresh)
        assertFalse(model.canRebroadcast)
        model.refreshSelected()
        advanceUntilIdle()
        assertFalse(model.requiresRebroadcastRefresh)
    }

    @Test
    public fun `a failed read says so, a provider outage says the journal is still there`(): Unit = runTest {
        val model = history()
        store.failNext = java.io.IOException("offline")
        model.reload()
        advanceUntilIdle()
        assertEquals(WalletHistoryModel.Phase.FAILED, model.now.phase)
        assertEquals(WalletHistoryModel.Issue.LOAD, model.now.issue)

        store.failNext = CoreRefusal("PROVIDER_UNAVAILABLE", "wallet:transactions:list")
        model.reload()
        advanceUntilIdle()
        assertEquals(WalletHistoryModel.Issue.UNAVAILABLE, model.now.issue)
    }

    @Test
    public fun `a lock drops the journal and the password`(): Unit = runTest {
        store.journal += store.entry(ton, "tx1", status = "broadcast_unknown")
        val model = history()
        model.reload()
        advanceUntilIdle()
        model.open("tx1")
        model.beginRebroadcast()
        model.changeRebroadcastPassword("admin")

        store.failNext = BridgeException.SessionRevoked()
        model.closeDetail()
        model.reload()
        advanceUntilIdle()

        assertEquals(WalletHistoryModel.Phase.REVOKED, model.now.phase)
        assertTrue(model.now.entries.isEmpty())
        assertEquals("", model.now.rebroadcastPassword)
    }
}
