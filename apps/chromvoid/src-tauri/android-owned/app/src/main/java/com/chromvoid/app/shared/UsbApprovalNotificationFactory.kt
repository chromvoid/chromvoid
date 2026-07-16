package com.chromvoid.app.shared

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.chromvoid.app.MainActivity
import com.chromvoid.app.MobileUsbApprovalActionReceiver
import com.chromvoid.app.R

/**
 * High-priority notification for phone-side USB approval prompts
 * (pairing PIN confirmation and per-session connection approval).
 *
 * A single notification slot is reused: only one USB approval can be pending
 * at a time, and the prompt auto-expires together with the approval TTL.
 */
internal object UsbApprovalNotificationFactory {
    const val CHANNEL_ID = "chromvoid.usb_approval"
    const val NOTIFICATION_ID = 1004

    // Matches the host-side USB approval TTL (5 minutes).
    private const val APPROVAL_TIMEOUT_MS = 5L * 60L * 1000L
    private const val REQUEST_CODE_LAUNCH = 4801
    private const val REQUEST_CODE_APPROVE = 4802
    private const val REQUEST_CODE_DENY = 4803

    const val KIND_PAIRING = "pairing"
    const val KIND_SESSION = "session"
    const val ACTION_APPROVE = "com.chromvoid.app.action.USB_APPROVAL_APPROVE"
    const val ACTION_DENY = "com.chromvoid.app.action.USB_APPROVAL_DENY"
    const val EXTRA_KIND = "usb_approval_kind"
    const val EXTRA_ATTEMPT_ID = "usb_approval_attempt_id"

    @Volatile
    private var appInForeground = false

    fun post(
        context: Context,
        kind: String,
        attemptId: String,
    ) {
        if (appInForeground) return
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        ensureChannel(context, manager)
        manager.notify(NOTIFICATION_ID, build(context, kind, attemptId))
    }

    fun cancel(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        manager.cancel(NOTIFICATION_ID)
    }

    fun setAppInForeground(
        context: Context,
        inForeground: Boolean,
    ) {
        appInForeground = inForeground
        if (inForeground) cancel(context)
    }

    private fun ensureChannel(
        context: Context,
        manager: NotificationManager,
    ) {
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.usb_approval_channel_name),
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = context.getString(R.string.usb_approval_channel_description)
                setShowBadge(true)
            },
        )
    }

    internal fun build(
        context: Context,
        kind: String,
        attemptId: String,
    ): Notification {
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

        val (title, text) =
            when (kind) {
                KIND_PAIRING ->
                    context.getString(R.string.usb_approval_pairing_title) to
                        context.getString(R.string.usb_approval_pairing_text)
                else ->
                    context.getString(R.string.usb_approval_session_title) to
                        context.getString(R.string.usb_approval_session_text)
            }

        val builder =
            Notification.Builder(context, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(text)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentIntent(launchPendingIntent)

        if (kind == KIND_PAIRING) {
            builder.addAction(
                Notification.Action.Builder(
                    null,
                    context.getString(R.string.usb_approval_show_pin_action),
                    launchPendingIntent,
                ).build(),
            )
        } else {
            builder.addAction(buildDecisionAction(context, kind, attemptId, approved = true))
        }
        builder.addAction(buildDecisionAction(context, kind, attemptId, approved = false))

        return builder
            .setAutoCancel(true)
            .setTimeoutAfter(APPROVAL_TIMEOUT_MS)
            .setCategory(Notification.CATEGORY_STATUS)
            .build()
    }

    private fun buildDecisionAction(
        context: Context,
        kind: String,
        attemptId: String,
        approved: Boolean,
    ): Notification.Action {
        val action = if (approved) ACTION_APPROVE else ACTION_DENY
        val decisionIntent =
            Intent(context, MobileUsbApprovalActionReceiver::class.java).apply {
                this.action = action
                data = approvalUri(kind, attemptId, action)
                putExtra(EXTRA_KIND, kind)
                putExtra(EXTRA_ATTEMPT_ID, attemptId)
            }
        val pendingIntent =
            PendingIntent.getBroadcast(
                context,
                if (approved) REQUEST_CODE_APPROVE else REQUEST_CODE_DENY,
                decisionIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )

        return Notification.Action.Builder(
            null,
            context.getString(if (approved) R.string.usb_approval_allow_action else R.string.usb_approval_deny_action),
            pendingIntent,
        ).build()
    }

    private fun approvalUri(
        kind: String,
        attemptId: String,
        action: String,
    ): Uri =
        Uri.Builder()
            .scheme("chromvoid")
            .authority("usb-approval")
            .appendPath(action)
            .appendPath(kind)
            .appendPath(attemptId)
            .build()

    fun isKnownKind(kind: String): Boolean = kind == KIND_PAIRING || kind == KIND_SESSION
}
