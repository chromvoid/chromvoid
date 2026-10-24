package com.chromvoid.app.nativebridge

import android.content.Context
import android.hardware.usb.UsbAccessory
import android.util.Log
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.ConnectionForegroundService
import com.chromvoid.app.shared.ForegroundServiceSupport
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowLog

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MobileUsbAccessoryCoordinatorTest {
    @After
    fun tearDown() {
        ForegroundServiceSupport.resetForTests()
        ConnectionForegroundService.resetOwnerForTests()
        MobileUsbAccessoryForegroundRuntime.resetForTests()
    }

    @Test
    fun attachWithoutPermissionRequestsPermissionEvenBeforeHostIsReady() {
        val gateway = FakeGateway(hasPermission = false)
        val opener = FakeOpener().apply { ready = false }
        val coordinator = MobileUsbAccessoryCoordinator(gateway, opener)
        val accessory = chromVoidAccessory()

        val result = coordinator.onAccessoryAttached(accessory)

        assertEquals(MobileUsbAccessoryCoordinatorResult.PermissionRequested, result)
        assertEquals(MobileUsbAccessoryCoordinatorState.PermissionRequested, coordinator.status.state)
        assertEquals(chromVoidIdentity(), coordinator.status.activeIdentity)
        assertEquals(listOf(accessory), gateway.permissionRequests)
        assertTrue(opener.opened.isEmpty())
        assertNull(coordinator.status.errorCode)

        assertEquals(
            MobileUsbAccessoryCoordinatorResult.Deferred,
            coordinator.onPermissionResult(accessory, granted = true),
        )
        assertEquals(MobileUsbAccessoryCoordinatorState.Idle, coordinator.status.state)
        assertNull(coordinator.status.activeIdentity)
        assertNull(coordinator.status.errorCode)
        assertTrue(opener.opened.isEmpty())
    }

    @Test
    fun attachBeforeHostIsReadyDefersDescriptorUntilCurrentAccessoryIsHandledAgain() {
        val descriptorOpener = FakeDescriptorOpener()
        val sink = FakeNativeSink().apply { ready = false }
        val opener =
            MobileUsbAccessoryNativeShell.createSessionOpenerForTests(
                descriptorOpener = descriptorOpener,
                nativeSink = sink,
            )
        val coordinator = MobileUsbAccessoryCoordinator(FakeGateway(hasPermission = true), opener)
        val accessory = chromVoidAccessory()
        MobileUsbAccessoryForegroundRuntime.setCoordinatorForTests(coordinator)
        MobileUsbAccessoryForegroundRuntime.setCurrentAccessoryProviderForTests { accessory }
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, _ -> }

        val deferred = coordinator.onAccessoryAttached(accessory)

        assertEquals(MobileUsbAccessoryCoordinatorResult.Deferred, deferred)
        assertEquals(MobileUsbAccessoryCoordinatorState.Idle, coordinator.status.state)
        assertNull(coordinator.status.activeIdentity)
        assertNull(coordinator.status.errorCode)
        assertEquals(0, descriptorOpener.openCount)
        assertEquals(0, descriptorOpener.detachCount)
        assertEquals(0, sink.startCount)
        val deferredLogs = ShadowLog.getLogsForTag("ChromVoid/MobileUsb")
        assertEquals(1, deferredLogs.size)
        assertEquals(Log.INFO, deferredLogs.single().type)
        assertEquals("accessory_open_deferred reason=host_not_ready", deferredLogs.single().msg)

        sink.ready = true
        val context: Context = ApplicationProvider.getApplicationContext()
        assertEquals(
            MobileUsbAccessoryCoordinatorResult.Opened,
            MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context),
        )
        assertEquals(
            MobileUsbAccessoryCoordinatorResult.Ignored,
            MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(context),
        )
        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(1, descriptorOpener.openCount)
        assertEquals(1, descriptorOpener.detachCount)
        assertEquals(1, sink.startCount)
        assertNull(coordinator.status.errorCode)
    }

    @Test
    fun nativeRefusalWhileHostIsReadyRemainsAnOpenFailure() {
        val descriptorOpener = FakeDescriptorOpener()
        val sink = FakeNativeSink().apply { startResult = false }
        val closedFds = mutableListOf<Int>()
        val opener =
            MobileUsbAccessoryNativeShell.createSessionOpenerForTests(
                descriptorOpener = descriptorOpener,
                nativeSink = sink,
                detachedFdCloser = { closedFds += it },
            )
        val coordinator = MobileUsbAccessoryCoordinator(FakeGateway(hasPermission = true), opener)

        val result = coordinator.onAccessoryAttached(chromVoidAccessory())

        assertEquals(MobileUsbAccessoryCoordinatorResult.Error("ERR_USB_MOBILE_OPEN_FAILED"), result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Error, coordinator.status.state)
        assertEquals("ERR_USB_MOBILE_OPEN_FAILED", coordinator.status.errorCode)
        assertEquals(1, descriptorOpener.openCount)
        assertEquals(1, descriptorOpener.detachCount)
        assertEquals(1, sink.startCount)
        assertEquals(listOf(42), closedFds)
    }

    @Test
    fun permissionDeniedFailsClosed() {
        val gateway = FakeGateway(hasPermission = false)
        val coordinator = MobileUsbAccessoryCoordinator(gateway, FakeOpener())
        val accessory = chromVoidAccessory()
        coordinator.onAccessoryAttached(accessory)

        val result = coordinator.onPermissionResult(accessory, granted = false)

        assertEquals(
            MobileUsbAccessoryCoordinatorResult.Error("ERR_USB_MOBILE_PERMISSION_DENIED"),
            result,
        )
        assertEquals(MobileUsbAccessoryCoordinatorState.Error, coordinator.status.state)
        assertEquals("ERR_USB_MOBILE_PERMISSION_DENIED", coordinator.status.errorCode)
    }

    @Test
    fun duplicateActiveConnectionIsRejected() {
        val gateway = FakeGateway(hasPermission = true)
        val opener = FakeOpener()
        val coordinator = MobileUsbAccessoryCoordinator(gateway, opener)
        coordinator.onAccessoryAttached(chromVoidAccessory(serial = "serial-1"))

        val result = coordinator.onAccessoryAttached(chromVoidAccessory(serial = "serial-2"))

        assertEquals(MobileUsbAccessoryCoordinatorResult.Error("ERR_USB_MOBILE_BUSY"), result)
        assertEquals(1, opener.opened.size)
        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
    }

    @Test
    fun permissionSuccessOpensSession() {
        val gateway = FakeGateway(hasPermission = false)
        val opener = FakeOpener()
        val coordinator = MobileUsbAccessoryCoordinator(gateway, opener)
        val accessory = chromVoidAccessory()
        coordinator.onAccessoryAttached(accessory)

        val result = coordinator.onPermissionResult(accessory, granted = true)

        assertEquals(MobileUsbAccessoryCoordinatorResult.Opened, result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertEquals(listOf(accessory), opener.opened)
    }

    @Test
    fun detachClosesActiveHandleAndMovesToDetached() {
        val handle = FakeHandle()
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                FakeOpener(handle),
            )
        val accessory = chromVoidAccessory()
        coordinator.onAccessoryAttached(accessory)

        val result = coordinator.onAccessoryDetached(accessory)

        assertEquals(MobileUsbAccessoryCoordinatorResult.Detached, result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Detached, coordinator.status.state)
        assertTrue(handle.closed)
        assertEquals(MobileUsbAccessorySessionStopReason.AccessoryDetached, handle.closeReason)
    }

    @Test
    fun disconnectIsIdempotent() {
        val handle = FakeHandle()
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                FakeOpener(handle),
            )
        coordinator.onAccessoryAttached(chromVoidAccessory())

        assertEquals(MobileUsbAccessoryCoordinatorResult.Disconnected, coordinator.disconnect())
        assertEquals(MobileUsbAccessoryCoordinatorResult.Disconnected, coordinator.disconnect())
        assertTrue(handle.closed)
        assertEquals(MobileUsbAccessorySessionStopReason.ExplicitDisconnect, handle.closeReason)
        assertEquals(MobileUsbAccessoryCoordinatorState.Idle, coordinator.status.state)
    }

    @Test
    fun endedActiveNativeSessionClearsOpenStateWithoutClosingHandleAgain() {
        val handle = FakeHandle(sessionId = "session-active")
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                FakeOpener(handle),
            )
        coordinator.onAccessoryAttached(chromVoidAccessory())

        val result = coordinator.onSessionEnded("session-active")

        assertEquals(MobileUsbAccessoryCoordinatorResult.Disconnected, result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Idle, coordinator.status.state)
        assertFalse(handle.closed)
    }

    @Test
    fun endedUnknownNativeSessionIsIgnored() {
        val handle = FakeHandle(sessionId = "session-active")
        val coordinator =
            MobileUsbAccessoryCoordinator(
                FakeGateway(hasPermission = true),
                FakeOpener(handle),
            )
        coordinator.onAccessoryAttached(chromVoidAccessory())

        val result = coordinator.onSessionEnded("session-other")

        assertEquals(MobileUsbAccessoryCoordinatorResult.Ignored, result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Open, coordinator.status.state)
        assertFalse(handle.closed)
    }

    @Test
    fun malformedIntentMapsToNoAccessoryError() {
        val coordinator = MobileUsbAccessoryCoordinator(FakeGateway(hasPermission = true), FakeOpener())

        val result =
            coordinator.onIntentEvent(
                MobileUsbAccessoryIntentEvent.Malformed(
                    action = "action",
                    error = MobileUsbAccessoryIntentError.MissingAccessory,
                ),
            )

        assertEquals(MobileUsbAccessoryCoordinatorResult.Error("ERR_USB_MOBILE_NO_ACCESSORY"), result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Error, coordinator.status.state)
        assertEquals("ERR_USB_MOBILE_NO_ACCESSORY", coordinator.status.errorCode)
    }

    @Test
    fun unrelatedIntentIsIgnoredWithoutStateChange() {
        val coordinator = MobileUsbAccessoryCoordinator(FakeGateway(hasPermission = true), FakeOpener())

        val result = coordinator.onIntentEvent(MobileUsbAccessoryIntentEvent.Ignored)

        assertEquals(MobileUsbAccessoryCoordinatorResult.Ignored, result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Idle, coordinator.status.state)
    }

    @Test
    fun permissionResultWithoutPendingStateFailsClosed() {
        val coordinator = MobileUsbAccessoryCoordinator(FakeGateway(hasPermission = true), FakeOpener())

        val result = coordinator.onPermissionResult(chromVoidAccessory(), granted = true)

        assertEquals(MobileUsbAccessoryCoordinatorResult.Error("ERR_USB_MOBILE_INVALID_STATE"), result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Error, coordinator.status.state)
    }

    @Test
    fun openerFailureFailsClosedAndClosesHandle() {
        val handle = FakeHandle()
        val opener = FakeOpener(handle).apply { failOpen = true }
        val coordinator = MobileUsbAccessoryCoordinator(FakeGateway(hasPermission = true), opener)

        val result = coordinator.onAccessoryAttached(chromVoidAccessory())

        assertEquals(MobileUsbAccessoryCoordinatorResult.Error("ERR_USB_MOBILE_OPEN_FAILED"), result)
        assertEquals(MobileUsbAccessoryCoordinatorState.Error, coordinator.status.state)
        assertFalse(handle.closed)
    }

    private class FakeGateway(
        private val hasPermission: Boolean,
    ) : MobileUsbAccessoryPermissionGateway {
        val permissionRequests = mutableListOf<UsbAccessory>()

        override fun hasPermission(accessory: UsbAccessory): Boolean = hasPermission

        override fun requestPermission(accessory: UsbAccessory) {
            permissionRequests += accessory
        }
    }

    private class FakeOpener(
        private val handle: FakeHandle = FakeHandle(),
    ) : MobileUsbAccessorySessionOpener {
        val opened = mutableListOf<UsbAccessory>()
        var failOpen = false
        var ready = true

        override fun isReadyForAccessory(): Boolean = ready

        override fun open(
            accessory: UsbAccessory,
            identity: MobileUsbAccessoryIdentity,
        ): MobileUsbAccessorySessionHandle {
            opened += accessory
            if (failOpen) throw IllegalStateException("open failed")
            return handle
        }
    }

    private class FakeDescriptorOpener : MobileUsbAccessoryDescriptorOpener {
        var openCount = 0
        var detachCount = 0

        override fun open(accessory: UsbAccessory): MobileUsbAccessoryDescriptor {
            openCount += 1
            return object : MobileUsbAccessoryDescriptor {
                override fun detachFd(): Int {
                    detachCount += 1
                    return 42
                }

                override fun close() = Unit
            }
        }
    }

    private class FakeNativeSink : MobileUsbAccessoryNativeSink {
        var ready = true
        var startResult = true
        var startCount = 0

        override fun isReadyForAccessory(): Boolean = ready

        override fun startAccessorySession(
            sessionId: String,
            fd: Int,
            identityJson: String,
        ): Boolean {
            startCount += 1
            return startResult
        }

        override fun stopAccessorySession(
            sessionId: String,
            reasonCode: String,
        ) = Unit

        override fun resolveApproval(
            kind: String,
            attemptId: String,
            approved: Boolean,
        ): Boolean = false
    }

    private class FakeHandle(
        override val sessionId: String = "session-1",
    ) : MobileUsbAccessorySessionHandle {
        var closed = false
        var closeReason: MobileUsbAccessorySessionStopReason? = null

        override fun close(reason: MobileUsbAccessorySessionStopReason) {
            closed = true
            closeReason = reason
        }
    }

    private fun chromVoidIdentity(serial: String = "serial-1"): MobileUsbAccessoryIdentity =
        MobileUsbAccessoryIdentity(
            manufacturer = MobileUsbAccessoryIntentContract.MANUFACTURER,
            model = MobileUsbAccessoryIntentContract.MODEL,
            description = MobileUsbAccessoryIntentContract.DESCRIPTION,
            version = MobileUsbAccessoryIntentContract.VERSION,
            uri = MobileUsbAccessoryIntentContract.URI,
            serial = serial,
        )

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
