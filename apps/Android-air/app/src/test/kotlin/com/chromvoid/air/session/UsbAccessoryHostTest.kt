package com.chromvoid.air.session

import android.app.Application
import android.app.NotificationManager
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.air.bridge.AirSessionRuntime
import com.chromvoid.air.ffi.AirHost
import com.chromvoid.air.ffi.AirHostConnectionState
import com.chromvoid.air.ffi.AirHostPeer
import com.chromvoid.air.ffi.AirHostPhase
import com.chromvoid.air.ffi.AirHostPreferences
import com.chromvoid.air.ffi.AirHostSnapshot
import com.chromvoid.air.ffi.AirPhase
import com.chromvoid.air.ffi.AirUsbApprovalKind
import com.chromvoid.air.ffi.AirUsbLinkState
import com.chromvoid.air.ffi.AirUsbPairingRequest
import com.chromvoid.air.ffi.AirUsbSessionRequest
import com.chromvoid.air.ffi.AirUsbStatus
import com.chromvoid.air.ffi.NoHandle
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.app.shared.UsbApprovalNotificationFactory
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
public class UsbAccessoryHostTest {
    private val context: Application = ApplicationProvider.getApplicationContext()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val session = MutableStateFlow<AirSessionState>(AirSessionState.Locked)
    private val hosts = Hosts()
    private val ends = mutableListOf<Pair<String, String>>()
    private var listened = 0

    private fun accessory() = UsbAccessoryHost(
        context,
        hosts,
        { "Pixel" },
        session,
        scope,
        ended = { _, id, reason -> ends += id to reason },
        listen = { listened++ },
    )

    @Before
    public fun inBackground() {
        UsbApprovalNotificationFactory.setAppInForeground(context, false)
    }

    @After
    public fun tearDown() {
        scope.cancel()
        UsbApprovalNotificationFactory.cancel(context)
    }

    private fun idle() = shadowOf(Looper.getMainLooper()).idle()

    private fun shown(): List<String> = shadowOf(context.getSystemService(NotificationManager::class.java))
        .allNotifications
        .map { it.extras.getCharSequence(android.app.Notification.EXTRA_TITLE).toString() }

    @Test
    public fun `a session the host takes reports its end to the platform, one it refuses leaves the descriptor`() {
        val accessory = accessory()
        hosts.accepts = false
        assertFalse(accessory.startAccessorySession("refused", 41, "{}"))
        assertTrue(hosts.started.isEmpty())

        hosts.accepts = true
        assertTrue(accessory.startAccessorySession("taken", 42, "{}"))
        assertEquals(listOf(Triple("taken", 42, "Pixel")), hosts.started)
        idle()
        assertTrue(ends.isEmpty())
        hosts.end.complete("client_disconnected")
        idle()
        assertEquals(listOf("taken" to "client_disconnected"), ends)

        accessory.stopAccessorySession("taken", "accessory_detached")
        assertEquals(listOf("taken" to "accessory_detached"), hosts.stopped)
    }

    @Test
    public fun `a cable plugged in before the session was ready is listened for once it is`() {
        session.value = AirSessionState.Starting
        hosts.ready = false
        val accessory = accessory()
        idle()
        assertFalse(accessory.isReadyForAccessory())
        assertEquals(0, listened)
        hosts.ready = true
        assertFalse(accessory.isReadyForAccessory())
        session.value = AirSessionState.Locked
        assertTrue(accessory.isReadyForAccessory())
        idle()
        assertEquals(1, listened)
        session.value = AirSessionState.Unlocked(1uL)
        assertTrue(accessory.isReadyForAccessory())
        idle()
        assertEquals("unlocking is the same open session", 1, listened)
        hosts.ready = false
        assertFalse(accessory.isReadyForAccessory())
    }

    @Test
    public fun `readiness requires an open runtime and an admissible runtime phase`() {
        var current: AirSessionRuntime? = null
        val store = SessionHostStore(runtime = { current })
        assertFalse(store.isReadyForAccessory())

        var snapshot = FakeSessionRuntime().snapshot()
        current = object : AirSessionRuntime by FakeSessionRuntime() {
            override fun snapshot() = snapshot

            override fun host() = object : AirHost(NoHandle) {
                override fun snapshot() = hosts.current()
            }
        }
        assertTrue(store.isReadyForAccessory())
        snapshot = snapshot.copy(phase = AirPhase.UNLOCKED)
        assertTrue(store.isReadyForAccessory())
        snapshot = snapshot.copy(phase = AirPhase.INACTIVE)
        assertFalse(store.isReadyForAccessory())
        snapshot = snapshot.copy(phase = AirPhase.LOCKED, cleanupPending = true)
        assertFalse(store.isReadyForAccessory())
    }

    @Test
    public fun `answers from a notification reach the host by kind, and nothing else does`() {
        val accessory = accessory()
        assertTrue(accessory.resolveApproval("session", "attempt-1", true))
        assertTrue(accessory.resolveApproval("pairing", "attempt-2", false))
        assertFalse(accessory.resolveApproval("other", "attempt-3", true))
        assertEquals(
            listOf(
                Triple(AirUsbApprovalKind.SESSION, "attempt-1", true),
                Triple(AirUsbApprovalKind.PAIRING, "attempt-2", false),
            ),
            hosts.answers,
        )
    }

    @Test
    public fun `a question on the cable waits in one notification until it is answered`() {
        accessory()
        idle()
        assertTrue(shown().isEmpty())

        hosts.change { usb = pairingAsked }
        idle()
        assertEquals(listOf("USB pairing request"), shown())
        hosts.change { usb = sessionAsked }
        idle()
        assertEquals(listOf("USB connection request"), shown())
        hosts.change { usb = null }
        idle()
        assertTrue(shown().isEmpty())

        // No session, no question.
        hosts.change { usb = pairingAsked }
        session.value = AirSessionState.NeedsAdministrator
        idle()
        assertTrue(shown().isEmpty())
    }

    private val pairingAsked = AirUsbStatus(
        state = AirUsbLinkState.PAIRING,
        desktop = "Studio Mac",
        pairing = AirUsbPairingRequest("pairing-1", "305172", "Studio Mac", "0f1e", 5u, 1uL, false),
        session = null,
    )

    private val sessionAsked = AirUsbStatus(
        state = AirUsbLinkState.AWAITING_APPROVAL,
        desktop = "Studio Mac",
        pairing = null,
        session = AirUsbSessionRequest("session-1", "Studio Mac", 1uL),
    )

    private class Hosts : UsbAccessoryHosts {
        var ready = true
        var accepts = true
        val started = mutableListOf<Triple<String, Int, String>>()
        val stopped = mutableListOf<Pair<String, String>>()
        val answers = mutableListOf<Triple<AirUsbApprovalKind, String, Boolean>>()
        val end = CompletableDeferred<String>()
        var usb: AirUsbStatus? = null
        private val sequence = MutableStateFlow(1uL)

        fun change(block: Hosts.() -> Unit) {
            block()
            sequence.value += 1uL
        }

        fun current() = AirHostSnapshot(
            sequence = sequence.value,
            phase = AirHostPhase.IDLE,
            connectionState = AirHostConnectionState.IDLE,
            relayUrl = null,
            deviceId = null,
            deviceLabel = null,
            pairingPin = null,
            pairingOffer = null,
            presenceExpiresAtMs = null,
            connectedPeers = emptyList(),
            error = null,
            usb = usb,
        )

        override fun isReadyForAccessory(): Boolean = ready

        override fun startUsbAccessory(sessionId: String, fd: Int, deviceLabel: String): Boolean {
            if (accepts) started += Triple(sessionId, fd, deviceLabel)
            return accepts
        }

        override fun stopUsbAccessory(sessionId: String, reason: String) {
            stopped += sessionId to reason
        }

        override suspend fun usbAccessoryEnded(sessionId: String): String = end.await()

        override fun resolveUsbApproval(kind: AirUsbApprovalKind, attemptId: String, allow: Boolean): Boolean {
            answers += Triple(kind, attemptId, allow)
            return true
        }

        override suspend fun snapshot(): AirHostSnapshot = current()

        override suspend fun events(afterSequence: ULong): AirHostSnapshot {
            sequence.first { it > afterSequence }
            return current()
        }

        override suspend fun preferences(): AirHostPreferences = AirHostPreferences(null, false)

        override suspend fun trustedPeers(): List<AirHostPeer> = emptyList()

        override suspend fun startListening(generation: ULong, relayUrl: String, deviceLabel: String) = current()

        override suspend fun startPairing(generation: ULong, relayUrl: String, deviceLabel: String) = current()

        override suspend fun resumeIfEnabled(generation: ULong, deviceLabel: String) = current()

        override suspend fun stop(): AirHostSnapshot = current()

        override suspend fun revokePeer(peerId: String) = Unit

        override suspend fun answerUsb(kind: AirUsbApprovalKind, attemptId: String, allow: Boolean): Boolean = false
    }
}
