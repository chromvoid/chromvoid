package com.chromvoid.air

import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToKey
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.AirRuntimeClient
import com.chromvoid.air.bridge.openWalletHistoryFixture
import com.chromvoid.air.bridge.wire.WalletTransactionDirection
import com.chromvoid.air.bridge.wire.WalletTransactionsListRequest
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.CATALOG_WALLET_TAG
import com.chromvoid.air.ui.wallet.HISTORY_TAG
import com.chromvoid.air.ui.wallet.SETUP_SAVE_TAG
import com.chromvoid.air.ui.wallet.SETUP_TAG
import com.chromvoid.air.ui.wallet.TRANSACTION_REFRESH_TAG
import com.chromvoid.air.ui.wallet.TRANSACTION_STATUS_TAG
import com.chromvoid.air.ui.wallet.TRANSACTION_TAG
import com.chromvoid.air.ui.wallet.WALLET_ADD_TAG
import com.chromvoid.air.ui.wallet.WALLET_NETWORK_ACTIVITY_TAG
import com.chromvoid.air.ui.wallet.WalletSetupModel
import com.chromvoid.air.ui.wallet.setupEncodingTag
import com.chromvoid.air.ui.wallet.setupFieldTag
import com.chromvoid.air.ui.wallet.setupImportNetworkTag
import com.chromvoid.air.ui.wallet.transactionTag
import com.chromvoid.air.ui.wallet.walletAssetTag
import com.chromvoid.air.ui.wallet.walletSetupTag
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.ExternalResource
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith

/**
 * Routes A34 and A35 against real Core on its offline history fixture: a
 * synthetic TON provider that answers a history of one incoming and one
 * pending outgoing transaction and confirms the outgoing one on refresh,
 * with no network. A TON private key - the synthetic vector Core's own tests
 * use - is imported as a wallet, its activity is synchronized with the
 * provider, and the pending transaction's status is refreshed to confirmed.
 */
@RunWith(AndroidJUnit4::class)
public class WalletHistoryInstrumentationTest {
    private val fixture: TestRule = object : ExternalResource() {
        override fun before() {
            AirAppGraph.testRuntime = { context -> AirRuntimeClient.openWalletHistoryFixture(context) }
        }

        override fun after() {
            AirAppGraph.testRuntime = null
        }
    }

    private val compose = createAndroidComposeRule<MainActivity>()

    @get:Rule
    public val rules: RuleChain = RuleChain.outerRule(fixture).around(compose)

    private val rule get() = compose
    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun anImportedKeysActivityIsSynchronizedAndAStatusRefreshed() {
        val generation = unlocked()
        awaitNode(CATALOG_WALLET_TAG)
        rule.onNodeWithTag(CATALOG_WALLET_TAG).performScrollTo().performClick()
        awaitNode(WALLET_ADD_TAG)
        rule.waitForIdle()

        // A TON private key becomes a wallet of its own.
        rule.onNodeWithTag(WALLET_ADD_TAG).performClick()
        awaitNode(walletSetupTag(WalletSetupModel.Intent.IMPORT_KEY))
        rule.onNodeWithTag(walletSetupTag(WalletSetupModel.Intent.IMPORT_KEY)).performClick()
        awaitNode(SETUP_TAG)
        rule.onNodeWithTag(setupImportNetworkTag(WalletSetupModel.ImportNetwork.TON)).performScrollTo().performClick()
        rule.onNodeWithTag(setupEncodingTag("hex")).performScrollTo().performClick()
        rule.onNodeWithTag(setupFieldTag(WalletSetupModel.Field.LABEL)).performScrollTo().performTextInput(LABEL)
        rule.onNodeWithTag(setupFieldTag(WalletSetupModel.Field.PRIVATE_KEY)).performScrollTo()
            .performTextInput(PRIVATE_KEY)
        rule.onNodeWithTag(SETUP_SAVE_TAG).performClick()
        awaitGone(SETUP_TAG)
        awaitNode(walletAssetTag("ton"))
        val wallet = runBlocking { session.wallet.walletList(generation).wallets.single() }
        assertEquals(listOf(LABEL, "imported"), listOf(wallet.label, wallet.kind))
        val ton = runBlocking { session.wallet.walletAccounts(null, generation).accounts.single() }
        assertEquals("ton", ton.network)

        // Its activity is synchronized with the provider: one incoming, one outgoing still pending.
        rule.onNodeWithTag(walletAssetTag("ton")).performClick()
        awaitNode(WALLET_NETWORK_ACTIVITY_TAG)
        rule.onNodeWithTag(WALLET_NETWORK_ACTIVITY_TAG).performScrollTo().performClick()
        awaitNode(HISTORY_TAG)
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { journal(generation, ton.accountID).size == 2 }
        val outgoing = journal(generation, ton.accountID).single {
            it.direction == WalletTransactionDirection.Outgoing
        }
        assertEquals("pending", outgoing.status)

        // Its status is refreshed from the provider.
        awaitNode(transactionTag(outgoing.txRef))
        rule.onNodeWithTag(transactionTag(outgoing.txRef)).performClick()
        awaitNode(TRANSACTION_TAG)
        rule.onNodeWithTag(TRANSACTION_STATUS_TAG).assertTextContains("Pending", substring = true)
        rule.onNodeWithTag(TRANSACTION_TAG).performScrollToKey("refresh")
        awaitNode(TRANSACTION_REFRESH_TAG)
        rule.onNodeWithTag(TRANSACTION_REFRESH_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            journal(generation, ton.accountID).single { it.txRef == outgoing.txRef }.status == "confirmed"
        }
        rule.onNodeWithTag(TRANSACTION_TAG).performScrollToKey("summary")
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            runCatching {
                rule.onNodeWithTag(TRANSACTION_STATUS_TAG).assertTextContains("Confirmed", substring = true)
            }.isSuccess
        }
    }

    private fun journal(generation: ULong, accountId: String) = runBlocking {
        session.wallet.walletTransactions(WalletTransactionsListRequest(accountID = accountId, limit = 10), generation)
            .transactions
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

    private fun awaitGone(tag: String) {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isEmpty() }
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
        const val LABEL = "Импортированный"

        /** The synthetic TON key Core's own air-ffi tests import; it never holds funds. */
        val PRIVATE_KEY = "01".repeat(32)
        const val NODE_TIMEOUT_MILLIS = 20_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
