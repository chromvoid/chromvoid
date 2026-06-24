package com.chromvoid.app

import android.app.Application
import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.nativebridge.MobileUsbAccessoryCoordinatorResult
import com.chromvoid.app.nativebridge.MobileUsbAccessoryForegroundRuntime
import com.chromvoid.app.shared.ForegroundServiceSupport
import com.chromvoid.app.shared.NativeRuntimeLoader
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
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
class ConnectionForegroundServiceTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @After
    fun tearDown() {
        ForegroundServiceSupport.resetForTests()
        NativeRuntimeLoader.resetForTests()
        ConnectionForegroundService.resetOwnerForTests()
        MobileUsbAccessoryForegroundRuntime.resetForTests()
    }

    @Test
    fun startAction_entersForegroundWithNotification() {
        val service =
            Robolectric.buildService(ConnectionForegroundService::class.java)
                .create()
                .get()

        val mode = service.onStartCommand(
            Intent(context, ConnectionForegroundService::class.java).apply {
                action = ConnectionForegroundService.ACTION_START
                putExtra(ConnectionForegroundService.EXTRA_DEVICE_NAME, "Laptop")
            },
            0,
            1,
        )

        val shadow = shadowOf(service)
        assertEquals(Service.START_STICKY, mode)
        assertEquals(ConnectionForegroundService.NOTIFICATION_ID, shadow.lastForegroundNotificationId)
        assertNotNull(shadow.lastForegroundNotification)
        assertFalse(shadow.isForegroundStopped)
        assertTrue(
            shadow.lastForegroundNotification.extras
                .getString(Notification.EXTRA_TITLE)
                .orEmpty()
                .contains("Laptop"),
        )
    }

    @Test
    fun stopAction_stopsForegroundAndSelf() {
        val service =
            Robolectric.buildService(ConnectionForegroundService::class.java)
                .create()
                .get()

        service.onStartCommand(
            Intent(context, ConnectionForegroundService::class.java).apply {
                action = ConnectionForegroundService.ACTION_START
            },
            0,
            1,
        )
        val mode = service.onStartCommand(
            Intent(context, ConnectionForegroundService::class.java).apply {
                action = ConnectionForegroundService.ACTION_STOP
            },
            0,
            2,
        )

        val shadow = shadowOf(service)
        assertEquals(Service.START_NOT_STICKY, mode)
        assertTrue(shadow.isForegroundStopped)
        assertTrue(shadow.isStoppedBySelf)
    }

    @Test
    fun disconnectAction_stopsForegroundAndSelf() {
        val service =
            Robolectric.buildService(ConnectionForegroundService::class.java)
                .create()
                .get()

        service.onStartCommand(
            Intent(context, ConnectionForegroundService::class.java).apply {
                action = ConnectionForegroundService.ACTION_START
            },
            0,
            1,
        )
        val mode = service.onStartCommand(
            Intent(context, ConnectionForegroundService::class.java).apply {
                action = ConnectionForegroundService.ACTION_DISCONNECT
            },
            0,
            2,
        )

        val shadow = shadowOf(service)
        assertEquals(Service.START_NOT_STICKY, mode)
        assertTrue(shadow.isForegroundStopped)
        assertTrue(shadow.isStoppedBySelf)
    }

    @Test
    fun startUsbAccessoryAction_entersForegroundWithUsbOwner() {
        val service =
            Robolectric.buildService(ConnectionForegroundService::class.java)
                .create()
                .get()

        val mode = service.onStartCommand(
            Intent(context, ConnectionForegroundService::class.java).apply {
                action = ConnectionForegroundService.ACTION_START_USB_ACCESSORY
                putExtra(ConnectionForegroundService.EXTRA_USB_ACCESSORY_SESSION_LABEL, "USB Host")
            },
            0,
            1,
        )

        val shadow = shadowOf(service)
        assertEquals(Service.START_STICKY, mode)
        assertEquals(ConnectionForegroundOwner.UsbMobile, ConnectionForegroundService.activeOwnerForTests())
        assertEquals(ConnectionForegroundService.NOTIFICATION_ID, shadow.lastForegroundNotificationId)
        assertFalse(shadow.isForegroundStopped)
    }

    @Test
    fun networkStartIsRejectedWhileUsbOwnsForegroundService() {
        val startedIntents = mutableListOf<Intent>()
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, intent ->
            startedIntents += Intent(intent)
        }

        assertTrue(ConnectionForegroundService.startUsbAccessory(context, "USB Host"))
        assertFalse(ConnectionForegroundService.start(context, "Laptop"))

        assertEquals(ConnectionForegroundOwner.UsbMobile, ConnectionForegroundService.activeOwnerForTests())
        assertEquals(1, startedIntents.size)
        assertEquals(ConnectionForegroundService.ACTION_START_USB_ACCESSORY, startedIntents.single().action)
    }

    @Test
    fun usbDisconnectActionStopsForegroundSelfAndUsbSession() {
        var disconnects = 0
        MobileUsbAccessoryForegroundRuntime.setDisconnectForTests {
            disconnects += 1
            MobileUsbAccessoryCoordinatorResult.Disconnected
        }
        val service =
            Robolectric.buildService(ConnectionForegroundService::class.java)
                .create()
                .get()
        service.onStartCommand(
            Intent(context, ConnectionForegroundService::class.java).apply {
                action = ConnectionForegroundService.ACTION_START_USB_ACCESSORY
            },
            0,
            1,
        )

        val mode = service.onStartCommand(
            Intent(context, ConnectionForegroundService::class.java).apply {
                action = ConnectionForegroundService.ACTION_USB_ACCESSORY_DISCONNECT
            },
            0,
            2,
        )

        val shadow = shadowOf(service)
        assertEquals(Service.START_NOT_STICKY, mode)
        assertEquals(1, disconnects)
        assertNull(ConnectionForegroundService.activeOwnerForTests())
        assertTrue(shadow.isForegroundStopped)
        assertTrue(shadow.isStoppedBySelf)
    }

    @Test
    fun destroyWithUsbOwnerDisconnectsUsbSessionWithoutNativeNetworkCallback() {
        var disconnects = 0
        MobileUsbAccessoryForegroundRuntime.setDisconnectForTests {
            disconnects += 1
            MobileUsbAccessoryCoordinatorResult.Disconnected
        }
        val service =
            Robolectric.buildService(ConnectionForegroundService::class.java)
                .create()
                .get()
        service.onStartCommand(
            Intent(context, ConnectionForegroundService::class.java).apply {
                action = ConnectionForegroundService.ACTION_START_USB_ACCESSORY
            },
            0,
            1,
        )

        service.onDestroy()

        assertEquals(1, disconnects)
        assertNull(ConnectionForegroundService.activeOwnerForTests())
        assertEquals("not_started", NativeRuntimeLoader.stateForTests())
    }

    @Test
    fun destroyWithUsbOwnerDisconnectsUsbSessionOnlyOnce() {
        var disconnects = 0
        MobileUsbAccessoryForegroundRuntime.setDisconnectForTests {
            disconnects += 1
            MobileUsbAccessoryCoordinatorResult.Disconnected
        }
        val service =
            Robolectric.buildService(ConnectionForegroundService::class.java)
                .create()
                .get()
        service.onStartCommand(
            Intent(context, ConnectionForegroundService::class.java).apply {
                action = ConnectionForegroundService.ACTION_START_USB_ACCESSORY
            },
            0,
            1,
        )

        service.onDestroy()
        service.onDestroy()

        assertEquals(1, disconnects)
        assertNull(ConnectionForegroundService.activeOwnerForTests())
    }

    @Test
    fun usbStartForegroundFailureDisconnectsAndReleasesOwner() {
        var disconnects = 0
        MobileUsbAccessoryForegroundRuntime.setDisconnectForTests {
            disconnects += 1
            MobileUsbAccessoryCoordinatorResult.Disconnected
        }
        ForegroundServiceSupport.setEnterForegroundForTests { _, _, _, _ ->
            throw SecurityException("denied")
        }
        val service =
            Robolectric.buildService(ConnectionForegroundService::class.java)
                .create()
                .get()

        val mode = service.onStartCommand(
            Intent(context, ConnectionForegroundService::class.java).apply {
                action = ConnectionForegroundService.ACTION_START_USB_ACCESSORY
            },
            0,
            1,
        )

        val shadow = shadowOf(service)
        assertEquals(Service.START_NOT_STICKY, mode)
        assertEquals(1, disconnects)
        assertNull(ConnectionForegroundService.activeOwnerForTests())
        assertTrue(shadow.isStoppedBySelf)
    }

    @Test
    fun unknownAction_startsDefaultNotification() {
        val service =
            Robolectric.buildService(ConnectionForegroundService::class.java)
                .create()
                .get()

        val mode = service.onStartCommand(
            Intent(context, ConnectionForegroundService::class.java).apply {
                action = "com.chromvoid.app.UNKNOWN"
            },
            0,
            1,
        )

        val shadow = shadowOf(service)
        assertEquals(Service.START_STICKY, mode)
        assertEquals(ConnectionForegroundService.NOTIFICATION_ID, shadow.lastForegroundNotificationId)
        assertTrue(
            shadow.lastForegroundNotification.extras
                .getString(Notification.EXTRA_TITLE)
                .orEmpty()
                .contains("Desktop"),
        )
    }

    @Test
    fun companionStopStopsServiceWithoutStartingStopIntent() {
        ConnectionForegroundService.stop(context)

        val shadow = shadowOf(context as Application)
        val stoppedService = shadow.nextStoppedService
        assertEquals(ConnectionForegroundService::class.java.name, stoppedService.component?.className)
        assertNull(stoppedService.action)
        assertNull(shadow.nextStartedService)
    }

    @Test
    fun startActionStopsSelfWhenForegroundEntryFails() {
        ForegroundServiceSupport.setEnterForegroundForTests { _, _, _, _ ->
            throw SecurityException("denied")
        }
        val service =
            Robolectric.buildService(ConnectionForegroundService::class.java)
                .create()
                .get()

        val mode = service.onStartCommand(
            Intent(context, ConnectionForegroundService::class.java).apply {
                action = ConnectionForegroundService.ACTION_START
            },
            0,
            1,
        )

        val shadow = shadowOf(service)
        assertEquals(Service.START_NOT_STICKY, mode)
        assertTrue(shadow.isStoppedBySelf)
        assertFalse(shadow.isForegroundStopped)
    }

    @Test
    fun destroyWithUnavailableNativeRuntimeDoesNotThrow() {
        NativeRuntimeLoader.setLoadLibraryForTests {
            throw UnsatisfiedLinkError("missing")
        }
        val service =
            Robolectric.buildService(ConnectionForegroundService::class.java)
                .create()
                .get()

        service.onDestroy()

        assertEquals("failed", NativeRuntimeLoader.stateForTests())
    }
}
