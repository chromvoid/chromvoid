package com.chromvoid.app

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.session.MediaSession

internal class MediaPlaybackNotificationBuilder(private val context: Context) {
    fun ensureChannel() {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.createNotificationChannel(
            NotificationChannel(
                MediaPlaybackForegroundService.CHANNEL_ID,
                context.getString(R.string.media_playback_channel_name),
                NotificationManager.IMPORTANCE_LOW,
            ).apply {
                description = context.getString(R.string.media_playback_channel_description)
                setShowBadge(false)
            },
        )
    }

    fun build(snapshot: MediaSnapshot, sessionToken: MediaSession.Token): Notification {
        val builder =
            Notification.Builder(context, MediaPlaybackForegroundService.CHANNEL_ID)
                .setContentTitle(snapshot.title)
                .setContentText(context.getString(R.string.media_playback_notification_text))
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(launchPendingIntent())
                .setOnlyAlertOnce(true)
                .setOngoing(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setCategory(Notification.CATEGORY_TRANSPORT)

        val compactIndices = mutableListOf<Int>()
        var actionIndex = 0
        if (snapshot.hasPrevious) {
            builder.addAction(
                mediaAction(
                    android.R.drawable.ic_media_previous,
                    context.getString(R.string.media_playback_previous_action),
                    MediaPlaybackForegroundService.ACTION_PREVIOUS,
                    REQUEST_CODE_PREVIOUS,
                ),
            )
            compactIndices += actionIndex
            actionIndex += 1
        }

        val toggleAction =
            if (snapshot.isActivelyPlaying()) {
                mediaAction(
                    android.R.drawable.ic_media_pause,
                    context.getString(R.string.media_playback_pause_action),
                    MediaPlaybackForegroundService.ACTION_TOGGLE,
                    REQUEST_CODE_TOGGLE,
                )
            } else {
                mediaAction(
                    android.R.drawable.ic_media_play,
                    context.getString(R.string.media_playback_play_action),
                    MediaPlaybackForegroundService.ACTION_TOGGLE,
                    REQUEST_CODE_TOGGLE,
                )
            }
        builder.addAction(toggleAction)
        compactIndices += actionIndex
        actionIndex += 1

        if (snapshot.hasNext) {
            builder.addAction(
                mediaAction(
                    android.R.drawable.ic_media_next,
                    context.getString(R.string.media_playback_next_action),
                    MediaPlaybackForegroundService.ACTION_NEXT,
                    REQUEST_CODE_NEXT,
                ),
            )
            compactIndices += actionIndex
            actionIndex += 1
        }

        builder.addAction(
            mediaAction(
                android.R.drawable.ic_menu_close_clear_cancel,
                context.getString(R.string.media_playback_stop_action),
                MediaPlaybackForegroundService.ACTION_STOP,
                REQUEST_CODE_STOP,
            ),
        )

        val compact = compactIndices.take(MAX_COMPACT_ACTIONS).toIntArray()
        builder.setStyle(
            Notification.MediaStyle()
                .setMediaSession(sessionToken)
                .setShowActionsInCompactView(*compact),
        )
        return builder.build()
    }

    private fun mediaAction(
        icon: Int,
        title: String,
        action: String,
        requestCode: Int,
    ): Notification.Action {
        return Notification.Action.Builder(
            icon,
            title,
            servicePendingIntent(action, requestCode),
        ).build()
    }

    private fun servicePendingIntent(action: String, requestCode: Int): PendingIntent {
        return PendingIntent.getService(
            context,
            requestCode,
            Intent(context, MediaPlaybackForegroundService::class.java).apply { this.action = action },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
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

    companion object {
        private const val REQUEST_CODE_LAUNCH = 101
        private const val REQUEST_CODE_TOGGLE = 102
        private const val REQUEST_CODE_NEXT = 104
        private const val REQUEST_CODE_PREVIOUS = 105
        private const val REQUEST_CODE_STOP = 106
        private const val MAX_COMPACT_ACTIONS = 3
    }
}
