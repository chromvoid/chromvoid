package com.chromvoid.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class VaultQuickLockReceiver : BroadcastReceiver() {
    override fun onReceive(
        context: Context,
        intent: Intent?,
    ) {
        if (intent?.action != ACTION_LOCK_FROM_NOTIFICATION) return
        VaultStatusNotificationController.lockVaultFromQuickAction(SOURCE_NOTIFICATION)
    }

    companion object {
        const val ACTION_LOCK_FROM_NOTIFICATION = "com.chromvoid.app.ACTION_LOCK_VAULT_FROM_NOTIFICATION"
        const val SOURCE_NOTIFICATION = "vault_status_notification"
    }
}
