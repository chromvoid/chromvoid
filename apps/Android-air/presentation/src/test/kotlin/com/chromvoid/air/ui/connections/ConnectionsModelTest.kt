package com.chromvoid.air.ui.connections

import com.chromvoid.air.ffi.AirHostPeer
import com.chromvoid.air.ffi.AirHostPhase
import com.chromvoid.air.ffi.AirUsbLinkState
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.credentials.FakeClipboard
import com.chromvoid.air.ui.credentials.modelScope
import java.io.IOException
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
public class ConnectionsModelTest {
    private val clipboard = FakeClipboard()

    private fun TestScope.connections(
        store: FakeHostStore,
        generation: ULong? = 7uL,
        vaultOpen: Boolean = false,
    ): ConnectionsModel = ConnectionsModel(store, "Pixel", modelScope(), clipboard).also {
        it.synchronize(generation, vaultOpen)
        advanceUntilIdle()
    }

    private val ConnectionsModel.now: ConnectionsModel.State get() = state.value

    @Test
    public fun `the host is read, resumed where it was on, with the relay it last used`(): Unit = runTest {
        val store = FakeHostStore()
        store.peers += AirHostPeer("desk", "Work laptop", "desktop")
        store.enabled = true
        store.savedRelay = "wss://relay.example.test"

        val model = connections(store, vaultOpen = true)

        assertEquals(ConnectionsModel.Phase.READY, model.now.phase)
        assertEquals(listOf("resume", "preferences", "peers"), store.calls)
        assertEquals(AirHostPhase.READY, model.now.snapshot?.phase)
        assertEquals(ConnectionsModel.Summary.LISTENING, model.now.summary)
        assertEquals("wss://relay.example.test", model.now.relayUrl)
        assertTrue(model.now.savedEnabled)
        assertTrue(model.now.vaultOpen)
        assertEquals("Work laptop", model.now.peers.single().label)
    }

    @Test
    public fun `pairing shows a code and the desktop's invitation for an Android phone`(): Unit = runTest {
        val store = FakeHostStore()
        val model = connections(store)
        assertEquals(ConnectionsModel.Summary.STOPPED, model.now.summary)

        model.pair()
        advanceUntilIdle()

        assertEquals("pair:${ConnectionsModel.DEFAULT_RELAY}", store.calls.last { it.startsWith("pair") })
        assertTrue(model.now.activeHost)
        assertEquals(ConnectionsModel.Summary.READY_TO_PAIR, model.now.summary)
        assertEquals("482913", model.now.pairingCode)
        assertEquals(
            "chromvoid://pair-mobile?session_id=session%201" +
                "&relay_base_url=wss%3A%2F%2Frelay.chromvoid.com&device_label=Pixel" +
                "&expires_at_ms=1900000000000&platform=android",
            model.now.invitation,
        )
        model.changeRelay("wss://elsewhere.test")
        assertEquals(ConnectionsModel.DEFAULT_RELAY, model.now.relayUrl)
        model.copyPairingCode()
        assertEquals("482913" to true, clipboard.copies.single())
        assertTrue(model.now.codeCopied)
    }

    @Test
    public fun `a computer that pairs is trusted and connected, and the code goes`(): Unit = runTest {
        val store = FakeHostStore()
        val model = connections(store)
        model.pair()
        advanceUntilIdle()

        store.computerPairs()
        advanceUntilIdle()

        assertEquals(ConnectionsModel.Summary.DEVICE_CONNECTED, model.now.summary)
        assertNull(model.now.pairingCode)
        assertTrue(model.now.isConnected("desk"))
        assertTrue(model.now.savedEnabled)
        assertEquals("Work laptop", model.now.peers.single().label)
    }

    @Test
    public fun `a relay Rust refuses asks for the address again`(): Unit = runTest {
        val store = FakeHostStore()
        val model = connections(store)

        model.changeRelay("https://relay.example.test")
        model.pair()
        advanceUntilIdle()

        assertEquals(ConnectionsModel.Issue.RELAY, model.now.issue)
        assertEquals(1, model.now.validationRevision)
        assertFalse(model.now.activeHost)
        assertFalse(model.now.busy)
        model.changeRelay("wss://relay.example.test")
        assertNull(model.now.issue)
        model.submitRelay()
        advanceUntilIdle()
        assertEquals("pair:wss://relay.example.test", store.calls.last { it.startsWith("pair") })
    }

    @Test
    public fun `with a computer trusted the host listens, and stopping forgets that it was on`(): Unit = runTest {
        val store = FakeHostStore()
        store.peers += AirHostPeer("desk", "Work laptop", "desktop")
        val model = connections(store)

        model.submitRelay()
        advanceUntilIdle()
        assertEquals("listen:${ConnectionsModel.DEFAULT_RELAY}", store.calls.last { it.startsWith("listen") })
        assertEquals(ConnectionsModel.Summary.LISTENING, model.now.summary)

        model.stop()
        advanceUntilIdle()
        assertFalse(model.now.activeHost)
        assertFalse(model.now.savedEnabled)
        assertEquals(ConnectionsModel.Summary.STOPPED, model.now.summary)

        store.failNext = IOException("offline")
        model.start()
        advanceUntilIdle()
        assertEquals(ConnectionsModel.Issue.OPERATION, model.now.issue)
    }

    @Test
    public fun `a computer is revoked only after the person confirms`(): Unit = runTest {
        val store = FakeHostStore()
        val model = connections(store)
        model.pair()
        advanceUntilIdle()
        store.computerPairs()
        advanceUntilIdle()
        val peer = model.now.peers.single()

        model.requestRevoke(peer)
        assertEquals(peer, model.now.revokeCandidate)
        model.cancelRevoke()
        assertTrue(store.calls.none { it.startsWith("revoke") })

        model.requestRevoke(peer)
        model.confirmRevoke()
        advanceUntilIdle()
        assertEquals("revoke:desk", store.calls.first { it.startsWith("revoke") })
        assertTrue(model.now.peers.isEmpty())
        assertFalse(model.now.isConnected("desk"))
        assertEquals(ConnectionsModel.Summary.LISTENING, model.now.summary)

        store.peers += peer
        store.change { }
        advanceUntilIdle()
        store.failNext = IOException("lost")
        model.requestRevoke(peer)
        model.confirmRevoke()
        advanceUntilIdle()
        assertEquals(ConnectionsModel.Issue.REVOKE, model.now.issue)
        assertFalse(model.now.busy)
    }

    @Test
    public fun `an expired code and an interrupted host say what to do`(): Unit = runTest {
        val store = FakeHostStore()
        val model = connections(store)
        model.pair()
        advanceUntilIdle()

        store.change {
            phase = AirHostPhase.PAIRING_EXPIRED
            pin = null
            offer = null
        }
        advanceUntilIdle()
        assertEquals(ConnectionsModel.Summary.EXPIRED, model.now.summary)
        assertFalse(model.now.activeHost)

        store.change { phase = AirHostPhase.ERROR }
        advanceUntilIdle()
        assertEquals(ConnectionsModel.Summary.INTERRUPTED, model.now.summary)
    }

    @Test
    public fun `a failed read offers another try, a lost session pauses and a new one reads again`(): Unit = runTest {
        val store = FakeHostStore()
        store.failNext = IOException("offline")
        val model = connections(store)
        assertEquals(ConnectionsModel.Phase.FAILED, model.now.phase)
        assertEquals(ConnectionsModel.Issue.UNAVAILABLE, model.now.issue)
        assertEquals(ConnectionsModel.Summary.UNAVAILABLE, model.now.summary)

        model.reload()
        advanceUntilIdle()
        assertEquals(ConnectionsModel.Phase.READY, model.now.phase)
        assertEquals("snapshot", store.calls[store.calls.size - 3])

        model.synchronize(null, vaultOpen = false)
        assertEquals(ConnectionsModel.Phase.SUSPENDED, model.now.phase)
        assertNull(model.now.snapshot)
        model.pair()
        advanceUntilIdle()
        assertTrue(store.calls.none { it.startsWith("pair") })

        model.synchronize(8uL, vaultOpen = true)
        advanceUntilIdle()
        assertEquals(ConnectionsModel.Phase.READY, model.now.phase)
        assertEquals("resume", store.calls[store.calls.size - 3])
        model.synchronize(8uL, vaultOpen = false)
        assertFalse(model.now.vaultOpen)
        assertEquals(ConnectionsModel.Phase.READY, model.now.phase)
    }

    @Test
    public fun `a revoked session stops the page following the host`(): Unit = runTest {
        val store = FakeHostStore()
        val model = connections(store)

        store.failNext = BridgeException.SessionRevoked()
        store.change { phase = AirHostPhase.PAIRING }
        advanceUntilIdle()

        assertEquals(ConnectionsModel.Phase.FAILED, model.now.phase)
        assertNull(model.now.snapshot)
    }

    @Test
    public fun `a computer on the cable asking to pair is allowed before its PIN, or turned away`(): Unit = runTest {
        val store = FakeHostStore()
        val model = connections(store)
        store.desktopAsksToPair(pin = "305172")
        advanceUntilIdle()
        assertEquals("305172", model.now.usb?.pairing?.pin)
        assertEquals(AirUsbLinkState.PAIRING, model.now.usb?.state)

        model.answerUsbPairing(allow = true)
        advanceUntilIdle()
        assertEquals("usb:pairing:pairing-1:true", store.calls.last { it.startsWith("usb") })
        assertEquals(true, model.now.usb?.pairing?.allowed)

        model.answerUsbPairing(allow = false)
        advanceUntilIdle()
        assertEquals("usb:pairing:pairing-1:false", store.calls.last { it.startsWith("usb") })
        assertNull(model.now.usb)
    }

    @Test
    public fun `a trusted computer on the cable is let in, and a closed session answers nothing`(): Unit = runTest {
        val store = FakeHostStore()
        val model = connections(store)
        store.desktopAsksForSession()
        advanceUntilIdle()
        assertEquals("Studio Mac", model.now.usb?.session?.desktop)

        model.answerUsbSession(allow = true)
        advanceUntilIdle()
        assertEquals(AirUsbLinkState.CONNECTED, model.now.usb?.state)
        assertNull(model.now.usb?.session)

        model.suspend()
        store.desktopAsksForSession()
        model.answerUsbSession(allow = false)
        advanceUntilIdle()
        assertTrue(store.calls.none { it == "usb:session:session-1:false" })
    }
}
