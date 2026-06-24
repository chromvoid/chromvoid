package com.chromvoid.app.nativebridge

import android.hardware.usb.UsbAccessory
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MobileUsbAccessoryCoordinatorTest {
    @Test
    fun attachWithoutPermission_requestsPermissionAndWaits() {
        val gateway = FakeGateway(hasPermission = false)
        val coordinator = MobileUsbAccessoryCoordinator(gateway, FakeOpener())
        val accessory = chromVoidAccessory()

        val result = coordinator.onAccessoryAttached(accessory)

        assertEquals(MobileUsbAccessoryCoordinatorResult.PermissionRequested, result)
        assertEquals(MobileUsbAccessoryCoordinatorState.PermissionRequested, coordinator.status.state)
        assertEquals(chromVoidIdentity(), coordinator.status.activeIdentity)
        assertEquals(listOf(accessory), gateway.permissionRequests)
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

        override fun open(
            accessory: UsbAccessory,
            identity: MobileUsbAccessoryIdentity,
        ): MobileUsbAccessorySessionHandle {
            opened += accessory
            if (failOpen) throw IllegalStateException("open failed")
            return handle
        }
    }

    private class FakeHandle(
        override val sessionId: String = "session-1",
    ) : MobileUsbAccessorySessionHandle {
        var closed = false

        override fun close() {
            closed = true
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
