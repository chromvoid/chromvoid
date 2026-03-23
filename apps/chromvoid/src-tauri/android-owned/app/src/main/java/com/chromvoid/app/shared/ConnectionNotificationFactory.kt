package com.chromvoid.app.shared

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import com.chromvoid.app.ConnectionForegroundService
import com.chromvoid.app.MainActivity
import com.chromvoid.app.R

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

    fun build(deviceName: String): Notification {
        val launchIntent =
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
        val launchPendingIntent =
            PendingIntent.getActivity(
                context,
                REQUEST_CODE_LAUNCH,
                launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        val disconnectIntent =
            Intent(context, ConnectionForegroundService::class.java).apply {
                action = ConnectionForegroundService.ACTION_DISCONNECT
            }
        val disconnectPendingIntent =
            PendingIntent.getService(
                context,
                REQUEST_CODE_DISCONNECT,
                disconnectIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        return Notification.Builder(context, ConnectionForegroundService.CHANNEL_ID)
            .setContentTitle(context.getString(R.string.connection_notification_title, deviceName))
            .setContentText(context.getString(R.string.connection_notification_text))
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth)
            .setOngoing(true)
            .setContentIntent(launchPendingIntent)
            .addAction(
                Notification.Action.Builder(
                    null,
                    context.getString(R.string.connection_disconnect_action),
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
