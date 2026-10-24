package com.chromvoid.app.shared

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.chromvoid.app.ConnectionForegroundService
import com.chromvoid.platform.R

internal class ConnectionNotificationFactory(
    private val context: Context,
) {
    fun ensureChannel() {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.createNotificationChannel(
            NotificationChannel(
                ConnectionForegroundService.CHANNEL_ID,
                context.getString(R.string.connection_channel_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = context.getString(R.string.connection_channel_description)
                setShowBadge(false)
            },
        )
    }

    /** [deviceName] is the computer connected; null says the host is on and waiting for one. */
    fun build(
        deviceName: String?,
        disconnectAction: String = ConnectionForegroundService.ACTION_DISCONNECT,
    ): Notification {
        // The host names its own entry point; a host that installs none
        // simply gets a notification without a way back into the app.
        val launchIntent =
            PlatformHost.launchIntent(context)?.apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
        val launchPendingIntent =
            launchIntent?.let {
                PendingIntent.getActivity(
                    context,
                    REQUEST_CODE_LAUNCH,
                    it,
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
            }

        val disconnectIntent =
            Intent(context, ConnectionForegroundService::class.java).apply {
                action = disconnectAction
            }
        val disconnectPendingIntent =
            PendingIntent.getService(
                context,
                REQUEST_CODE_DISCONNECT,
                disconnectIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        val title = deviceName?.let { context.getString(R.string.connection_notification_title, it) }
            ?: context.getString(R.string.connection_listening_title)
        val text = context.getString(
            if (deviceName != null) R.string.connection_notification_text else R.string.connection_listening_text,
        )
        // The network owner is a host: its action stops it. A USB session is disconnected.
        val action = context.getString(
            if (disconnectAction == ConnectionForegroundService.ACTION_DISCONNECT) {
                R.string.connection_stop_host_action
            } else {
                R.string.connection_disconnect_action
            },
        )
        return Notification.Builder(context, ConnectionForegroundService.CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setOngoing(true)
            .setContentIntent(launchPendingIntent)
            .addAction(
                Notification.Action.Builder(
                    null,
                    action,
                    disconnectPendingIntent,
                ).build(),
            )
            .build()
    }

    companion object {
        private const val REQUEST_CODE_LAUNCH = 1
        private const val REQUEST_CODE_DISCONNECT = 2
    }
}
