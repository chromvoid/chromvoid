package com.chromvoid.air.ui.wallet

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsFocused
import androidx.compose.ui.test.hasScrollToIndexAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasTestTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onLast
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToKey
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import com.chromvoid.air.bridge.wire.WalletStatusResponse
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.credentials.FakeClipboard
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w360dp-h420dp")
public class WalletFormAccessibilityTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private val store = FakeWalletStore()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val clipboard = FakeClipboard()

    @After
    public fun closeScope() {
        scope.cancel()
    }

    private fun status() = WalletStatusResponse(
        enabled = true,
        initialized = store.wallets.isNotEmpty(),
        networks = store.networks,
        walletCount = store.wallets.size.toLong(),
    )

    private fun showSetup(intent: WalletSetupModel.Intent) {
        val model = WalletSetupModel(intent, status(), store, 1uL, scope) { _, _ -> }
        rule.setContent { AirTheme { WalletSetupScreen(model, onClose = {}) } }
        rule.waitForIdle()
    }

    private fun showSend() {
        val wallet = store.wallet("Main", listOf("ton"))
        val account = store.accounts.single()
        val model = WalletSendModel(
            wallet.walletID,
            account.accountID,
            WalletNetwork.of("ton")!!,
            status(),
            store,
            1uL,
            scope,
        )
        val contacts = WalletAddressBookModel(store, 1uL, scope, clipboard)
        rule.setContent { AirTheme { WalletSendScreen(model, contacts, {}, {}, {}) } }
    }

    private fun assertLabel(tag: String, label: String) {
        rule.onNodeWithTag(tag)
            .performScrollTo()
            .assert(hasSetTextAction())
            .assertContentDescriptionEquals(label)
        rule.onAllNodesWithText(label, useUnmergedTree = true).onLast().assertIsDisplayed()
    }

    private fun scrollToSection(key: String) {
        rule.onAllNodes(hasScrollToIndexAction()).onLast().performScrollToKey(key)
    }

    private fun assertError(tag: String, message: String) {
        rule.onNodeWithTag(tag)
            .assertIsDisplayed()
            .assertIsFocused()
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Error, message))
    }

    @Test
    public fun `a new wallet names its editable field after typing and focuses its required name`() {
        showSetup(WalletSetupModel.Intent.CREATE)
        val name = setupFieldTag(WalletSetupModel.Field.LABEL)
        rule.onNodeWithTag(SETUP_SAVE_TAG).performClick()
        assertError(name, "This field is required.")

        rule.onNodeWithTag(name).performTextInput("Everyday")
        assertLabel(name, "Name")
        rule.onNodeWithTag(name).assert(SemanticsMatcher.keyNotDefined(SemanticsProperties.Error))
    }

    @Test
    public fun `a restored wallet keeps phrase and passphrase labels and returns to an offscreen invalid name`() {
        showSetup(WalletSetupModel.Intent.RESTORE)
        val name = setupFieldTag(WalletSetupModel.Field.LABEL)
        val phrase = setupFieldTag(WalletSetupModel.Field.MNEMONIC)
        val passphrase = setupFieldTag(WalletSetupModel.Field.PASSPHRASE)
        rule.onNodeWithTag(name).performTextInput("Restored")
        assertLabel(name, "Name")
        scrollToSection("phrase")
        rule.onNodeWithTag(phrase).performScrollTo().performTextInput("one two three")
        assertLabel(phrase, "Recovery phrase")
        scrollToSection("advanced")
        rule.onNodeWithTag(SETUP_ADVANCED_TAG).performScrollTo().performClick()
        rule.onNodeWithTag(SETUP_PASSPHRASE_TAG).performScrollTo().performClick()
        rule.onNodeWithTag(SETUP_SAVE_TAG).performClick()
        assertError(passphrase, "This field is required.")
        rule.onNodeWithTag(passphrase).performTextInput("extra")
        assertLabel(passphrase, "BIP39 passphrase")

        scrollToSection("name")
        rule.onNodeWithTag(name).performTextClearance()
        scrollToSection("advanced")
        rule.onNodeWithTag(passphrase).performScrollTo().performClick()
        assertTrue(rule.onAllNodesWithTag(name).fetchSemanticsNodes().isEmpty())
        rule.onNodeWithTag(SETUP_SAVE_TAG).performClick()
        assertError(name, "This field is required.")
    }

    @Test
    public fun `an imported wallet keeps its key label and puts the required error on the key input`() {
        showSetup(WalletSetupModel.Intent.IMPORT_KEY)
        val name = setupFieldTag(WalletSetupModel.Field.LABEL)
        val key = setupFieldTag(WalletSetupModel.Field.PRIVATE_KEY)
        rule.onNodeWithTag(name).performTextInput("Imported")
        assertLabel(name, "Name")
        scrollToSection("key")
        rule.onNodeWithTag(key).performScrollTo().performTextInput("secret")
        assertLabel(key, "Private key")
        rule.onNodeWithTag(key).performTextClearance()
        rule.onNodeWithTag(SETUP_SAVE_TAG).performClick()
        assertError(key, "This field is required.")
    }

    @Test
    public fun `a transfer retains the network unit and field names and focuses each invalid editable node`() {
        showSend()
        scrollToSection("review")
        rule.onNodeWithTag(SEND_REVIEW_TAG).performScrollTo().performClick()
        assertError(sendAddressTag(0), "Enter a recipient address.")
        rule.onNodeWithTag(sendAddressTag(0)).performTextInput("UQpeer")
        assertLabel(sendAddressTag(0), "Address")
        scrollToSection("review")
        rule.onNodeWithTag(SEND_REVIEW_TAG).performScrollTo().performClick()
        assertError(sendAmountTag(0), "Enter a positive amount with the supported decimal precision.")
        rule.onNodeWithTag(sendAmountTag(0)).performTextInput("1.5")
        assertLabel(sendAmountTag(0), "Amount (TON)")
        scrollToSection("fee")
        rule.onNodeWithTag(SEND_COMMENT_TAG).performScrollTo().performTextInput("Thanks")
        assertLabel(SEND_COMMENT_TAG, "Comment")
        scrollToSection("review")
        rule.onNodeWithTag(SEND_REVIEW_TAG).performScrollTo().performClick()
        scrollToSection("authorize")
        rule.onNodeWithTag(SEND_CONFIRM_TAG).performScrollTo().performClick()
        assertError(SEND_PASSWORD_TAG, "Enter the administrative password.")
        rule.onNodeWithTag(SEND_PASSWORD_TAG).performTextInput("admin")
        assertLabel(SEND_PASSWORD_TAG, "Administrative password")
    }

    @Test
    public fun `a single recipient rejected by Core exposes its address error and receives focus`() {
        store.prepareRefusal = "INVALID_ADDRESS"
        showSend()
        rule.onNodeWithTag(sendAddressTag(0)).performTextInput("UQpeer")
        rule.onNodeWithTag(sendAmountTag(0)).performScrollTo().performTextInput("1.5")
        scrollToSection("review")
        rule.onNodeWithTag(SEND_REVIEW_TAG).performScrollTo().performClick()
        assertError(sendAddressTag(0), "Check the recipient addresses.")
    }

    @Test
    public fun `a contact keeps its filled names and focuses the first field error on submit`() {
        val model = WalletAddressBookModel(store, 1uL, scope, clipboard)
        model.updateNetworks(listOf("ton"))
        model.reload()
        rule.setContent { AirTheme { WalletAddressBookScreen(model, {}, {}) } }
        rule.onNodeWithTag(CONTACTS_ADD_TAG).performClick()
        rule.onNodeWithTag(CONTACT_SAVE_TAG).performClick()
        val name = contactFieldTag(WalletAddressBookModel.Field.LABEL)
        val address = contactFieldTag(WalletAddressBookModel.Field.ADDRESS)
        assertError(name, "Enter a contact name.")
        rule.onNodeWithTag(name).performTextInput("Alice")
        assertLabel(name, "Name")
        scrollToSection("networks")
        rule.onNodeWithTag(contactNetworkTag("ton")).performScrollTo().performClick()
        rule.onNodeWithTag(CONTACT_SAVE_TAG).performClick()
        assertError(address, "Enter an address.")
        rule.onNodeWithTag(address).performTextInput("UQalice")
        assertLabel(address, "Address")
    }

    @Test
    public fun `recovery keeps the password label and exposes required and reauthentication errors on its input`() {
        val wallet = store.wallet("Main", listOf("ton"))
        val model = WalletRecoveryModel(wallet.walletID, "Main", null, store, 1uL, scope, clipboard)
        rule.setContent { AirTheme { WalletRecoveryScreen(model, {}, {}) } }
        rule.onNodeWithTag(RECOVERY_SHOW_TAG).performScrollTo().performClick()
        assertError(RECOVERY_PASSWORD_TAG, "Enter the administrative password.")
        rule.onNodeWithTag(RECOVERY_PASSWORD_TAG).performTextInput("wrong")
        assertLabel(RECOVERY_PASSWORD_TAG, "Administrative password")
        rule.onNodeWithTag(RECOVERY_SHOW_TAG).performScrollTo().performClick()
        assertError(RECOVERY_PASSWORD_TAG, "The administrative password could not authorize recovery access.")
    }

    @Test
    public fun `rebroadcast keeps the password label and its required error belongs to the editable node`() {
        store.wallet("Main", listOf("ton"))
        val account = store.accounts.single()
        store.journal += store.entry(account, "tx9", status = "broadcast_unknown")
        val model = WalletModel(store, 1uL, scope, clipboard)
        rule.setContent { AirTheme { WalletRoot(model, {}, {}) } }
        rule.waitUntil(5_000) { model.state.value.phase == WalletModel.Phase.READY }
        rule.waitForIdle()
        rule.onNodeWithTag(WALLET_LIST_TAG).performScrollToKey("actions")
        rule.onNodeWithTag(WALLET_ACTIVITY_TAG).performScrollTo().performClick()
        rule.onNodeWithTag(HISTORY_TAG).performScrollToNode(hasTestTag(transactionTag("tx9")))
        rule.onNodeWithTag(transactionTag("tx9")).performClick()
        rule.onNodeWithTag(TRANSACTION_TAG).performScrollToNode(hasTestTag(REBROADCAST_TAG))
        rule.onNodeWithTag(REBROADCAST_TAG).performScrollTo().performClick()
        rule.onNodeWithTag(REBROADCAST_CONFIRM_TAG).performScrollTo().performClick()
        assertError(REBROADCAST_PASSWORD_TAG, "Enter the administrative password.")
        rule.onNodeWithTag(REBROADCAST_PASSWORD_TAG).performTextInput("admin")
        assertLabel(REBROADCAST_PASSWORD_TAG, "Administrative password")
    }
}
