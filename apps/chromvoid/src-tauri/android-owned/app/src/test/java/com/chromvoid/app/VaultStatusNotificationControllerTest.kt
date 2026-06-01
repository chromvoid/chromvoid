package com.chromvoid.app

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Looper
import android.service.quicksettings.Tile
import androidx.test.core.app.ApplicationProvider
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [32])
class VaultStatusNotificationControllerTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @Before
    fun setUp() {
        VaultStatusNotificationController.resetForTests()
        notificationManager().cancel(VaultStatusNotificationController.NOTIFICATION_ID)
    }

    @After
    fun tearDown() {
        VaultStatusNotificationController.resetForTests()
    }

    @Test
    fun unlockedVaultShowsOngoingNotificationWithLockAction() {
        VaultStatusNotificationController.syncFromNative(
            context = context,
            unlocked = true,
            notificationEnabled = true,
            quickTileEnabled = true,
        )
        shadowOf(Looper.getMainLooper()).idle()

        val notification = currentNotification()
        assertNotNull(notification)
        assertTrue(notification!!.flags and Notification.FLAG_ONGOING_EVENT != 0)
        assertEquals("Vault unlocked", notification.extras.getString(Notification.EXTRA_TITLE))
        assertEquals(listOf("Lock"), notification.actions.map { it.title.toString() })
    }

    @Test
    fun lockedVaultCancelsStatusNotification() {
        VaultStatusNotificationController.syncFromNative(
            context = context,
            unlocked = true,
            notificationEnabled = true,
            quickTileEnabled = true,
        )
        shadowOf(Looper.getMainLooper()).idle()
        assertNotNull(currentNotification())

        VaultStatusNotificationController.syncFromNative(
            context = context,
            unlocked = false,
            notificationEnabled = true,
            quickTileEnabled = true,
        )
        shadowOf(Looper.getMainLooper()).idle()

        assertNull(currentNotification())
    }

    @Test
    fun notificationReceiverDispatchesNativeQuickLockSource() {
        var source: String? = null
        VaultStatusNotificationController.setQuickLockHandlerForTests { source = it }

        VaultQuickLockReceiver().onReceive(
            context,
            Intent(context, VaultQuickLockReceiver::class.java).apply {
                action = VaultQuickLockReceiver.ACTION_LOCK_FROM_NOTIFICATION
            },
        )

        assertEquals(VaultQuickLockReceiver.SOURCE_NOTIFICATION, source)
    }

    @Test
    fun quickSettingsTileReflectsVaultStateAndEnabledSetting() {
        val service =
            Robolectric.buildService(VaultQuickSettingsTileService::class.java)
                .create()
                .get()

        VaultStatusNotificationController.syncFromNative(
            context = context,
            unlocked = true,
            notificationEnabled = true,
            quickTileEnabled = true,
        )
        shadowOf(Looper.getMainLooper()).idle()
        service.onStartListening()
        assertEquals(Tile.STATE_ACTIVE, service.qsTile.state)

        VaultStatusNotificationController.syncFromNative(
            context = context,
            unlocked = false,
            notificationEnabled = true,
            quickTileEnabled = true,
        )
        shadowOf(Looper.getMainLooper()).idle()
        service.onStartListening()
        assertEquals(Tile.STATE_INACTIVE, service.qsTile.state)

        VaultStatusNotificationController.syncFromNative(
            context = context,
            unlocked = true,
            notificationEnabled = true,
            quickTileEnabled = false,
        )
        shadowOf(Looper.getMainLooper()).idle()
        service.onStartListening()
        assertEquals(Tile.STATE_UNAVAILABLE, service.qsTile.state)
    }

    private fun currentNotification(): Notification? {
        return shadowOf(notificationManager())
            .getNotification(VaultStatusNotificationController.NOTIFICATION_ID)
    }

    private fun notificationManager(): NotificationManager {
        return context.getSystemService(NotificationManager::class.java)
    }
}
