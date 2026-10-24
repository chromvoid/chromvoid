package com.chromvoid.air

import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performScrollToKey
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.bridge.AirRuntimeClient
import com.chromvoid.air.bridge.openWalletSendFixture
import com.chromvoid.air.bridge.wire.WalletBackupExportRequest
import com.chromvoid.air.bridge.wire.WalletFeePolicy
import com.chromvoid.air.bridge.wire.WalletFeeTier
import com.chromvoid.air.bridge.wire.WalletTransactionConfirmRequest
import com.chromvoid.air.bridge.wire.WalletTransactionOutput
import com.chromvoid.air.bridge.wire.WalletTransactionPrepareRequest
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.CATALOG_WALLET_TAG
import com.chromvoid.air.ui.wallet.CONTACTS_ADD_TAG
import com.chromvoid.air.ui.wallet.CONTACTS_DONE_TAG
import com.chromvoid.air.ui.wallet.CONTACTS_EMPTY_TAG
import com.chromvoid.air.ui.wallet.CONTACTS_TAG
import com.chromvoid.air.ui.wallet.CONTACT_DELETE_CONFIRM_TAG
import com.chromvoid.air.ui.wallet.CONTACT_DELETE_TAG
import com.chromvoid.air.ui.wallet.CONTACT_EDITOR_TAG
import com.chromvoid.air.ui.wallet.CONTACT_ISSUE_TAG
import com.chromvoid.air.ui.wallet.CONTACT_SAVE_TAG
import com.chromvoid.air.ui.wallet.RECOVERY_CLOSE_TAG
import com.chromvoid.air.ui.wallet.RECOVERY_HIDE_TAG
import com.chromvoid.air.ui.wallet.RECOVERY_ISSUE_TAG
import com.chromvoid.air.ui.wallet.RECOVERY_LIST_TAG
import com.chromvoid.air.ui.wallet.RECOVERY_PASSWORD_TAG
import com.chromvoid.air.ui.wallet.RECOVERY_ROTATE_TAG
import com.chromvoid.air.ui.wallet.RECOVERY_ROTATION_TAG
import com.chromvoid.air.ui.wallet.RECOVERY_SHOW_TAG
import com.chromvoid.air.ui.wallet.RECOVERY_TAG
import com.chromvoid.air.ui.wallet.SEND_CLOSE_TAG
import com.chromvoid.air.ui.wallet.SEND_DISCARD_TAG
import com.chromvoid.air.ui.wallet.SEND_TAG
import com.chromvoid.air.ui.wallet.SETUP_SAVE_TAG
import com.chromvoid.air.ui.wallet.SETUP_TAG
import com.chromvoid.air.ui.wallet.WALLET_ADD_TAG
import com.chromvoid.air.ui.wallet.WALLET_CONTACTS_TAG
import com.chromvoid.air.ui.wallet.WALLET_EXPORT_TAG
import com.chromvoid.air.ui.wallet.WALLET_SEND_TAG
import com.chromvoid.air.ui.wallet.WalletAddressBookModel
import com.chromvoid.air.ui.wallet.WalletSetupModel
import com.chromvoid.air.ui.wallet.contactFieldTag
import com.chromvoid.air.ui.wallet.contactMenuTag
import com.chromvoid.air.ui.wallet.contactNetworkTag
import com.chromvoid.air.ui.wallet.contactTag
import com.chromvoid.air.ui.wallet.recoveryWordTag
import com.chromvoid.air.ui.wallet.sendAddressTag
import com.chromvoid.air.ui.wallet.sendContactOptionTag
import com.chromvoid.air.ui.wallet.sendContactTag
import com.chromvoid.air.ui.wallet.setupFieldTag
import com.chromvoid.air.ui.wallet.walletAssetTag
import com.chromvoid.air.ui.wallet.walletSetupTag
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.ExternalResource
import org.junit.rules.RuleChain
import org.junit.rules.TestRule
import org.junit.runner.RunWith

/**
 * Route A37 against real Core on its offline send fixture: real wallet keys,
 * contacts and recovery, a synthetic TON provider and no network. A contact
 * is refused for an address that is not TON's, saved, renamed, offered to a
 * transfer and deleted. The recovery phrase is refused to a wrong password
 * and shown as Core exports it. The fixture's first broadcast has an unknown
 * outcome, so a transfer sent straight through the store takes that one; the
 * signing-key rotation after it is accepted, keeps the first 12 words and
 * adds 12 more, and a second rotation is refused while the first is pending.
 */
@RunWith(AndroidJUnit4::class)
public class WalletRecoveryInstrumentationTest {
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
    public fun contactsAreKeptOfferedToTransfersAndThePhraseShownAndRotated() {
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
        val wallet = runBlocking { session.wallet.walletList(generation).wallets.single() }
        val ton = runBlocking {
            session.wallet.walletAccounts(null, generation).accounts.single { it.network == "ton" }
        }

        // A contact: Core refuses a Bitcoin address for TON, then keeps a TON one.
        rule.onNodeWithTag(WALLET_CONTACTS_TAG).performClick()
        awaitNode(CONTACTS_EMPTY_TAG)
        rule.onNodeWithTag(CONTACTS_ADD_TAG).performClick()
        awaitNode(CONTACT_EDITOR_TAG)
        rule.onNodeWithTag(contactFieldTag(WalletAddressBookModel.Field.LABEL)).performTextInput("Анна")
        rule.onNodeWithTag(contactNetworkTag("ton")).performClick()
        rule.onNodeWithTag(contactFieldTag(WalletAddressBookModel.Field.ADDRESS)).performTextInput(BITCOIN_ADDRESS)
        rule.onNodeWithTag(CONTACT_SAVE_TAG).performClick()
        awaitNode(CONTACT_ISSUE_TAG)
        awaitText("This address is not valid for the selected network.")
        assertTrue(runBlocking { session.wallet.walletContacts(generation).entries }.isEmpty())
        rule.onNodeWithTag(contactFieldTag(WalletAddressBookModel.Field.ADDRESS)).performTextClearance()
        rule.onNodeWithTag(contactFieldTag(WalletAddressBookModel.Field.ADDRESS)).performTextInput(RECIPIENT)
        rule.onNodeWithTag(CONTACT_SAVE_TAG).performClick()
        awaitGone(CONTACT_EDITOR_TAG)
        val saved = runBlocking { session.wallet.walletContacts(generation).entries.single() }
        assertEquals(listOf("Анна", "ton", RECIPIENT), listOf(saved.label, saved.network, saved.address))

        // Renamed from its row.
        awaitNode(contactTag(saved.entryID))
        rule.onNodeWithTag(contactTag(saved.entryID)).performClick()
        awaitNode(CONTACT_EDITOR_TAG)
        val label = rule.onNodeWithTag(contactFieldTag(WalletAddressBookModel.Field.LABEL))
        label.performTextClearance()
        label.performTextInput(RENAMED)
        rule.onNodeWithTag(CONTACT_SAVE_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            runBlocking { session.wallet.walletContacts(generation).entries.single().label } == RENAMED
        }
        awaitGone(CONTACT_EDITOR_TAG)
        rule.onNodeWithTag(CONTACTS_DONE_TAG).performClick()
        awaitGone(CONTACTS_TAG)

        // A transfer's recipient can be the contact.
        rule.onNodeWithTag(WALLET_SEND_TAG).performClick()
        awaitNode(SEND_TAG)
        awaitNode(sendContactTag(0))
        rule.onNodeWithTag(sendContactTag(0)).performScrollTo().performClick()
        awaitNode(sendContactOptionTag(saved.entryID))
        rule.onNodeWithTag(sendContactOptionTag(saved.entryID)).performClick()
        rule.onNodeWithTag(sendAddressTag(0)).performScrollTo().assertTextEquals(RECIPIENT)
        awaitText("Network detected from the address: TON")
        rule.onNodeWithTag(SEND_CLOSE_TAG).performClick()
        awaitNode(SEND_DISCARD_TAG)
        rule.onNodeWithTag(SEND_DISCARD_TAG).performClick()
        awaitGone(SEND_TAG)

        // And deleted from its menu.
        rule.onNodeWithTag(WALLET_CONTACTS_TAG).performClick()
        awaitNode(contactMenuTag(saved.entryID))
        rule.onNodeWithTag(contactMenuTag(saved.entryID)).performClick()
        awaitNode(CONTACT_DELETE_TAG)
        rule.onNodeWithTag(CONTACT_DELETE_TAG).performClick()
        awaitNode(CONTACT_DELETE_CONFIRM_TAG)
        rule.onNodeWithTag(CONTACT_DELETE_CONFIRM_TAG).performClick()
        awaitNode(CONTACTS_EMPTY_TAG)
        assertTrue(runBlocking { session.wallet.walletContacts(generation).entries }.isEmpty())
        rule.onNodeWithTag(CONTACTS_DONE_TAG).performClick()
        awaitGone(CONTACTS_TAG)

        // Recovery: a wrong password is refused, the right one shows Core's phrase.
        rule.onNodeWithTag(WALLET_EXPORT_TAG).performScrollTo().performClick()
        awaitNode(RECOVERY_TAG)
        rule.onNodeWithTag(RECOVERY_PASSWORD_TAG).performTextInput("not-the-administrator")
        rule.onNodeWithTag(RECOVERY_SHOW_TAG).performClick()
        awaitNode(RECOVERY_ISSUE_TAG)
        awaitText("The administrative password could not authorize recovery access.")
        val phrase = runBlocking {
            session.wallet.exportWalletRecovery(WalletBackupExportRequest(ADMINISTRATOR, wallet.walletID), generation)
        }
        assertEquals("rotation", phrase.mnemonicStandard)
        assertEquals(12, phrase.mnemonic.size)
        rule.onNodeWithTag(RECOVERY_PASSWORD_TAG).performTextInput(ADMINISTRATOR)
        rule.onNodeWithTag(RECOVERY_SHOW_TAG).performClick()
        awaitNode(recoveryWordTag(12))
        phrase.mnemonic.forEachIndexed { index, word ->
            rule.onNodeWithTag(recoveryWordTag(index + 1)).assertTextEquals("${index + 1}. $word")
        }
        assertTrue(rule.onAllNodesWithTag(recoveryWordTag(13)).fetchSemanticsNodes().isEmpty())
        hide()

        // The fixture's first broadcast has an unknown outcome: a transfer takes it.
        runBlocking {
            val prepared = session.wallet.prepareTransaction(
                WalletTransactionPrepareRequest(
                    accountID = ton.accountID,
                    feePolicy = WalletFeePolicy(WalletFeeTier.Standard),
                    network = "ton",
                    outputs = listOf(WalletTransactionOutput(RECIPIENT, "100000000")),
                ),
                generation,
            )
            session.wallet.confirmTransaction(
                WalletTransactionConfirmRequest(emptyList(), ADMINISTRATOR, prepared.preparationID),
                generation,
            )
        }

        // The rotation keeps the 12 words every wallet reads and adds 12 for Telegram Wallet.
        rule.onNodeWithTag(RECOVERY_PASSWORD_TAG).performTextInput(ADMINISTRATOR)
        rule.onNodeWithTag(RECOVERY_LIST_TAG).performScrollToKey("rotate")
        rule.onNodeWithTag(RECOVERY_ROTATE_TAG).performClick()
        awaitNode(RECOVERY_ROTATION_TAG)
        awaitText("Rotation broadcast")
        phrase.mnemonic.forEachIndexed { index, word ->
            rule.onNodeWithTag(recoveryWordTag(index + 1)).performScrollTo().assertTextEquals("${index + 1}. $word")
        }
        rule.onNodeWithTag(recoveryWordTag(24)).performScrollTo()

        // A second rotation waits for the first.
        hide()
        awaitNode(RECOVERY_PASSWORD_TAG)
        rule.onNodeWithTag(RECOVERY_PASSWORD_TAG).performTextInput(ADMINISTRATOR)
        rule.onNodeWithTag(RECOVERY_LIST_TAG).performScrollToKey("rotate")
        rule.onNodeWithTag(RECOVERY_ROTATE_TAG).performClick()
        awaitNode(RECOVERY_ISSUE_TAG)
        awaitText("A signing key rotation is still pending.")
        rule.onNodeWithTag(RECOVERY_CLOSE_TAG).performClick()
        awaitGone(RECOVERY_TAG)
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

    /** The phrase is one tall item: Hide is reached by its key, as a node scroll can land short of it. */
    private fun hide() {
        rule.onNodeWithTag(RECOVERY_LIST_TAG).performScrollToKey("hide")
        rule.onNodeWithTag(RECOVERY_HIDE_TAG).performClick()
        awaitNode(RECOVERY_PASSWORD_TAG)
    }

    private fun awaitGone(tag: String) {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isEmpty() }
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
        const val RENAMED = "Анна · холодный"
        const val BITCOIN_ADDRESS = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq"
        const val NODE_TIMEOUT_MILLIS = 20_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
