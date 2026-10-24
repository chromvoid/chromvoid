package com.chromvoid.air.ui.wallet

import androidx.activity.ComponentActivity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performScrollToKey
import androidx.compose.ui.test.performTextInput
import com.chromvoid.air.bridge.wire.WalletFeeTier
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.credentials.FakeClipboard
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Routes A34-A37 over the wallet screens: the catalog, setup, a network,
 * receive, a new account, send, activity, the contacts and recovery.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class WalletScreenTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private val clipboard = FakeClipboard()
    private var closed = 0

    private fun show(store: FakeWalletStore): WalletModel {
        val model = WalletModel(store, 1uL, CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate), clipboard)
        rule.setContent { AirTheme { WalletRoot(model, onBack = { closed++ }, onLock = {}) } }
        rule.waitForIdle()
        return model
    }

    private fun exists(tag: String): Boolean = rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()

    @Test
    public fun `an empty wallet explains itself and a new one is created from the add menu`() {
        val store = FakeWalletStore()
        show(store)
        rule.onNodeWithTag(WALLET_EMPTY_TAG).assertIsDisplayed()

        rule.onNodeWithTag(WALLET_ADD_TAG).performClick()
        rule.onNodeWithTag(walletSetupTag(WalletSetupModel.Intent.CREATE)).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(SETUP_TAG).assertIsDisplayed()
        rule.onNodeWithTag(setupFieldTag(WalletSetupModel.Field.LABEL)).performTextInput("Everyday")
        rule.onNodeWithTag(SETUP_SAVE_TAG).performClick()
        rule.waitForIdle()

        assertTrue(!exists(SETUP_TAG))
        val card = walletCardTag(store.wallets.single().walletID)
        rule.onNodeWithTag(card).assertTextContains("Everyday", substring = true)
        rule.onNodeWithTag(walletAssetTag("ton")).assertIsDisplayed()
    }

    @Test
    public fun `the networks show their balances and one opens with its address`() {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("ton", "bitcoin"))
        val ton = store.accounts.first { it.network == "ton" }
        store.live[ton.accountID] = "2500000000"
        show(store)

        rule.onNodeWithTag(walletAssetTag("ton")).assertTextContains("2.5 TON", substring = true)
        rule.onNodeWithTag(walletAssetTag("ton")).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(WALLET_NETWORK_BALANCE_TAG).assertTextContains("2.5 TON")
        rule.onNodeWithTag(WALLET_COPY_ADDRESS_TAG).performClick()
        assertEquals(ton.address, clipboard.copies.last().first)
        rule.onNodeWithTag(WALLET_NETWORK_BACK_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(WALLET_CARDS_TAG).assertIsDisplayed()
    }

    @Test
    public fun `receive shows the address as a code and switches networks`() {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("ton", "bitcoin"))
        show(store)

        rule.onNodeWithTag(WALLET_RECEIVE_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(RECEIVE_TAG).assertIsDisplayed()
        rule.onNodeWithText("Address · TON").assertIsDisplayed()

        rule.onNodeWithTag(receiveNetworkTag("bitcoin")).performClick()
        rule.waitForIdle()
        rule.onNodeWithText("Address · Bitcoin").assertIsDisplayed()
        rule.onNodeWithTag(RECEIVE_COPY_TAG).performClick()
        assertTrue(clipboard.copies.last().first.startsWith("bc1-"))
        rule.onNodeWithText("Copied").assertIsDisplayed()

        rule.onNodeWithTag(RECEIVE_CLOSE_TAG).performClick()
        rule.waitForIdle()
        assertTrue(!exists(RECEIVE_TAG))
    }

    @Test
    public fun `another account is added from a network's menu`() {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("ton"))
        show(store)
        rule.onNodeWithTag(walletAssetTag("ton")).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(WALLET_NETWORK_MENU_TAG).performClick()
        rule.onNodeWithTag(WALLET_ADD_ANOTHER_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(ADD_ACCOUNT_TAG).assertIsDisplayed()
        rule.onNodeWithTag(ADD_ACCOUNT_CONFIRM_TAG).performClick()
        rule.waitForIdle()

        assertTrue(!exists(ADD_ACCOUNT_TAG))
        assertEquals(2, store.accounts.count { it.network == "ton" })
    }

    @Test
    public fun `a disabled runtime says so and offers nothing to add`() {
        val store = FakeWalletStore(enabled = false)
        show(store)

        rule.onNodeWithTag(WALLET_UNAVAILABLE_TAG).assertIsDisplayed()
        rule.onNodeWithTag(WALLET_ADD_TAG).assertIsNotEnabled()
    }

    @Test
    public fun `a restored phrase is typed hidden and can be shown`() {
        val store = FakeWalletStore()
        show(store)
        rule.onNodeWithTag(WALLET_ADD_TAG).performClick()
        rule.onNodeWithTag(walletSetupTag(WalletSetupModel.Intent.RESTORE)).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(setupProfileTag(WalletSetupModel.RecoveryProfile.TON_ONLY)).performScrollTo().performClick()
        rule.onNodeWithTag(setupFieldTag(WalletSetupModel.Field.LABEL)).performTextInput("Old")
        rule.onNodeWithTag(setupFieldTag(WalletSetupModel.Field.MNEMONIC)).performScrollTo().performTextInput("one two")
        rule.onNodeWithTag(SETUP_SAVE_TAG).performClick()
        rule.waitForIdle()

        assertEquals(listOf("one", "two"), store.created.single().mnemonic)
        assertEquals("ton_only", store.created.single().walletMode)
    }

    @Test
    public fun `a transfer is reviewed, authorized, and its activity opens`() {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("ton"))
        show(store)

        rule.onNodeWithTag(WALLET_SEND_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(sendAddressTag(0)).performTextInput("UQpeer")
        rule.onNodeWithTag(sendAmountTag(0)).performTextInput("1.5")
        rule.onNodeWithTag(SEND_REVIEW_TAG).performScrollTo().performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(SEND_TOTAL_TAG).performScrollTo().assertTextContains("1.505 TON", substring = true)
        rule.onNodeWithTag(SEND_PASSWORD_TAG).performScrollTo().performTextInput("admin")
        rule.onNodeWithTag(SEND_CONFIRM_TAG).performScrollTo().performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(SEND_RESULT_TAG).assertIsDisplayed()

        rule.onNodeWithTag(SEND_VIEW_ACTIVITY_TAG).performScrollTo().performClick()
        rule.waitForIdle()
        assertTrue(!exists(SEND_TAG))
        rule.onNodeWithTag(transactionTag("tx1")).assertIsDisplayed().performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(TRANSACTION_STATUS_TAG).assertTextContains("Pending", substring = true)
    }

    @Test
    public fun `an unconfirmed broadcast is sent again from its details`() {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("ton"))
        store.journal += store.entry(store.accounts.single(), "tx9", status = "broadcast_unknown")
        show(store)

        rule.onNodeWithTag(WALLET_ACTIVITY_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(transactionTag("tx9")).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(TRANSACTION_TAG).performScrollToKey("rebroadcast")
        rule.onNodeWithTag(REBROADCAST_TAG).performClick()
        rule.onNodeWithTag(REBROADCAST_PASSWORD_TAG).performScrollTo().performTextInput("admin")
        rule.onNodeWithTag(REBROADCAST_CONFIRM_TAG).performScrollTo().performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(TRANSACTION_TAG).performScrollToKey("summary")
        rule.onNodeWithTag(TRANSACTION_STATUS_TAG).assertTextContains("Pending", substring = true)
        assertTrue(!exists(REBROADCAST_TAG))
    }

    @Test
    public fun `the transfer fee exposes one selected priority and updates the transfer model`() {
        val store = FakeWalletStore().apply { wallet("Main", listOf("ton")) }
        val model = show(store)
        rule.onNodeWithTag(WALLET_SEND_TAG).performClick()
        rule.onNodeWithTag(sendFeeTierTag(WalletFeeTier.Standard)).performScrollTo().assertIsSelected()
        rule.onNodeWithTag(sendFeeTierTag(WalletFeeTier.Fast))
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.RadioButton))
            .assertTextContains("Fast").assertIsNotSelected().performClick().assertIsSelected()
        rule.onNodeWithTag(sendFeeTierTag(WalletFeeTier.Standard)).assertIsNotSelected()
        assertEquals(WalletFeeTier.Fast, model.state.value.send?.state?.value?.feeTier)
    }

    @Test
    public fun `closing a filled transfer asks before discarding it`() {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("ton"))
        show(store)
        rule.onNodeWithTag(WALLET_SEND_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(sendAddressTag(0)).performTextInput("UQpeer")

        rule.onNodeWithTag(SEND_CLOSE_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(SEND_DISCARD_TAG).performClick()
        rule.waitForIdle()

        assertTrue(!exists(SEND_TAG))
    }

    @Test
    public fun `a contact is added in the address book and deleted from its menu`() {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("ton", "bitcoin"))
        show(store)

        rule.onNodeWithTag(WALLET_CONTACTS_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(CONTACTS_EMPTY_TAG).assertIsDisplayed()
        rule.onNodeWithTag(CONTACTS_ADD_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(contactFieldTag(WalletAddressBookModel.Field.LABEL)).performTextInput("Alice")
        rule.onNodeWithTag(contactFieldTag(WalletAddressBookModel.Field.ADDRESS)).performTextInput("UQalice")
        rule.onNodeWithTag(CONTACT_SAVE_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(CONTACT_ISSUE_TAG).assertIsDisplayed()
        rule.onNodeWithText("Choose an available network.").assertIsDisplayed()
        rule.onNodeWithTag(contactNetworkTag("ton")).performClick()
        rule.onNodeWithTag(CONTACT_SAVE_TAG).performClick()
        rule.waitForIdle()

        val id = store.contacts.single().entryID
        assertTrue(!exists(CONTACT_EDITOR_TAG))
        rule.onNodeWithTag(contactTag(id)).assertTextContains("Alice", substring = true)
        rule.onNodeWithTag(contactMenuTag(id)).performClick()
        rule.onNodeWithTag(CONTACT_DELETE_TAG).performClick()
        rule.onNodeWithTag(CONTACT_DELETE_CONFIRM_TAG).performClick()
        rule.waitForIdle()

        assertTrue(store.contacts.isEmpty())
        rule.onNodeWithTag(CONTACTS_EMPTY_TAG).assertIsDisplayed()
        rule.onNodeWithTag(CONTACTS_DONE_TAG).performClick()
        rule.waitForIdle()
        assertTrue(!exists(CONTACTS_TAG))
    }

    @Test
    public fun `a saved contact on the transfer's network fills a recipient`() {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("ton"))
        store.contacts += com.chromvoid.air.bridge.wire.WalletAddressBookEntry("UQalice", 1, "c1", "Alice", "ton", 1)
        show(store)

        rule.onNodeWithTag(WALLET_SEND_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(sendContactTag(0)).performScrollTo().performClick()
        rule.onNodeWithTag(sendContactOptionTag("c1")).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(sendAddressTag(0)).performScrollTo().assertTextContains("UQalice")
    }

    @Test
    public fun `the recovery phrase shows after the administrative password and hides again`() {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("ton"))
        show(store)

        rule.onNodeWithTag(WALLET_EXPORT_TAG).performScrollTo().performClick()
        rule.waitForIdle()
        assertTrue(!exists(RECOVERY_ROTATE_TAG))
        rule.onNodeWithTag(RECOVERY_SHOW_TAG).performClick()
        rule.onNodeWithTag(RECOVERY_ISSUE_TAG).assertIsDisplayed()
        rule.onNodeWithText("Enter the administrative password.").assertIsDisplayed()
        rule.onNodeWithTag(RECOVERY_PASSWORD_TAG).performTextInput("admin")
        rule.onNodeWithTag(RECOVERY_SHOW_TAG).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(recoveryWordTag(1)).assertTextContains("1. anchor0")
        rule.onNodeWithTag(RECOVERY_COPY_TAG).performScrollTo().performClick()
        assertEquals(store.phrase.joinToString(" ") to true, clipboard.copies.last())
        rule.onNodeWithTag(RECOVERY_HIDE_TAG).performScrollTo().performClick()
        rule.waitForIdle()
        assertTrue(!exists(recoveryWordTag(1)))
        rule.onNodeWithTag(RECOVERY_CLOSE_TAG).performClick()
        rule.waitForIdle()
        assertTrue(!exists(RECOVERY_TAG))
    }

    @Test
    public fun `a TON signing key is rotated and all 24 words shown in their two parts`() {
        val store = FakeWalletStore()
        store.wallet("Main", listOf("ton"))
        store.accounts[0] = store.accounts[0].copy(mnemonicStandard = "rotation")
        show(store)

        rule.onNodeWithTag(WALLET_EXPORT_TAG).performScrollTo().performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(RECOVERY_PASSWORD_TAG).performTextInput("admin")
        rule.onNodeWithTag(RECOVERY_ROTATE_TAG).performScrollTo().performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(RECOVERY_ROTATION_TAG).assertIsDisplayed()
        rule.onNodeWithText("Sequence number").assertTextContains("7")
        rule.onNodeWithText("Words 13–24 · Telegram Wallet only").performScrollTo().assertIsDisplayed()
        rule.onNodeWithTag(recoveryWordTag(24)).performScrollTo().assertTextContains("24. signing11")
        rule.onNodeWithTag(RECOVERY_COPY_FIRST_TAG).performScrollTo().performClick()
        assertEquals(store.phrase.joinToString(" "), clipboard.copies.last().first)
    }

    @Test
    public fun `Back leaves the wallet from its root`() {
        show(FakeWalletStore())
        rule.onNodeWithTag(WALLET_BACK_TAG).performClick()
        assertEquals(1, closed)
    }
}
