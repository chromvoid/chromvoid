package com.chromvoid.air

import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.CATALOG_WALLET_TAG
import com.chromvoid.air.ui.wallet.ACCOUNT_ISSUE_TAG
import com.chromvoid.air.ui.wallet.ADD_ACCOUNT_CONFIRM_TAG
import com.chromvoid.air.ui.wallet.RECEIVE_ADDRESS_TAG
import com.chromvoid.air.ui.wallet.RECEIVE_CLOSE_TAG
import com.chromvoid.air.ui.wallet.RECEIVE_TAG
import com.chromvoid.air.ui.wallet.SETUP_SAVE_TAG
import com.chromvoid.air.ui.wallet.SETUP_TAG
import com.chromvoid.air.ui.wallet.WALLET_ADD_ANOTHER_TAG
import com.chromvoid.air.ui.wallet.WALLET_ADD_TAG
import com.chromvoid.air.ui.wallet.WALLET_ADDRESS_TAG
import com.chromvoid.air.ui.wallet.WALLET_EMPTY_TAG
import com.chromvoid.air.ui.wallet.WALLET_NETWORK_BACK_TAG
import com.chromvoid.air.ui.wallet.WALLET_NETWORK_MENU_TAG
import com.chromvoid.air.ui.wallet.WALLET_NETWORK_RECEIVE_TAG
import com.chromvoid.air.ui.wallet.WALLET_NEW_ADDRESS_TAG
import com.chromvoid.air.ui.wallet.WalletSetupModel
import com.chromvoid.air.ui.wallet.setupFieldTag
import com.chromvoid.air.ui.wallet.walletAssetTag
import com.chromvoid.air.ui.wallet.walletSetupTag
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Routes A34 and A35 against real Core, with the wallet open as it ships: a
 * universal wallet is created from the Vault's Wallet tile, its networks are
 * listed, a network shows the address Core derived, Receive shows it as a
 * code, Bitcoin hands out a fresh address and another account, and a second
 * TON account is refused as Core refuses it for a rotation phrase.
 * Core's own lists are the proof; the live balance read is admitted by the
 * bridge whatever the network answers.
 */
@RunWith(AndroidJUnit4::class)
public class WalletRouteInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun aWalletIsCreatedItsNetworksShowTheirAddressesAndAccountsGrow() {
        val generation = unlocked()
        awaitNode(CATALOG_WALLET_TAG)
        rule.onNodeWithTag(CATALOG_WALLET_TAG).performScrollTo().performClick()
        awaitNode(WALLET_EMPTY_TAG)

        rule.onNodeWithTag(WALLET_ADD_TAG).performClick()
        awaitNode(walletSetupTag(WalletSetupModel.Intent.CREATE))
        rule.onNodeWithTag(walletSetupTag(WalletSetupModel.Intent.CREATE)).performClick()
        awaitNode(SETUP_TAG)
        rule.onNodeWithTag(setupFieldTag(WalletSetupModel.Field.LABEL)).performTextInput(LABEL)
        rule.onNodeWithTag(SETUP_SAVE_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { rule.onAllNodesWithTag(SETUP_TAG).fetchSemanticsNodes().isEmpty() }
        awaitNode(walletAssetTag("ton"))
        awaitNode(walletAssetTag("bitcoin"))

        val wallet = runBlocking { session.wallet.walletList(generation).wallets.single() }
        assertEquals(LABEL, wallet.label)
        assertEquals("hd", wallet.kind)
        assertEquals("multichain", wallet.walletMode)
        assertEquals("rotation", wallet.mnemonicStandard)
        val accounts = runBlocking { session.wallet.walletAccounts(null, generation).accounts }
        val ton = accounts.single { it.network == "ton" }
        val bitcoin = accounts.single { it.network == "bitcoin" }

        // The live balance goes through the bridge: a provider may refuse, the bridge may not.
        val balance = runBlocking { runCatching { session.wallet.walletBalance(ton.accountID, generation) } }
        assertFalse(balance.exceptionOrNull() is BridgeException.CapabilityUnavailable)

        // TON: the address Core derived, and Receive shows it.
        rule.onNodeWithTag(walletAssetTag("ton")).performClick()
        awaitNode(WALLET_ADDRESS_TAG)
        rule.onNodeWithTag(WALLET_ADDRESS_TAG).assertTextEquals(checkNotNull(ton.address))
        rule.onNodeWithTag(WALLET_NETWORK_RECEIVE_TAG).performClick()
        awaitNode(RECEIVE_TAG)
        rule.onNodeWithTag(RECEIVE_ADDRESS_TAG).assertTextEquals(checkNotNull(ton.address))
        rule.onNodeWithTag(RECEIVE_CLOSE_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { rule.onAllNodesWithTag(RECEIVE_TAG).fetchSemanticsNodes().isEmpty() }

        // Core keeps a rotation phrase to one TON account: asked for another, it says why.
        rule.onNodeWithTag(WALLET_NETWORK_MENU_TAG).performClick()
        awaitNode(WALLET_ADD_ANOTHER_TAG)
        rule.onNodeWithTag(WALLET_ADD_ANOTHER_TAG).performClick()
        awaitNode(ADD_ACCOUNT_CONFIRM_TAG)
        rule.onNodeWithTag(ADD_ACCOUNT_CONFIRM_TAG).performClick()
        awaitNode(ACCOUNT_ISSUE_TAG)
        rule.onNodeWithTag(RECEIVE_CLOSE_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            rule.onAllNodesWithTag(ACCOUNT_ISSUE_TAG).fetchSemanticsNodes().isEmpty()
        }
        assertEquals(
            1,
            runBlocking { session.wallet.walletAccounts(null, generation).accounts.count { it.network == "ton" } },
        )
        rule.onNodeWithTag(WALLET_NETWORK_BACK_TAG).performClick()

        // Bitcoin hands out a fresh address.
        awaitNode(walletAssetTag("bitcoin"))
        rule.onNodeWithTag(walletAssetTag("bitcoin")).performClick()
        awaitNode(WALLET_NEW_ADDRESS_TAG)
        rule.onNodeWithTag(WALLET_NEW_ADDRESS_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            runBlocking {
                session.wallet.walletAccounts(null, generation).accounts
                    .single { it.accountID == bitcoin.accountID }.nextReceiveIndex
            } == checkNotNull(bitcoin.nextReceiveIndex) + 1
        }
        val fresh = runBlocking {
            session.wallet.walletAccounts(null, generation).accounts.single { it.accountID == bitcoin.accountID }
        }
        assertTrue(fresh.currentReceiveAddress != bitcoin.currentReceiveAddress)
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            val address = checkNotNull(fresh.currentReceiveAddress)
            runCatching { rule.onNodeWithTag(WALLET_ADDRESS_TAG).assertTextEquals(address) }.isSuccess
        }

        // And another Bitcoin account, from the same menu.
        rule.onNodeWithTag(WALLET_NETWORK_MENU_TAG).performClick()
        awaitNode(WALLET_ADD_ANOTHER_TAG)
        rule.onNodeWithTag(WALLET_ADD_ANOTHER_TAG).performClick()
        awaitNode(ADD_ACCOUNT_CONFIRM_TAG)
        rule.onNodeWithTag(ADD_ACCOUNT_CONFIRM_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            val accounts = runBlocking { session.wallet.walletAccounts(null, generation).accounts }
            accounts.count { it.network == "bitcoin" } == 2
        }
    }

    private fun unlocked(): ULong {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        return (session.state.value as AirSessionState.Unlocked).generation
    }

    private fun awaitNode(tag: String) {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun awaitState(accept: (AirSessionState) -> Boolean) {
        val deadline = System.nanoTime() + STATE_TIMEOUT_NANOS
        while (!accept(session.state.value)) {
            check(System.nanoTime() < deadline) { "session still ${session.state.value}" }
            Thread.sleep(POLL_MILLIS)
        }
    }

    private companion object {
        const val ADMINISTRATOR = "air-instrumentation-administrator"
        const val VAULT = "air-instrumentation-vault"
        const val LABEL = "Повседневный"
        const val NODE_TIMEOUT_MILLIS = 20_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
