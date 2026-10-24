package com.chromvoid.air.session

import android.app.Application
import android.app.Notification
import android.app.NotificationManager
import android.content.Intent
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.air.ffi.AirHostConnection
import com.chromvoid.air.ffi.AirHostConnectionState
import com.chromvoid.air.ffi.AirHostPeer
import com.chromvoid.air.ffi.AirHostPhase
import com.chromvoid.air.ffi.AirHostPreferences
import com.chromvoid.air.ffi.AirHostSnapshot
import com.chromvoid.air.ffi.AirUsbApprovalKind
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.connections.HostStore
import com.chromvoid.app.ConnectionForegroundService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
public class HostForegroundTest {
    private val context: Application = ApplicationProvider.getApplicationContext()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val session = MutableStateFlow<AirSessionState>(AirSessionState.Unlocked(1uL))
    private val host = Host()

    @After
    public fun tearDown() {
        scope.cancel()
        ConnectionForegroundService.stop(context)
        ConnectionForegroundService.installNetworkStopListener(null)
    }

    private fun idle() = shadowOf(Looper.getMainLooper()).idle()

    private fun nextStarted(): Intent? = shadowOf(context).nextStartedService

    private fun action(name: String): Intent = Intent(context, ConnectionForegroundService::class.java).setAction(name)

    @Test
    public fun `the service runs exactly while the host is on and names the computer connected`() {
        HostForeground(context, host, session, scope)
        idle()
        assertNull(nextStarted())

        host.change { phase = AirHostPhase.PAIRING }
        idle()
        val started = checkNotNull(nextStarted())
        assertEquals(ConnectionForegroundService.ACTION_START, started.action)
        assertNull(started.getStringExtra(ConnectionForegroundService.EXTRA_DEVICE_NAME))

        host.change {
            phase = AirHostPhase.READY
            connected = listOf(AirHostConnection("desk", "Work laptop", "wss_relay"))
        }
        idle()
        assertNull(nextStarted())
        val posted = shadowOf(context.getSystemService(NotificationManager::class.java))
            .getNotification(ConnectionForegroundService.NOTIFICATION_ID)
        assertEquals("Connected to Work laptop", posted.extras.getString(Notification.EXTRA_TITLE))

        host.change {
            phase = AirHostPhase.IDLE
            connected = emptyList()
        }
        idle()
        assertEquals(SERVICE, shadowOf(context).nextStoppedService.component?.className)
        assertTrue(host.stops == 0)
    }

    @Test
    public fun `the notification's action stops the host, and a locked-out runtime lets go`() {
        HostForeground(context, host, session, scope)
        host.change { phase = AirHostPhase.READY }
        idle()
        checkNotNull(nextStarted())
        val service = Robolectric.buildService(ConnectionForegroundService::class.java).create().get()
        service.onStartCommand(action(ConnectionForegroundService.ACTION_START), 0, 1)

        service.onStartCommand(action(ConnectionForegroundService.ACTION_DISCONNECT), 0, 2)
        idle()
        assertEquals(1, host.stops)

        host.change { phase = AirHostPhase.READY }
        idle()
        checkNotNull(nextStarted())
        session.value = AirSessionState.Unavailable("HostUnavailable")
        idle()
        assertEquals(SERVICE, shadowOf(context).nextStoppedService.component?.className)
    }

    private companion object {
        val SERVICE: String = ConnectionForegroundService::class.java.name
    }

    /** A host whose every change advances its sequence, which a long poll waits on. */
    private class Host : HostStore {
        var phase = AirHostPhase.IDLE
        var connected: List<AirHostConnection> = emptyList()
        var stops = 0
        private val sequence = MutableStateFlow(1uL)

        fun change(block: Host.() -> Unit) {
            block()
            sequence.value += 1uL
        }

        private fun current() = AirHostSnapshot(
            sequence.value,
            phase,
            AirHostConnectionState.LISTENING,
            null,
            null,
            null,
            null,
            null,
            null,
            connected,
            null,
        )

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

        override suspend fun stop(): AirHostSnapshot {
            stops++
            change {
                phase = AirHostPhase.IDLE
                connected = emptyList()
            }
            return current()
        }

        override suspend fun revokePeer(peerId: String) = Unit

        override suspend fun answerUsb(kind: AirUsbApprovalKind, attemptId: String, allow: Boolean): Boolean = false
    }
}
