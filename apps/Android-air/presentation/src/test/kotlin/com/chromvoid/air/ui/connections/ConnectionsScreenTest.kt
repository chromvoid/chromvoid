package com.chromvoid.air.ui.connections

import androidx.activity.ComponentActivity
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToKey
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import com.chromvoid.air.ffi.AirHostConnection
import com.chromvoid.air.ffi.AirHostPeer
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

/** Routes A31-A33 over the Connections screen: the host's state, pairing, the relay and revoking a computer. */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
public class ConnectionsScreenTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private val clipboard = FakeClipboard()
    private var asked = 0

    private fun show(store: FakeHostStore, vaultOpen: Boolean = false): ConnectionsModel {
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
        val model = ConnectionsModel(store, "Pixel", scope, clipboard)
        model.synchronize(3uL, vaultOpen)
        rule.setContent {
            AirTheme {
                ConnectionsScreen(
                    model,
                    beforeHostStarts = { proceed ->
                        asked++
                        proceed()
                    },
                )
            }
        }
        rule.waitForIdle()
        return model
    }

    private fun exists(tag: String): Boolean = rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty()

    @Test
    public fun `a pairing shows its code and invitation, copies the code and is cancelled`() {
        val store = FakeHostStore()
        show(store)
        rule.onNodeWithTag(HOST_SUMMARY_TAG).assertTextContains("Host stopped")
        rule.onNodeWithText("Vault is closed").assertIsDisplayed()
        rule.onNodeWithTag(HOST_NO_PEERS_TAG).assertIsDisplayed()
        assertTrue(!exists(HOST_START_TAG))

        rule.onNodeWithTag(HOST_PAIR_TAG).performClick()
        rule.waitForIdle()

        assertEquals(1, asked)
        rule.onNodeWithTag(HOST_SUMMARY_TAG).assertTextContains("Ready to pair")
        rule.onNodeWithTag(CONNECTIONS_LIST_TAG).performScrollToKey("pairing")
        rule.onNodeWithTag(HOST_CODE_TAG).assertTextContains("482913")
        rule.onNodeWithTag(HOST_INVITATION_TAG).assertIsDisplayed()
        rule.onNodeWithTag(HOST_COPY_TAG).performClick()
        assertEquals("482913" to true, clipboard.copies.single())
        rule.onNodeWithText("Code copied").assertIsDisplayed()

        rule.onNodeWithTag(HOST_CANCEL_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(CONNECTIONS_LIST_TAG).performScrollToKey("host")
        rule.onNodeWithTag(HOST_SUMMARY_TAG).assertTextContains("Host stopped")
        assertTrue(!exists(HOST_CODE_TAG))
    }

    @Test
    public fun `a relay that is not secure is explained and the host stays off`() {
        val store = FakeHostStore()
        show(store)

        rule.onNodeWithTag(HOST_RELAY_TAG).performTextClearance()
        rule.onNodeWithTag(HOST_RELAY_TAG).performTextInput("https://relay.example.test")
        rule.onNodeWithTag(HOST_PAIR_TAG).performClick()
        rule.waitForIdle()

        rule.onNodeWithText("Enter a valid secure relay URL.").assertIsDisplayed()
        rule.onNodeWithTag(HOST_SUMMARY_TAG).assertTextContains("Host stopped")
    }

    @Test
    public fun `a trusted computer shows it is connected and is revoked after confirming`() {
        val store = FakeHostStore()
        store.peers += AirHostPeer("desk", "Work laptop", "desktop")
        store.connected += AirHostConnection("desk", "Work laptop", "wss_relay")
        store.enabled = true
        show(store, vaultOpen = true)

        rule.onNodeWithTag(HOST_SUMMARY_TAG).assertTextContains("Device connected")
        rule.onNodeWithText("Vault is open").assertIsDisplayed()
        rule.onNodeWithTag(CONNECTIONS_LIST_TAG).performScrollToKey("trusted")
        rule.onNodeWithTag(hostPeerTag("desk")).assertTextContains("Connected", substring = true)
        rule.onNodeWithTag(hostRevokeTag("desk")).performClick()
        rule.onNodeWithText("Revoke access to this device?").assertIsDisplayed()
        rule.onNodeWithTag(HOST_REVOKE_CONFIRM_TAG).performClick()
        rule.waitForIdle()

        assertTrue(store.peers.isEmpty())
        rule.onNodeWithTag(CONNECTIONS_LIST_TAG).performScrollToKey("trusted")
        rule.onNodeWithTag(HOST_NO_PEERS_TAG).assertIsDisplayed()
    }

    @Test
    public fun `a host with a trusted computer can be started and stopped`() {
        val store = FakeHostStore()
        store.peers += AirHostPeer("desk", "Work laptop", "desktop")
        show(store)

        rule.onNodeWithTag(HOST_START_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(HOST_SUMMARY_TAG).assertTextContains("Listening")
        rule.onNodeWithText("To pair another device, stop the host first.").assertIsDisplayed()

        rule.onNodeWithTag(HOST_STOP_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(HOST_SUMMARY_TAG).assertTextContains("Host stopped")
        assertEquals(1, asked)
    }

    @Test
    public fun `a computer on the cable asks to pair over any screen, with the PIN to type there`() {
        val store = FakeHostStore()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
        val model = ConnectionsModel(store, "Pixel", scope, clipboard)
        model.synchronize(3uL, vaultOpen = true)
        rule.setContent { AirTheme { UsbApprovalPrompt(model) } }
        rule.waitForIdle()
        assertTrue(!exists(USB_PAIRING_TAG))

        store.desktopAsksToPair(pin = "305172", attemptsLeft = 4)
        rule.waitUntil(TIMEOUT_MILLIS) { exists(USB_PAIRING_TAG) }
        rule.onNodeWithTag(USB_PIN_TAG).assertTextContains("305 172")
        rule.onNodeWithText("Pair with “Studio Mac”?").assertIsDisplayed()
        rule.onNodeWithText("A wrong code was typed. Tries left: 4.").assertIsDisplayed()
        rule.onNodeWithTag(USB_ALLOW_TAG).performClick()
        rule.waitUntil(TIMEOUT_MILLIS) { !exists(USB_ALLOW_TAG) }
        rule.onNodeWithText("Allowed. Waiting for the code on the computer.").assertIsDisplayed()

        rule.onNodeWithTag(USB_DENY_TAG).performClick()
        rule.waitUntil(TIMEOUT_MILLIS) { !exists(USB_PAIRING_TAG) }
        assertEquals(
            listOf("usb:pairing:pairing-1:true", "usb:pairing:pairing-1:false"),
            store.calls.filter { it.startsWith("usb") },
        )
    }

    @Test
    public fun `a trusted computer asks to use the vault, and the page shows it connected by cable`() {
        val store = FakeHostStore()
        val model = show(store, vaultOpen = false)
        rule.onNodeWithTag(CONNECTIONS_LIST_TAG).performScrollToKey("usb")
        rule.onNodeWithTag(USB_STATUS_TAG).assertTextContains("No computer on the cable")

        store.desktopAsksForSession()
        rule.waitUntil(TIMEOUT_MILLIS) { model.state.value.usb?.session != null }
        rule.onNodeWithTag(USB_STATUS_TAG).assertTextContains("Studio Mac is waiting for your answer")
        model.answerUsbSession(allow = true)
        rule.waitUntil(TIMEOUT_MILLIS) { model.state.value.usb?.session == null }
        rule.onNodeWithTag(USB_STATUS_TAG).assertTextContains("Studio Mac is connected by cable")
    }

    @Test
    public fun `the session question says a locked vault opens only when the person opens it`() {
        val store = FakeHostStore()
        val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
        val model = ConnectionsModel(store, "Pixel", scope, clipboard)
        model.synchronize(3uL, vaultOpen = false)
        rule.setContent { AirTheme { UsbApprovalPrompt(model) } }
        store.desktopAsksForSession()
        rule.waitUntil(TIMEOUT_MILLIS) { exists(USB_SESSION_TAG) }
        rule.onNodeWithText("Let “Studio Mac” use the vault?").assertIsDisplayed()
        rule.onNodeWithText("It reaches the vault once you open it.").assertIsDisplayed()
        rule.onNodeWithTag(USB_ALLOW_TAG).performClick()
        rule.waitUntil(TIMEOUT_MILLIS) { !exists(USB_SESSION_TAG) }
        assertEquals("usb:session:session-1:true", store.calls.last { it.startsWith("usb") })
    }

    private companion object {
        const val TIMEOUT_MILLIS = 5_000L
    }
}
