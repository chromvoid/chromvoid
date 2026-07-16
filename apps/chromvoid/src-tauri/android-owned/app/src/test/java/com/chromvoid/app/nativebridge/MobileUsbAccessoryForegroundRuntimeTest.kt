package com.chromvoid.app.nativebridge

import android.content.Context
import android.content.Intent
import android.app.Application
import android.hardware.usb.UsbAccessory
import android.hardware.usb.UsbManager
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.ConnectionForegroundService
import com.chromvoid.app.MobileUsbAccessorySystemReceiver
import com.chromvoid.app.shared.ForegroundServiceSupport
import java.util.concurrent.TimeUnit
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MobileUsbAccessoryForegroundRuntimeTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @After
    fun tearDown() {
        ForegroundServiceSupport.resetForTests()
        ConnectionForegroundService.resetOwnerForTests()
        MobileUsbAccessoryForegroundRuntime.resetForTests()
    }

    @Test
    fun attachedIntentOpensSessionAndStartsUsbForegroundService() {
        val handle = FakeHandle()
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                FakeOpener(handle),
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        val startedIntents = mutableListOf<Intent>()
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, intent ->
            startedIntents += Intent(intent)
        }

        val result =
            MobileUsbAccessoryForegroundRuntime.handleIntent(
                context,
                Intent(UsbManager.ACTION_USB_ACCESSORY_ATTACHED).putExtra(
                    UsbManager.EXTRA_ACCESSORY,
                    chromVoidAccessory(),
                ),
            )

        assertEquals(MobileUsbAccessoryCoordinatorResult.Opened, result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(ConnectionForegroundService.ACTION_START_USB_ACCESSORY, startedIntents.single().action)
        assertEquals(
            "serial-1",
            startedIntents.single()
                .getStringExtra(ConnectionForegroundService.EXTRA_USB_ACCESSORY_SESSION_LABEL),
        )
    }

    @Test
    fun accessoryHandshakeIntentOpensSessionAndStartsUsbForegroundService() {
        val handle = FakeHandle()
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                FakeOpener(handle),
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        val startedIntents = mutableListOf<Intent>()
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, intent ->
            startedIntents += Intent(intent)
        }

        val result =
            MobileUsbAccessoryForegroundRuntime.handleIntent(
                context,
                Intent(MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_HANDSHAKE).putExtra(
                    UsbManager.EXTRA_ACCESSORY,
                    chromVoidAccessory(),
                ),
            )

        assertEquals(MobileUsbAccessoryCoordinatorResult.Opened, result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(ConnectionForegroundService.ACTION_START_USB_ACCESSORY, startedIntents.single().action)
    }

    @Test
    fun currentAccessoryOpensSessionWhenAttachIntentWasMissed() {
        val handle = FakeHandle()
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                FakeOpener(handle),
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        val startedIntents = mutableListOf<Intent>()
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, intent ->
            startedIntents += Intent(intent)
        }

        val result = MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)

        assertEquals(MobileUsbAccessoryCoordinatorResult.Opened, result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(ConnectionForegroundService.ACTION_START_USB_ACCESSORY, startedIntents.single().action)
    }

    @Test
    fun handshakeSystemBroadcastOpensCurrentAccessoryWithoutIntentAccessoryExtra() {
        val handle = FakeHandle()
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                FakeOpener(handle),
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        val startedIntents = mutableListOf<Intent>()
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, intent ->
            startedIntents += Intent(intent)
        }

        MobileUsbAccessorySystemReceiver().onReceive(
            context,
            Intent(MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_HANDSHAKE),
        )

        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(ConnectionForegroundService.ACTION_START_USB_ACCESSORY, startedIntents.single().action)
    }

    @Test
    fun systemAttachBroadcastOpensIntentAccessory() {
        val handle = FakeHandle()
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                FakeOpener(handle),
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        val startedIntents = mutableListOf<Intent>()
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, intent ->
            startedIntents += Intent(intent)
        }

        MobileUsbAccessorySystemReceiver().onReceive(
            context,
            Intent(UsbManager.ACTION_USB_ACCESSORY_ATTACHED).putExtra(
                UsbManager.EXTRA_ACCESSORY,
                chromVoidAccessory(),
            ),
        )

        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(ConnectionForegroundService.ACTION_START_USB_ACCESSORY, startedIntents.single().action)
    }

    @Test
    fun debugHandshakeBroadcastOpensCurrentAccessoryWithoutIntentAccessoryExtra() {
        val handle = FakeHandle()
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                FakeOpener(handle),
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        val startedIntents = mutableListOf<Intent>()
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, intent ->
            startedIntents += Intent(intent)
        }

        MobileUsbAccessorySystemReceiver().onReceive(
            context,
            Intent(MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_DEBUG_HANDSHAKE),
        )

        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(ConnectionForegroundService.ACTION_START_USB_ACCESSORY, startedIntents.single().action)
    }

    @Test
    fun debugHandshakeBroadcastDoesNotReplaceAlreadyOpenCurrentAccessory() {
        val firstHandle = FakeHandle(sessionId = "session-first")
        val secondHandle = FakeHandle(sessionId = "session-second")
        val opener = QueueOpener(firstHandle, secondHandle)
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                opener,
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        val startedIntents = mutableListOf<Intent>()
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, intent ->
            startedIntents += Intent(intent)
        }

        MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)
        MobileUsbAccessorySystemReceiver().onReceive(
            context,
            Intent(MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_DEBUG_HANDSHAKE),
        )

        assertFalse(firstHandle.closed)
        assertFalse(secondHandle.closed)
        assertEquals(listOf("session-first"), opener.openedSessionIds)
        assertEquals(1, startedIntents.size)
        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
    }

    @Test
    fun currentAccessoryIsIgnoredWhenSessionIsAlreadyOpen() {
        val handle = FakeHandle()
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                FakeOpener(handle),
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        val startedIntents = mutableListOf<Intent>()
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, intent ->
            startedIntents += Intent(intent)
        }

        MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)
        val secondResult = MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)

        assertEquals(MobileUsbAccessoryCoordinatorResult.Ignored, secondResult)
        assertEquals(1, startedIntents.size)
        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
    }

    @Test
    fun systemAccessoryHandshakeReplacesAlreadyOpenCurrentAccessory() {
        val firstHandle = FakeHandle(sessionId = "session-first")
        val secondHandle = FakeHandle(sessionId = "session-second")
        val opener = QueueOpener(firstHandle, secondHandle)
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                opener,
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        val startedIntents = mutableListOf<Intent>()
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, intent ->
            startedIntents += Intent(intent)
        }

        MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)
        val result = MobileUsbAccessoryForegroundRuntime.handleSystemAccessoryHandshake(context)

        assertEquals(MobileUsbAccessoryCoordinatorResult.Opened, result)
        assertTrue(firstHandle.closed)
        assertFalse(secondHandle.closed)
        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(listOf("session-first", "session-second"), opener.openedSessionIds)
        assertEquals(2, startedIntents.size)
    }

    @Test
    fun endedNativeSessionWithoutExplicitReasonStopsWithoutReopeningCurrentAccessory() {
        val firstHandle = FakeHandle(sessionId = "session-first")
        val secondHandle = FakeHandle(sessionId = "session-second")
        val opener = QueueOpener(firstHandle, secondHandle)
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                opener,
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, _ -> }

        MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)
        val result =
            MobileUsbAccessoryForegroundRuntime.handleNativeSessionEnded(
                context,
                "session-first",
            )

        assertEquals(MobileUsbAccessoryCoordinatorResult.Disconnected, result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Idle, coordinator.status.state)
        assertEquals(listOf("session-first"), opener.openedSessionIds)
        val stoppedService = shadowOf(context as Application).nextStoppedService
        assertEquals(ConnectionForegroundService::class.java.name, stoppedService.component?.className)
    }

    @Test
    fun endedNativeSessionWithErrorReopensCurrentAccessory() {
        val firstHandle = FakeHandle(sessionId = "session-first")
        val secondHandle = FakeHandle(sessionId = "session-second")
        val opener = QueueOpener(firstHandle, secondHandle)
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                opener,
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, _ -> }

        MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)
        val result =
            MobileUsbAccessoryForegroundRuntime.handleNativeSessionEnded(
                context,
                "session-first",
                "error",
            )

        assertEquals(MobileUsbAccessoryCoordinatorResult.Opened, result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(listOf("session-first", "session-second"), opener.openedSessionIds)
        assertNull(shadowOf(context as Application).nextStoppedService)
    }

    @Test
    fun endedNativeSessionWithErrorRetriesWhenCurrentAccessoryReopenFailsOnce() {
        val firstHandle = FakeHandle(sessionId = "session-first")
        val retryHandle = FakeHandle(sessionId = "session-retry")
        val opener = FailOnceReopenOpener(firstHandle, retryHandle)
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                opener,
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, _ -> }

        MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)
        val result =
            MobileUsbAccessoryForegroundRuntime.handleNativeSessionEnded(
                context,
                "session-first",
                "error",
            )

        assertEquals(MobileUsbAccessoryCoordinatorResult.Error("ERR_USB_MOBILE_OPEN_FAILED"), result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Error, coordinator.status.state)
        assertEquals(listOf("session-first"), opener.openedSessionIds)
        assertEquals(2, opener.openCalls)
        assertNull(shadowOf(context as Application).nextStoppedService)

        shadowOf(Looper.getMainLooper()).idleFor(201, TimeUnit.MILLISECONDS)

        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(listOf("session-first", "session-retry"), opener.openedSessionIds)
        assertEquals(3, opener.openCalls)
        assertNull(shadowOf(context as Application).nextStoppedService)
    }

    @Test
    fun nativeShellSessionEndedWithTransportClosedReopensCurrentAccessory() {
        val firstHandle = FakeHandle(sessionId = "session-first")
        val secondHandle = FakeHandle(sessionId = "session-second")
        val opener = QueueOpener(firstHandle, secondHandle)
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                opener,
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, _ -> }

        MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)
        MobileUsbAccessoryNativeShell.onNativeAccessorySessionEnded(
            context,
            "session-first",
            "transport_closed",
        )

        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(listOf("session-first", "session-second"), opener.openedSessionIds)
        assertNull(shadowOf(context as Application).nextStoppedService)
    }

    @Test
    fun nativeShellSessionEndedWithPeerClosedReopensCurrentAccessory() {
        val firstHandle = FakeHandle(sessionId = "session-first")
        val secondHandle = FakeHandle(sessionId = "session-second")
        val opener = QueueOpener(firstHandle, secondHandle)
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                opener,
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, _ -> }

        MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)
        MobileUsbAccessoryNativeShell.onNativeAccessorySessionEnded(
            context,
            "session-first",
            "peer_closed",
        )

        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(listOf("session-first", "session-second"), opener.openedSessionIds)
        assertNull(shadowOf(context as Application).nextStoppedService)
    }

    @Test
    fun nativeShellSessionEndedWithVaultLockedReopensCurrentAccessory() {
        val firstHandle = FakeHandle(sessionId = "session-first")
        val secondHandle = FakeHandle(sessionId = "session-second")
        val opener = QueueOpener(firstHandle, secondHandle)
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                opener,
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, _ -> }

        MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)
        MobileUsbAccessoryNativeShell.onNativeAccessorySessionEnded(
            context,
            "session-first",
            "vault_locked",
        )

        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(listOf("session-first", "session-second"), opener.openedSessionIds)
        assertNull(shadowOf(context as Application).nextStoppedService)
    }

    @Test
    fun nativeShellSessionEndedWithPairingCompleteReopensCurrentAccessory() {
        val firstHandle = FakeHandle(sessionId = "session-first")
        val secondHandle = FakeHandle(sessionId = "session-second")
        val opener = QueueOpener(firstHandle, secondHandle)
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                opener,
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, _ -> }

        MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)
        MobileUsbAccessoryNativeShell.onNativeAccessorySessionEnded(
            context,
            "session-first",
            "pairing_complete",
        )

        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(listOf("session-first", "session-second"), opener.openedSessionIds)
        assertNull(shadowOf(context as Application).nextStoppedService)
    }

    @Test
    fun nativeShellSessionEndedWithPairingCompleteReopensSessionAccessoryWhenCurrentAccessoryIsUnavailable() {
        val firstHandle = FakeHandle(sessionId = "session-first")
        val secondHandle = FakeHandle(sessionId = "session-second")
        val opener = QueueOpener(firstHandle, secondHandle)
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                opener,
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, _ -> }
        val accessory = chromVoidAccessory()

        MobileUsbAccessoryForegroundRuntime.handleIntent(
            context,
            Intent(UsbManager.ACTION_USB_ACCESSORY_ATTACHED).putExtra(
                UsbManager.EXTRA_ACCESSORY,
                accessory,
            ),
        )
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests { null }
        MobileUsbAccessoryNativeShell.onNativeAccessorySessionEnded(
            context,
            "session-first",
            "pairing_complete",
        )

        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(listOf("session-first", "session-second"), opener.openedSessionIds)
        assertNull(shadowOf(context as Application).nextStoppedService)
    }

    @Test
    fun nativeShellSessionEndedWithStreamTimeoutReopensCurrentAccessory() {
        val firstHandle = FakeHandle(sessionId = "session-first")
        val secondHandle = FakeHandle(sessionId = "session-second")
        val opener = QueueOpener(firstHandle, secondHandle)
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                opener,
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, _ -> }

        MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)
        MobileUsbAccessoryNativeShell.onNativeAccessorySessionEnded(
            context,
            "session-first",
            "stream_timeout",
        )

        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(listOf("session-first", "session-second"), opener.openedSessionIds)
        assertNull(shadowOf(context as Application).nextStoppedService)
    }

    @Test
    fun nativeShellSessionEndedWithDataPlaneErrorReopensCurrentAccessory() {
        val firstHandle = FakeHandle(sessionId = "session-first")
        val secondHandle = FakeHandle(sessionId = "session-second")
        val opener = QueueOpener(firstHandle, secondHandle)
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                opener,
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, _ -> }

        MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)
        MobileUsbAccessoryNativeShell.onNativeAccessorySessionEnded(
            context,
            "session-first",
            "data_plane_error",
        )

        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(listOf("session-first", "session-second"), opener.openedSessionIds)
        assertNull(shadowOf(context as Application).nextStoppedService)
    }

    @Test
    fun nativeShellSessionEndedWithPairingCompleteRetriesRecoverableReopenFailure() {
        val firstHandle = FakeHandle(sessionId = "session-first")
        val retryHandle = FakeHandle(sessionId = "session-retry")
        val opener = FailOnceReopenOpener(firstHandle, retryHandle)
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                opener,
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, _ -> }
        val accessory = chromVoidAccessory()

        MobileUsbAccessoryForegroundRuntime.handleIntent(
            context,
            Intent(UsbManager.ACTION_USB_ACCESSORY_ATTACHED).putExtra(
                UsbManager.EXTRA_ACCESSORY,
                accessory,
            ),
        )
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests { null }
        val result =
            MobileUsbAccessoryForegroundRuntime.handleNativeSessionEnded(
                context,
                "session-first",
                "pairing_complete",
            )

        assertEquals(MobileUsbAccessoryCoordinatorResult.Error("ERR_USB_MOBILE_OPEN_FAILED"), result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Error, coordinator.status.state)
        assertEquals(listOf("session-first"), opener.openedSessionIds)
        assertEquals(2, opener.openCalls)
        assertNull(shadowOf(context as Application).nextStoppedService)

        shadowOf(Looper.getMainLooper()).idleFor(201, TimeUnit.MILLISECONDS)

        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(listOf("session-first", "session-retry"), opener.openedSessionIds)
        assertEquals(3, opener.openCalls)
        assertNull(shadowOf(context as Application).nextStoppedService)
    }

    @Test
    fun nativeShellSessionEndedWithPairingCompleteAndMissingAccessoryDoesNotReopen() {
        val firstHandle = FakeHandle(sessionId = "session-first")
        val secondHandle = FakeHandle(sessionId = "session-second")
        val opener = QueueOpener(firstHandle, secondHandle)
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                opener,
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests { null }
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, _ -> }

        MobileUsbAccessoryForegroundRuntime.handleIntent(
            context,
            Intent(UsbManager.ACTION_USB_ACCESSORY_ATTACHED).putExtra(
                UsbManager.EXTRA_ACCESSORY,
                chromVoidAccessory(),
            ),
        )
        val result =
            MobileUsbAccessoryForegroundRuntime.handleNativeSessionEnded(
                context,
                "missing-session",
                "pairing_complete",
            )

        assertEquals(MobileUsbAccessoryCoordinatorResult.Ignored, result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(listOf("session-first"), opener.openedSessionIds)
        assertNull(shadowOf(context as Application).nextStoppedService)
    }

    @Test
    fun endedNativeSessionWithAccessoryDetachedReopensCurrentAccessory() {
        val firstHandle = FakeHandle(sessionId = "session-first")
        val secondHandle = FakeHandle(sessionId = "session-second")
        val opener = QueueOpener(firstHandle, secondHandle)
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                opener,
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, _ -> }

        MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)
        val result =
            MobileUsbAccessoryForegroundRuntime.handleNativeSessionEnded(
                context,
                "session-first",
                "accessory_detached",
            )

        assertEquals(MobileUsbAccessoryCoordinatorResult.Opened, result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(listOf("session-first", "session-second"), opener.openedSessionIds)
        assertNull(shadowOf(context as Application).nextStoppedService)
    }

    @Test
    fun endedNativeSessionAfterExplicitDisconnectDoesNotReopenCurrentAccessory() {
        val handle = FakeHandle(sessionId = "session-first")
        val opener = QueueOpener(handle)
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                opener,
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)
        coordinator.disconnect()

        val result =
            MobileUsbAccessoryForegroundRuntime.handleNativeSessionEnded(
                context,
                "session-first",
                "explicit_disconnect",
            )

        assertEquals(MobileUsbAccessoryCoordinatorResult.Ignored, result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Idle, coordinator.status.state)
        assertEquals(listOf("session-first"), opener.openedSessionIds)
        assertTrue(handle.closed)
    }

    @Test
    fun endedNativeSessionWithLegacyShutdownStopsServiceWithoutReopeningCurrentAccessory() {
        val firstHandle = FakeHandle(sessionId = "session-first")
        val secondHandle = FakeHandle(sessionId = "session-second")
        val opener = QueueOpener(firstHandle, secondHandle)
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                opener,
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, _ -> }

        MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)
        val result =
            MobileUsbAccessoryForegroundRuntime.handleNativeSessionEnded(
                context,
                "session-first",
                "shutdown",
            )

        assertEquals(MobileUsbAccessoryCoordinatorResult.Disconnected, result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Idle, coordinator.status.state)
        assertEquals(listOf("session-first"), opener.openedSessionIds)
        val stoppedService = shadowOf(context as Application).nextStoppedService
        assertEquals(ConnectionForegroundService::class.java.name, stoppedService.component?.className)
    }

    @Test
    fun foregroundStartFailureDisconnectsOpenedSession() {
        val handle = FakeHandle()
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                FakeOpener(handle),
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, _ ->
            throw SecurityException("denied")
        }

        val result =
            MobileUsbAccessoryForegroundRuntime.handleIntent(
                context,
                Intent(UsbManager.ACTION_USB_ACCESSORY_ATTACHED).putExtra(
                    UsbManager.EXTRA_ACCESSORY,
                    chromVoidAccessory(),
                ),
            )

        assertEquals(MobileUsbAccessoryCoordinatorResult.Opened, result)
        assertTrue(handle.closed)
        assertEquals(MobileUsbAccessoryCoordinatorState.Idle, coordinator.status.state)
        assertNull(ConnectionForegroundService.activeOwnerForTests())
    }

    @Test
    fun detachedIntentReopensWhenCurrentAccessoryIsStillPresent() {
        val firstHandle = FakeHandle(sessionId = "session-first")
        val secondHandle = FakeHandle(sessionId = "session-second")
        val opener = QueueOpener(firstHandle, secondHandle)
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                opener,
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, intent ->
            if (intent.action != ConnectionForegroundService.ACTION_START_USB_ACCESSORY) {
                throw AssertionError("unexpected foreground start action ${intent.action}")
            }
        }

        MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)
        val result =
            MobileUsbAccessoryForegroundRuntime.handleIntent(
                context,
                Intent(UsbManager.ACTION_USB_ACCESSORY_DETACHED).putExtra(
                    UsbManager.EXTRA_ACCESSORY,
                    chromVoidAccessory(),
                ),
            )

        assertEquals(MobileUsbAccessoryCoordinatorResult.Opened, result)
        assertTrue(firstHandle.closed)
        assertFalse(secondHandle.closed)
        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(listOf("session-first", "session-second"), opener.openedSessionIds)
        assertNull(shadowOf(context as Application).nextStoppedService)
    }

    @Test
    fun detachedIntentRetriesWhenCurrentAccessoryReopenFailsOnce() {
        val firstHandle = FakeHandle(sessionId = "session-first")
        val retryHandle = FakeHandle(sessionId = "session-retry")
        val opener = FailOnceReopenOpener(firstHandle, retryHandle)
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                opener,
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests {
            chromVoidAccessory()
        }
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, _ -> }

        MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context)
        val result =
            MobileUsbAccessoryForegroundRuntime.handleIntent(
                context,
                Intent(UsbManager.ACTION_USB_ACCESSORY_DETACHED).putExtra(
                    UsbManager.EXTRA_ACCESSORY,
                    chromVoidAccessory(),
                ),
            )

        assertEquals(MobileUsbAccessoryCoordinatorResult.Error("ERR_USB_MOBILE_OPEN_FAILED"), result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Error, coordinator.status.state)
        assertEquals(listOf("session-first"), opener.openedSessionIds)
        assertEquals(2, opener.openCalls)
        assertNull(shadowOf(context as Application).nextStoppedService)

        shadowOf(Looper.getMainLooper()).idleFor(201, TimeUnit.MILLISECONDS)

        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(listOf("session-first", "session-retry"), opener.openedSessionIds)
        assertEquals(3, opener.openCalls)
        assertNull(shadowOf(context as Application).nextStoppedService)
    }

    @Test
    fun detachedIntentClosesSessionAndStopsForegroundService() {
        val handle = FakeHandle()
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                FakeOpener(handle),
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, intent ->
            if (intent.action != ConnectionForegroundService.ACTION_START_USB_ACCESSORY) {
                throw AssertionError("unexpected foreground start action ${intent.action}")
            }
        }
        MobileUsbAccessoryForegroundRuntime.handleIntent(
            context,
            Intent(UsbManager.ACTION_USB_ACCESSORY_ATTACHED).putExtra(
                UsbManager.EXTRA_ACCESSORY,
                chromVoidAccessory(),
            ),
        )

        val result =
            MobileUsbAccessoryForegroundRuntime.handleIntent(
                context,
                Intent(UsbManager.ACTION_USB_ACCESSORY_DETACHED).putExtra(
                    UsbManager.EXTRA_ACCESSORY,
                    chromVoidAccessory(),
                ),
            )

        assertEquals(MobileUsbAccessoryCoordinatorResult.Detached, result)
        assertTrue(handle.closed)
        val stoppedService = shadowOf(context as Application).nextStoppedService
        assertEquals(ConnectionForegroundService::class.java.name, stoppedService.component?.className)
    }

    @Test
    fun ignoredIntentDoesNotStartForegroundService() {
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                FakeOpener(),
            )
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        val startedIntents = mutableListOf<Intent>()
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, intent ->
            startedIntents += Intent(intent)
        }

        val result =
            MobileUsbAccessoryForegroundRuntime.handleIntent(
                context,
                Intent("com.chromvoid.app.UNRELATED"),
            )

        assertEquals(MobileUsbAccessoryCoordinatorResult.Ignored, result)
        assertTrue(startedIntents.isEmpty())
    }

    private class FakeGateway(
        private val hasPermission: Boolean,
    ) : MobileUsbAccessoryPermissionGateway {
        override fun hasPermission(accessory: UsbAccessory): Boolean = hasPermission

        override fun requestPermission(accessory: UsbAccessory) = Unit
    }

    private class FakeOpener(
        private val handle: FakeHandle = FakeHandle(),
    ) : MobileUsbAccessorySessionOpener {
        override fun open(
            accessory: UsbAccessory,
            identity: MobileUsbAccessoryIdentity,
        ): MobileUsbAccessorySessionHandle = handle
    }

    private class QueueOpener(
        private vararg val handles: FakeHandle,
    ) : MobileUsbAccessorySessionOpener {
        private var nextIndex = 0
        val openedSessionIds = mutableListOf<String>()

        override fun open(
            accessory: UsbAccessory,
            identity: MobileUsbAccessoryIdentity,
        ): MobileUsbAccessorySessionHandle {
            val handle = handles.getOrNull(nextIndex)
                ?: throw IllegalStateException("no fake handle queued")
            nextIndex += 1
            openedSessionIds += handle.sessionId
            return handle
        }
    }

    private class FailOnceReopenOpener(
        private val firstHandle: FakeHandle,
        private val retryHandle: FakeHandle,
    ) : MobileUsbAccessorySessionOpener {
        var openCalls = 0
            private set
        val openedSessionIds = mutableListOf<String>()

        override fun open(
            accessory: UsbAccessory,
            identity: MobileUsbAccessoryIdentity,
        ): MobileUsbAccessorySessionHandle {
            openCalls += 1
            val handle =
                when (openCalls) {
                    1 -> firstHandle
                    2 -> throw IllegalStateException("accessory fd is not ready yet")
                    3 -> retryHandle
                    else -> throw IllegalStateException("unexpected open call $openCalls")
                }
            openedSessionIds += handle.sessionId
            return handle
        }
    }

    private class FakeHandle(
        override val sessionId: String = "session-1",
    ) : MobileUsbAccessorySessionHandle {
        var closed = false

        override fun close(reason: MobileUsbAccessorySessionStopReason) {
            closed = true
        }
    }

    private fun chromVoidAccessory(serial: String = "serial-1"): UsbAccessory {
        val constructor =
            UsbAccessory::class.java.getConstructor(
                String::class.java,
                String::class.java,
                String::class.java,
                String::class.java,
                String::class.java,
                String::class.java,
            )
        return constructor.newInstance(
            MobileUsbAccessoryIntentContract.MANUFACTURER,
            MobileUsbAccessoryIntentContract.MODEL,
            MobileUsbAccessoryIntentContract.DESCRIPTION,
            MobileUsbAccessoryIntentContract.VERSION,
            MobileUsbAccessoryIntentContract.URI,
            serial,
        )
    }
}
