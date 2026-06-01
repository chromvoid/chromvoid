package com.chromvoid.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent

internal class VaultStatusNotificationFactory(
    private val context: Context,
) {
    fun ensureChannel() {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.createNotificationChannel(
            NotificationChannel(
                VaultStatusNotificationController.CHANNEL_ID,
                context.getString(R.string.vault_status_channel_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = context.getString(R.string.vault_status_channel_description)
                setShowBadge(false)
            },
        )
    }

    fun build(): Notification {
        return Notification.Builder(context, VaultStatusNotificationController.CHANNEL_ID)
            .setContentTitle(context.getString(R.string.vault_status_notification_title))
            .setContentText(context.getString(R.string.vault_status_notification_text))
            .setSmallIcon(android.R.drawable.ic_lock_lock)
            .setContentIntent(launchPendingIntent())
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setCategory(Notification.CATEGORY_STATUS)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .addAction(
                Notification.Action.Builder(
                    android.R.drawable.ic_lock_lock,
                    context.getString(R.string.vault_status_lock_action),
                    lockPendingIntent(),
                ).build(),
            )
            .build()
    }

    private fun launchPendingIntent(): PendingIntent {
        val intent =
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
        return PendingIntent.getActivity(
            context,
            REQUEST_CODE_LAUNCH,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    private fun lockPendingIntent(): PendingIntent {
        val intent =
            Intent(context, VaultQuickLockReceiver::class.java).apply {
                action = VaultQuickLockReceiver.ACTION_LOCK_FROM_NOTIFICATION
            }
        return PendingIntent.getBroadcast(
            context,
            REQUEST_CODE_LOCK,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    }

    companion object {
        private const val REQUEST_CODE_LAUNCH = 201
        private const val REQUEST_CODE_LOCK = 202
    }
}
