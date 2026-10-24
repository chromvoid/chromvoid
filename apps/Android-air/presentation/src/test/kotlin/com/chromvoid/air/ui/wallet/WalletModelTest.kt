package com.chromvoid.air.ui.wallet

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.wire.WalletProviderStatus
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
public class WalletModelTest {
    private val clipboard = FakeClipboard()

    private fun TestScope.wallet(store: FakeWalletStore): WalletModel =
        WalletModel(store, 1uL, modelScope(), clipboard).also {
            it.reload()
            advanceUntilIdle()
        }

    private val WalletModel.now: WalletModel.State get() = state.value

    @Test
    public fun `the wallets load with their networks in order and live balances`(): Unit = runTest {
        val store = FakeWalletStore()
        val main = store.wallet("Main", listOf("bitcoin", "ton"))
        val ton = store.accounts.first { it.network == "ton" }
        store.live[ton.accountID] = "1500000000"

        val model = wallet(store)

        val state = model.now
        assertEquals(WalletModel.Phase.READY, state.phase)
        assertEquals(main.walletID, state.selectedWalletId)
        assertEquals(listOf("ton", "bitcoin"), state.walletAccounts.map { it.network })
        assertEquals(ton.accountID, state.selectedAccountId)
        assertEquals("1.5 TON", state.formattedBalance(ton))
        assertEquals("0 BTC", state.formattedBalance(state.walletAccounts[1]))
        assertTrue(state.balanceLoading.isEmpty())
    }

    @Test
    public fun `a failed balance keeps the cached value, and a newer one never loses to an older`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("ton"))
        val ton = store.accounts.single()
        store.live[ton.accountID] = "2000000000"
        val model = wallet(store)
        assertEquals("2 TON", model.now.formattedBalance(ton))

        store.balanceFailures[ton.accountID] = CoreRefusal("PROVIDER_UNAVAILABLE", "wallet:balance:get")
        model.refreshBalances()
        advanceUntilIdle()

        assertEquals("2 TON", model.now.formattedBalance(ton))
        assertTrue(model.now.balanceLoading.isEmpty())
    }

    @Test
    public fun `no balance is read from a network whose provider is down or still discovering`(): Unit = runTest {
        val store = FakeWalletStore()
        val down = store.ready("bitcoin").copy(providerStatus = WalletProviderStatus.Unavailable)
        store.networks = listOf(store.ready("ton"), down)
        store.wallet("Main", listOf("ton", "bitcoin"))

        wallet(store)

        assertEquals(1, store.calls.count { it.startsWith("balance:") })
    }

    @Test
    public fun `a restored wallet scans each pending network once, then reads again`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("Restored", listOf("ton", "ethereum"), discovery = listOf("ethereum"))

        val model = wallet(store)

        assertEquals(1, store.calls.count { it.startsWith("discover:") })
        assertTrue(store.wallets.single().accountDiscoveryPending.orEmpty().isEmpty())
        assertNull(model.now.discoveringWalletId)
        model.reload()
        advanceUntilIdle()
        assertEquals(1, store.calls.count { it.startsWith("discover:") })
    }

    @Test
    public fun `choosing another card selects that wallet and its first network`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("First", listOf("ton"))
        val second = store.wallet("Second", listOf("bitcoin", "ethereum"))
        val model = wallet(store)

        model.selectWallet(second.walletID)
        advanceUntilIdle()

        assertEquals(second.walletID, model.now.selectedWalletId)
        assertEquals("bitcoin", model.now.selectedAccount?.network)
    }

    @Test
    public fun `receive shows one account's address, switches networks and copies it`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("ton", "bitcoin"))
        val model = wallet(store)
        val bitcoin = model.now.walletAccounts.first { it.network == "bitcoin" }

        model.openReceive()
        assertEquals("ton", model.now.receivingAccount?.network)
        model.switchReceivingAccount(bitcoin.accountID)
        assertEquals(bitcoin.accountID, model.now.selectedAccountId)
        assertEquals(bitcoin.currentReceiveAddress, model.now.receivingAddress)
        assertTrue(model.now.canDeriveReceiveAddress)

        model.copyReceivingAddress()
        assertEquals(bitcoin.currentReceiveAddress, clipboard.copies.last().first)
        assertTrue(model.now.addressCopied)

        model.closeAccountRoute()
        assertNull(model.now.presentation)
        assertFalse(model.now.addressCopied)
    }

    @Test
    public fun `a Bitcoin account hands out a fresh address and reads the catalog again`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("bitcoin"))
        val model = wallet(store)
        val bitcoin = model.now.walletAccounts.single()

        model.generateReceivingAddress(bitcoin.accountID)
        assertEquals(WalletModel.AccountState.WORKING, model.now.accountState)
        advanceUntilIdle()

        assertEquals(WalletModel.AccountState.IDLE, model.now.accountState)
        assertEquals("bc1-${bitcoin.accountID}-receive-1", model.now.address(model.now.walletAccounts.single()))
    }

    @Test
    public fun `another account is added on a chosen network of a multichain wallet`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("ton"))
        val model = wallet(store)

        model.openAddAccount()
        model.addAccount()
        assertEquals(WalletModel.AccountIssue.CHOOSE_NETWORK, model.now.accountIssue)

        model.chooseAccountNetwork("ethereum")
        model.addAccount()
        advanceUntilIdle()

        assertNull(model.now.presentation)
        assertEquals("ethereum", model.now.selectedAccount?.network)
        assertEquals(listOf("ton", "ethereum"), model.now.walletAccounts.map { it.network })
    }

    @Test
    public fun `an imported key's wallet cannot grow accounts`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("Key", listOf("ton"), kind = "imported", mode = "imported")
        val model = wallet(store)

        model.openAddAccount()

        assertNull(model.now.presentation)
        assertTrue(model.now.derivableNetworks(model.now.selectedWallet).isEmpty())
    }

    @Test
    public fun `an account change Core could not confirm asks for a check`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("bitcoin"))
        val model = wallet(store)
        val bitcoin = model.now.walletAccounts.single()

        store.failNext = java.io.IOException("lost")
        model.generateReceivingAddress(bitcoin.accountID)
        advanceUntilIdle()

        assertEquals(WalletModel.AccountState.UNCERTAIN, model.now.accountState)
        assertEquals(WalletModel.AccountIssue.UNCERTAIN, model.now.accountIssue)
        model.acknowledgeReconciliation()
        assertEquals(WalletModel.AccountState.IDLE, model.now.accountState)
    }

    @Test
    public fun `the network screen opens for an account and closes when it is gone`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("ton", "bitcoin"))
        val model = wallet(store)
        val bitcoin = model.now.walletAccounts[1]

        model.openNetwork(bitcoin.accountID)
        assertEquals(bitcoin.accountID, model.now.networkAccountId)
        assertEquals(bitcoin.accountID, model.now.selectedAccountId)

        model.copyAddress(bitcoin.accountID)
        assertTrue(model.now.addressCopied)

        store.accounts.removeAll { it.accountID == bitcoin.accountID }
        model.reload()
        advanceUntilIdle()
        assertNull(model.now.networkAccountId)
    }

    @Test
    public fun `a disabled wallet runtime offers nothing to add or read`(): Unit = runTest {
        val store = FakeWalletStore(enabled = false)
        store.wallet("Main", listOf("ton"))
        val model = wallet(store)

        model.beginSetup(WalletSetupModel.Intent.CREATE)

        assertFalse(model.now.walletsEnabled)
        assertNull(model.now.presentation)
        assertTrue(store.calls.none { it.startsWith("balance:") })
    }

    @Test
    public fun `a lock drops every wallet and takes back what was copied`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("ton"))
        val model = wallet(store)
        model.beginSetup(WalletSetupModel.Intent.CREATE)
        val setup = model.now.setup!!

        store.failNext = BridgeException.SessionRevoked()
        model.reload()
        advanceUntilIdle()

        assertEquals(WalletModel.Phase.REVOKED, model.now.phase)
        assertTrue(model.now.wallets.isEmpty())
        assertEquals(WalletSetupModel.Phase.REVOKED, setup.state.value.phase)
        assertTrue(clipboard.clears > 0)
    }

    @Test
    public fun `send starts from a network that can transfer and a sent transfer shows its activity`(): Unit = runTest {
        val store = FakeWalletStore()
        store.networks = listOf(store.ready("ton"), store.ready("bitcoin").copy(broadcastEnabled = false))
        store.wallet("Main", listOf("bitcoin", "ton"))
        val model = wallet(store)
        model.selectAccount(model.now.walletAccounts.first { it.network == "bitcoin" }.accountID)
        assertEquals("ton", model.now.sendableAccount?.network)

        model.openSend()
        val send = model.now.send!!
        assertEquals("ton", send.state.value.network.network)
        val id = send.state.value.recipients.first().id
        send.change(WalletSendModel.Field.Address(id), "UQpeer")
        send.change(WalletSendModel.Field.Amount(id), "1")
        send.prepare()
        advanceUntilIdle()
        send.change(WalletSendModel.Field.Password, "admin")
        send.confirm()
        advanceUntilIdle()

        model.showSendHistory()
        advanceUntilIdle()
        assertNull(model.now.presentation)
        assertTrue(model.now.historyShown)
        assertEquals("ton", model.now.history?.network)
        assertEquals(listOf("tx1"), model.now.history?.state?.value?.entries?.map { it.txRef })
        model.closeHistory()
        assertFalse(model.now.historyShown)
    }

    @Test
    public fun `each account keeps its activity, and another account's is never the one shown`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("ton", "bitcoin"))
        val model = wallet(store)
        val tonHistory = model.now.history
        model.openHistory()
        assertTrue(model.now.historyShown)
        model.closeHistory()

        model.selectAccount(model.now.walletAccounts[1].accountID)
        assertEquals("bitcoin", model.now.history?.network)
        model.selectAccount(model.now.walletAccounts[0].accountID)
        assertTrue(model.now.history === tonHistory)
    }

    @Test
    public fun `no network that can transfer means no send`(): Unit = runTest {
        val store = FakeWalletStore()
        store.networks = store.networks.map { it.copy(broadcastEnabled = false) }
        store.wallet("Main", listOf("ton"))
        val model = wallet(store)

        model.openSend()

        assertFalse(model.now.canSend)
        assertNull(model.now.presentation)
    }

    @Test
    public fun `the contacts open over a ready wallet, keep its networks and close only when nothing is open`(): Unit =
        runTest {
            val store = FakeWalletStore()
            store.networks = listOf(store.ready("ton"), store.ready("bitcoin").copy(enabled = false))
            store.wallet("Main", listOf("ton"))
            val model = wallet(store)

            model.openAddressBook()
            advanceUntilIdle()
            assertTrue(model.now.contactsShown)
            val book = model.addressBook
            assertEquals(listOf("ton"), book.state.value.networks)
            assertEquals(WalletAddressBookModel.Phase.READY, book.state.value.phase)

            book.add()
            model.closeAddressBook()
            assertTrue(model.now.contactsShown)
            book.closeEditor()
            model.closeAddressBook()
            assertNull(model.now.presentation)
        }

    @Test
    public fun `send reads the contacts so a recipient can be one`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("ton", "bitcoin"))
        store.contacts += com.chromvoid.air.bridge.wire.WalletAddressBookEntry("UQalice", 1, "c1", "Alice", "ton", 1)
        store.contacts += com.chromvoid.air.bridge.wire.WalletAddressBookEntry("bc1bob", 1, "c2", "Bob", "bitcoin", 1)
        val model = wallet(store)

        model.openSend()
        advanceUntilIdle()

        val send = model.now.send!!
        val offered = send.state.value.contacts(model.addressBook.state.value.entries)
        assertEquals(listOf("Alice"), offered.map { it.label })
        val recipient = send.state.value.recipients.first().id
        send.chooseContact(store.contacts[1], recipient)
        assertEquals("", send.state.value.value(WalletSendModel.Field.Address(recipient)))
        send.chooseContact(offered.single(), recipient)
        assertEquals("UQalice", send.state.value.value(WalletSendModel.Field.Address(recipient)))
    }

    @Test
    public fun `an HD wallet's recovery opens with its rotating TON account, an imported key's does not`(): Unit =
        runTest {
            val store = FakeWalletStore()
            val main = store.wallet("Main", listOf("ton", "bitcoin"))
            store.wallet("Key", listOf("ton"), kind = "imported", mode = "imported")
            val index = store.accounts.indexOfFirst { it.walletID == main.walletID && it.network == "ton" }
            store.accounts[index] = store.accounts[index].copy(mnemonicStandard = "rotation")
            val model = wallet(store)

            assertTrue(model.now.canRecover)
            model.openRecovery()
            val recovery = model.now.recovery!!
            assertEquals(main.walletID, recovery.walletId)
            assertEquals(store.accounts[index].accountID, recovery.tonAccountId)
            recovery.changePassword(store.adminPassword)
            recovery.reveal()
            advanceUntilIdle()
            assertEquals(WalletRecoveryModel.Phase.REVEALED, recovery.state.value.phase)

            model.coverSensitiveValues()
            assertNull(recovery.state.value.recovery)
            model.closeRecovery()
            assertEquals(WalletRecoveryModel.Phase.REVOKED, recovery.state.value.phase)

            model.selectWallet(store.wallets[1].walletID)
            assertFalse(model.now.canRecover)
            model.openRecovery()
            assertNull(model.now.presentation)
        }

    @Test
    public fun `a recovery whose wallet is gone closes, and a lock drops the contacts too`(): Unit = runTest {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("ton"))
        val model = wallet(store)
        model.openRecovery()
        val recovery = model.now.recovery!!

        store.wallets.clear()
        store.accounts.clear()
        model.reload()
        advanceUntilIdle()
        assertNull(model.now.presentation)
        assertEquals(WalletRecoveryModel.Phase.REVOKED, recovery.state.value.phase)

        store.failNext = BridgeException.SessionRevoked()
        model.reload()
        advanceUntilIdle()
        assertEquals(WalletAddressBookModel.Phase.REVOKED, model.addressBook.state.value.phase)
    }

    @Test
    public fun `a failed read offers another try`(): Unit = runTest {
        val store = FakeWalletStore()
        store.failNext = java.io.IOException("offline")
        val model = wallet(store)
        assertEquals(WalletModel.Phase.FAILED, model.now.phase)

        model.reload()
        advanceUntilIdle()
        assertEquals(WalletModel.Phase.READY, model.now.phase)
    }
}
