package com.chromvoid.app.shared

import android.app.Application
import android.app.Notification
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.ConnectionForegroundService
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
class ForegroundServiceSupportTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @After
    fun tearDown() {
        ForegroundServiceSupport.resetForTests()
    }

    @Test
    fun startForegroundServiceStartsIntent() {
        val result =
            ForegroundServiceSupport.startForegroundService(
                context,
                Intent(context, ConnectionForegroundService::class.java),
                "Test",
            )

        val started = shadowOf(context as Application).nextStartedService
        assertTrue(result)
        assertEquals(ConnectionForegroundService::class.java.name, started.component?.className)
    }

    @Test
    fun startForegroundServiceReturnsFalseWhenStartIsDenied() {
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, _ ->
            throw IllegalStateException("denied")
        }

        val result =
            ForegroundServiceSupport.startForegroundService(
                context,
                Intent(context, ConnectionForegroundService::class.java),
                "Test",
            )

        assertFalse(result)
        assertNull(shadowOf(context as Application).nextStartedService)
    }

    @Test
    fun enterForegroundStartsServiceForeground() {
        val service =
            Robolectric.buildService(ConnectionForegroundService::class.java)
                .create()
                .get()
        val notification = notification()

        val result =
            ForegroundServiceSupport.enterForeground(
                service,
                44,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
                "Test",
            )

        val shadow = shadowOf(service)
        assertTrue(result)
        assertEquals(44, shadow.lastForegroundNotificationId)
        assertNotNull(shadow.lastForegroundNotification)
    }

    @Test
    fun enterForegroundReturnsFalseWhenEntryIsDenied() {
        ForegroundServiceSupport.setEnterForegroundForTests { _, _, _, _ ->
            throw SecurityException("denied")
        }
        val service =
            Robolectric.buildService(ConnectionForegroundService::class.java)
                .create()
                .get()

        val result =
            ForegroundServiceSupport.enterForeground(
                service,
                44,
                notification(),
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
                "Test",
            )

        assertFalse(result)
        assertNull(shadowOf(service).lastForegroundNotification)
    }

    private fun notification(): Notification =
        Notification.Builder(context, ConnectionForegroundService.CHANNEL_ID)
            .setContentTitle("ChromVoid")
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .build()
}
