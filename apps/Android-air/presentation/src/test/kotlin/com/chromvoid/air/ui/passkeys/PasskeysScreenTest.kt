package com.chromvoid.air.ui.passkeys

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.chromvoid.air.ui.AirTheme
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

/** Route A18 over the Passkeys page: the list, search, the details and deleting from this vault. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class PasskeysScreenTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private var closed = 0

    private fun show(store: FakePasskeyStore): PasskeysModel {
        val model = PasskeysModel(store, 1uL, CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate))
        model.reload()
        rule.setContent { AirTheme { PasskeysScreen(model, onBack = { closed++ }) } }
        rule.waitForIdle()
        return model
    }

    private fun exists(tag: String): Boolean = rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()

    @Test
    public fun `an empty vault says where passkeys come from`() {
        show(FakePasskeyStore())
        rule.onNodeWithText("No passkeys in this vault").assertIsDisplayed()
        rule.onNodeWithTag(PASSKEYS_BACK_TAG).performClick()
        assertEquals(1, closed)
    }

    @Test
    public fun `a passkey is found, opened with its details and deleted after confirming`() {
        val store = FakePasskeyStore()
        store.passkey("p1", "login.example.test", "alice@example.test", "Alice")
        store.passkey("p2", "docs.example.test", "", "Боб", portable = false)
        show(store)

        rule.onNodeWithTag(PASSKEYS_SEARCH_TAG).performTextInput("docs")
        rule.waitForIdle()
        assertTrue(!exists(passkeyRowTag("p1")))
        rule.onNodeWithTag(passkeyRowTag("p2")).assertTextContains("Боб", substring = true)
        rule.onNodeWithTag(passkeyRowTag("p2")).performClick()
        rule.waitForIdle()

        rule.onNodeWithTag(PASSKEY_DETAIL_TAG).assertIsDisplayed()
        rule.onNodeWithText("This passkey cannot be transferred to another device.").assertIsDisplayed()
        rule.onNodeWithText("Not recorded").assertIsDisplayed()
        rule.onNodeWithTag(PASSKEY_DELETE_TAG).performClick()
        rule.onNodeWithText("Delete passkey from this vault?").assertIsDisplayed()
        rule.onNodeWithTag(PASSKEY_DELETE_CONFIRM_TAG).performClick()
        rule.waitForIdle()

        assertEquals(listOf("p1"), store.passkeys.map { it.credentialIDB64URL })
        rule.onNodeWithText("Passkey deleted from this vault.").assertIsDisplayed()
        assertTrue(!exists(PASSKEY_DETAIL_TAG))
    }
}
