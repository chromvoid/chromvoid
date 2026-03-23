package com.chromvoid.app

import android.app.Notification
import android.content.Context
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
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

    @Test
    fun startAction_entersForegroundWithNotification() {
        val service =
            Robolectric.buildService(ConnectionForegroundService::class.java)
                .create()
                .get()

        service.onStartCommand(
            Intent(context, ConnectionForegroundService::class.java).apply {
                action = ConnectionForegroundService.ACTION_START
                putExtra(ConnectionForegroundService.EXTRA_DEVICE_NAME, "Laptop")
            },
            0,
            1,
        )

        val shadow = shadowOf(service)
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
                action = ConnectionForegroundService.ACTION_STOP
            },
            0,
            1,
        )

        val shadow = shadowOf(service)
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
                action = ConnectionForegroundService.ACTION_DISCONNECT
            },
            0,
            1,
        )

        val shadow = shadowOf(service)
        assertTrue(shadow.isForegroundStopped)
        assertTrue(shadow.isStoppedBySelf)
    }

    @Test
    fun unknownAction_startsDefaultNotification() {
        val service =
            Robolectric.buildService(ConnectionForegroundService::class.java)
                .create()
                .get()

        service.onStartCommand(
            Intent(context, ConnectionForegroundService::class.java).apply {
                action = "com.chromvoid.app.UNKNOWN"
            },
            0,
            1,
        )

        val shadow = shadowOf(service)
        assertEquals(ConnectionForegroundService.NOTIFICATION_ID, shadow.lastForegroundNotificationId)
        assertTrue(
            shadow.lastForegroundNotification.extras
                .getString(Notification.EXTRA_TITLE)
                .orEmpty()
                .contains("Desktop"),
        )
    }
}
