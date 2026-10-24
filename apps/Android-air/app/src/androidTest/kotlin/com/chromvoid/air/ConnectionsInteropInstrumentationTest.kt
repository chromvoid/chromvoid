package com.chromvoid.air

import android.Manifest
import android.app.ActivityManager
import android.os.Build
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToKey
import androidx.compose.ui.test.performTextClearance
import androidx.compose.ui.test.performTextInput
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.chromvoid.air.ffi.AirHostPhase
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.connections.CONNECTIONS_LIST_TAG
import com.chromvoid.air.ui.connections.HOST_CODE_TAG
import com.chromvoid.air.ui.connections.HOST_NO_PEERS_TAG
import com.chromvoid.air.ui.connections.HOST_PAIR_TAG
import com.chromvoid.air.ui.connections.HOST_RELAY_TAG
import com.chromvoid.air.ui.connections.HOST_REVOKE_CONFIRM_TAG
import com.chromvoid.air.ui.connections.HOST_STOP_TAG
import com.chromvoid.air.ui.connections.HOST_SUMMARY_TAG
import com.chromvoid.air.ui.connections.hostPeerTag
import com.chromvoid.air.ui.connections.hostRevokeTag
import com.chromvoid.app.ConnectionForegroundService
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Routes A31-A33 with a real computer: the desktop's own pairing and remote
 * adapter (`desktop_observes_native_ui_revoke` in the desktop crate) over the
 * repository's relay, run on the Mac by `scripts/test-host-interop.sh`, which
 * reverses the relay's port to the emulator and passes it as `relay`. Without
 * that argument the test is skipped.
 *
 * The phone pairs from Connections with the vault open; the desktop pairs
 * with the code, connects and reads the vault's status; the phone names the
 * computer, dismisses one revoke, and revokes it once the desktop is armed,
 * which the desktop observes as its connection ending. The two sides pass the
 * invitation and their signals as files in the app's storage, which the
 * script reads and writes through `run-as`. The connection service runs
 * exactly while the host is on.
 */
@RunWith(AndroidJUnit4::class)
public class ConnectionsInteropInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session
    private val relay: String? = InstrumentationRegistry.getArguments().getString("relay")

    @Test
    public fun aComputerPairsReadsTheVaultAndIsRevoked() {
        assumeTrue("run through scripts/test-host-interop.sh", relay != null)
        val signals = rule.activity.filesDir.resolve("interop").apply { mkdirs() }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            // The notification that shows a running host; asked for as the host starts.
            InstrumentationRegistry.getInstrumentation().uiAutomation
                .grantRuntimePermission(rule.activity.packageName, Manifest.permission.POST_NOTIFICATIONS)
        }
        unlocked()
        awaitNode("root-connections")
        rule.onNodeWithTag("root-connections").performClick()
        awaitNode(HOST_RELAY_TAG)
        assertFalse(hostServiceRunning())

        // Pair a device: the code and invitation go to the desktop.
        rule.onNodeWithTag(HOST_RELAY_TAG).performTextClearance()
        rule.onNodeWithTag(HOST_RELAY_TAG).performTextInput(checkNotNull(relay))
        rule.onNodeWithTag(HOST_PAIR_TAG).performClick()
        rule.onNodeWithTag(CONNECTIONS_LIST_TAG).performScrollToKey("pairing")
        awaitNode(HOST_CODE_TAG)
        val pairing = runBlocking { session.hosts.snapshot() }
        val pin = checkNotNull(pairing.pairingPin)
        val offer = checkNotNull(pairing.pairingOffer)
        rule.onNodeWithTag(HOST_CODE_TAG).assertTextEquals(pin)
        assertEquals(relay, offer.relayBaseUrl)
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { hostServiceRunning() }
        val invitation = JSONObject()
            .put(
                "offer",
                JSONObject()
                    .put("session_id", offer.sessionId)
                    .put("relay_base_url", offer.relayBaseUrl)
                    .put("device_label", offer.deviceLabel)
                    .put("expires_at_ms", offer.expiresAtMs.toLong()),
            )
            .put("pin", pin)
        signals.resolve("invitation.json.part").writeText(invitation.toString())
        signals.resolve("invitation.json.part").renameTo(signals.resolve("invitation.json"))

        // The desktop pairs, connects and reads the vault: the phone names it as connected.
        rule.waitUntil(PEER_TIMEOUT_MILLIS) {
            runBlocking { session.hosts.snapshot() }.connectedPeers.isNotEmpty()
        }
        val peer = runBlocking { session.hosts.trustedPeers() }.single()
        assertEquals(DESKTOP_LABEL, peer.label)
        rule.onNodeWithTag(CONNECTIONS_LIST_TAG).performScrollToKey("host")
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { hasText(HOST_SUMMARY_TAG, "Device connected") }
        assertTrue(hostServiceRunning())
        rule.onNodeWithTag(CONNECTIONS_LIST_TAG).performScrollToKey("trusted")
        awaitNode(hostPeerTag(peer.peerId))
        rule.onNodeWithTag(hostPeerTag(peer.peerId)).assertTextContains("Connected", substring = true)

        // A revoke dismissed changes nothing.
        rule.onNodeWithTag(hostRevokeTag(peer.peerId)).performClick()
        awaitNode(HOST_REVOKE_CONFIRM_TAG)
        rule.onNodeWithText("Cancel").performClick()
        assertEquals(listOf(peer.peerId), runBlocking { session.hosts.trustedPeers() }.map { it.peerId })
        signals.resolve("cancelled").createNewFile()

        // Once the desktop has read the vault again, the revoke is confirmed.
        rule.waitUntil(PEER_TIMEOUT_MILLIS) { signals.resolve("armed").exists() }
        rule.onNodeWithTag(CONNECTIONS_LIST_TAG).performScrollToKey("trusted")
        rule.onNodeWithTag(hostRevokeTag(peer.peerId)).performClick()
        awaitNode(HOST_REVOKE_CONFIRM_TAG)
        rule.onNodeWithTag(HOST_REVOKE_CONFIRM_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { runBlocking { session.hosts.trustedPeers() }.isEmpty() }
        rule.onNodeWithTag(CONNECTIONS_LIST_TAG).performScrollToKey("trusted")
        awaitNode(HOST_NO_PEERS_TAG)
        rule.onNodeWithTag(CONNECTIONS_LIST_TAG).performScrollToKey("host")
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { hasText(HOST_SUMMARY_TAG, "Listening") }
        assertTrue(session.state.value is AirSessionState.Unlocked)

        // Stopping the host ends the connection service with it.
        rule.onNodeWithTag(CONNECTIONS_LIST_TAG).performScrollToKey("controls")
        rule.onNodeWithTag(HOST_STOP_TAG).performClick()
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { runBlocking { session.hosts.snapshot() }.phase == AirHostPhase.IDLE }
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { !hostServiceRunning() }
        signals.resolve("done").createNewFile()
    }

    private fun hostServiceRunning(): Boolean {
        val manager = rule.activity.getSystemService(ActivityManager::class.java)
        // Deprecated for other apps' services; an app still sees its own.
        @Suppress("DEPRECATION")
        return manager.getRunningServices(Int.MAX_VALUE).any {
            it.service.className == ConnectionForegroundService::class.java.name && it.foreground
        }
    }

    private fun hasText(tag: String, text: String): Boolean =
        runCatching { rule.onNodeWithTag(tag).assertTextContains(text) }.isSuccess

    private fun unlocked() {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
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

        /** The label the desktop's interoperability test pairs under. */
        const val DESKTOP_LABEL = "Desktop UI verification"
        const val NODE_TIMEOUT_MILLIS = 20_000L
        const val PEER_TIMEOUT_MILLIS = 180_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
