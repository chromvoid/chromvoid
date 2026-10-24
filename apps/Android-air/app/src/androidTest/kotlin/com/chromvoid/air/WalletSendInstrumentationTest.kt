package com.chromvoid.air

import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToKey
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.AirRuntimeClient
import com.chromvoid.air.bridge.openWalletSendFixture
import com.chromvoid.air.bridge.wire.WalletTransactionsListRequest
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.CATALOG_WALLET_TAG
import com.chromvoid.air.ui.wallet.HISTORY_TAG
import com.chromvoid.air.ui.wallet.REBROADCAST_CONFIRM_TAG
import com.chromvoid.air.ui.wallet.REBROADCAST_PASSWORD_TAG
import com.chromvoid.air.ui.wallet.REBROADCAST_TAG
import com.chromvoid.air.ui.wallet.SEND_BACK_TO_EDITING_TAG
import com.chromvoid.air.ui.wallet.SEND_CONFIRM_TAG
import com.chromvoid.air.ui.wallet.SEND_FEE_TAG
import com.chromvoid.air.ui.wallet.SEND_PASSWORD_TAG
import com.chromvoid.air.ui.wallet.SEND_QUOTE_TAG
import com.chromvoid.air.ui.wallet.SEND_RESULT_TAG
import com.chromvoid.air.ui.wallet.SEND_REVIEW_TAG
import com.chromvoid.air.ui.wallet.SEND_TAG
import com.chromvoid.air.ui.wallet.SEND_TOTAL_TAG
import com.chromvoid.air.ui.wallet.SEND_VIEW_ACTIVITY_TAG
import com.chromvoid.air.ui.wallet.SETUP_SAVE_TAG
import com.chromvoid.air.ui.wallet.SETUP_TAG
import com.chromvoid.air.ui.wallet.TRANSACTION_STATUS_TAG
import com.chromvoid.air.ui.wallet.TRANSACTION_TAG
import com.chromvoid.air.ui.wallet.WALLET_ADD_TAG
import com.chromvoid.air.ui.wallet.WALLET_SEND_TAG
import com.chromvoid.air.ui.wallet.WalletSetupModel
import com.chromvoid.air.ui.wallet.sendAddressTag
import com.chromvoid.air.ui.wallet.sendAmountTag
import com.chromvoid.air.ui.wallet.setupFieldTag
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
 * Route A36 against real Core on its offline send fixture: real wallet keys,
 * signing and journal, a synthetic TON provider with 2 TON and no network.
 * A transfer is typed with its network detected, its fee quoted, prepared,
 * cancelled back to editing, prepared again and authorized with the
 * administrative password; the fixture's first broadcast
 * has an unknown outcome, which the app says, and Activity sends the same
 * signed transaction again, which the fixture then accepts.
 */
@RunWith(AndroidJUnit4::class)
public class WalletSendInstrumentationTest {
    private val fixture: TestRule = object : ExternalResource() {
        override fun before() {
            AirAppGraph.testRuntime = { context -> AirRuntimeClient.openWalletSendFixture(context) }
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
    public fun aTransferIsReviewedAuthorizedAndItsUnknownOutcomeSentAgain() {
        val generation = unlocked()
        awaitNode(CATALOG_WALLET_TAG)
        rule.onNodeWithTag(CATALOG_WALLET_TAG).performScrollTo().performClick()
        awaitNode(WALLET_ADD_TAG)
        rule.waitForIdle()
        rule.onNodeWithTag(WALLET_ADD_TAG).performClick()
        awaitNode(walletSetupTag(WalletSetupModel.Intent.CREATE))
        rule.onNodeWithTag(walletSetupTag(WalletSetupModel.Intent.CREATE)).performClick()
        awaitNode(SETUP_TAG)
        rule.onNodeWithTag(setupFieldTag(WalletSetupModel.Field.LABEL)).performTextInput("Синтетический")
        rule.onNodeWithTag(SETUP_SAVE_TAG).performClick()
        awaitNode(walletAssetTag("ton"))
        awaitText("2 TON")

        // Send: the address names its network, Core prepares the exact transfer.
        rule.onNodeWithTag(WALLET_SEND_TAG).performClick()
        awaitNode(SEND_TAG)
        rule.onNodeWithTag(sendAddressTag(0)).performTextInput(RECIPIENT)
        awaitText("Network detected from the address: TON")
        rule.onNodeWithTag(sendAmountTag(0)).performTextInput("0.5")
        rule.onNodeWithTag(SEND_QUOTE_TAG).performScrollTo().performClick()
        awaitNode(SEND_FEE_TAG)
        rule.onNodeWithTag(SEND_FEE_TAG).assertTextContains("0.005 TON", substring = true)
        rule.onNodeWithTag(SEND_REVIEW_TAG).performScrollTo().performClick()
        awaitNode(SEND_TOTAL_TAG)
        rule.onNodeWithTag(SEND_TOTAL_TAG).assertTextContains("0.505 TON", substring = true)

        // Back to editing cancels the prepared transfer with Core; reviewing again prepares a new one.
        rule.onNodeWithTag(SEND_BACK_TO_EDITING_TAG).performScrollTo().performClick()
        awaitNode(SEND_REVIEW_TAG)
        rule.onNodeWithTag(SEND_REVIEW_TAG).performScrollTo().performClick()
        awaitNode(SEND_TOTAL_TAG)

        // Authorized with the administrative password; the first broadcast's outcome is unknown.
        rule.onNodeWithTag(SEND_PASSWORD_TAG).performScrollTo().performTextInput(ADMINISTRATOR)
        rule.onNodeWithTag(SEND_CONFIRM_TAG).performScrollTo().performClick()
        awaitNode(SEND_RESULT_TAG)
        awaitText("Transfer outcome unknown")

        // Activity lists it with its status unknown; the same signed transaction goes again.
        rule.onNodeWithTag(SEND_VIEW_ACTIVITY_TAG).performScrollTo().performClick()
        awaitNode(HISTORY_TAG)
        val entry = runBlocking {
            session.wallet.walletTransactions(
                WalletTransactionsListRequest(limit = 10),
                generation,
            ).transactions.single()
        }
        assertEquals("broadcast_unknown", entry.status)
        assertEquals(RECIPIENT, entry.counterparty)
        awaitNode(transactionTag(entry.txRef))
        rule.onNodeWithTag(transactionTag(entry.txRef)).performClick()
        awaitNode(TRANSACTION_TAG)
        rule.onNodeWithTag(TRANSACTION_TAG).performScrollToKey("rebroadcast")
        awaitNode(REBROADCAST_TAG)
        rule.onNodeWithTag(REBROADCAST_TAG).performClick()
        awaitNode(REBROADCAST_PASSWORD_TAG)
        rule.onNodeWithTag(REBROADCAST_PASSWORD_TAG).performTextInput(ADMINISTRATOR)
        rule.onNodeWithTag(REBROADCAST_CONFIRM_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            runBlocking {
                session.wallet.walletTransactions(WalletTransactionsListRequest(limit = 10), generation)
                    .transactions.single().status
            } == "pending"
        }
        rule.onNodeWithTag(TRANSACTION_TAG).performScrollToKey("summary")
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            runCatching { rule.onNodeWithTag(TRANSACTION_STATUS_TAG).assertTextContains("Pending", substring = true) }
                .isSuccess
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

    private fun awaitText(text: String) {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            rule.onAllNodes(hasText(text, substring = true), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()
        }
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
        const val RECIPIENT = "EQC-Ip06mEnUpcEN-VCDk3MIKwbnv6QhOLh4yGJHyZi0HcrD"
        const val NODE_TIMEOUT_MILLIS = 20_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
