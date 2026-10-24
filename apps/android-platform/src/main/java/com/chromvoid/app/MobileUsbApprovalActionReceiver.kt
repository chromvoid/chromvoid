package com.chromvoid.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.chromvoid.app.nativebridge.MobileUsbAccessoryNativeShell
import com.chromvoid.app.shared.NativeBridgeTaskDispatcher
import com.chromvoid.app.shared.UsbApprovalNotificationFactory

/** Resolves an explicit USB desktop approval directly from a notification action. */
class MobileUsbApprovalActionReceiver : BroadcastReceiver() {
    override fun onReceive(
        context: Context,
        intent: Intent,
    ) {
        val approved =
            when (intent.action) {
                UsbApprovalNotificationFactory.ACTION_APPROVE -> true
                UsbApprovalNotificationFactory.ACTION_DENY -> false
                else -> return
            }
        val kind = intent.getStringExtra(UsbApprovalNotificationFactory.EXTRA_KIND) ?: return
        val attemptId = intent.getStringExtra(UsbApprovalNotificationFactory.EXTRA_ATTEMPT_ID) ?: return
        if (
            !UsbApprovalNotificationFactory.isKnownKind(kind) ||
                attemptId.isBlank() ||
                (kind == UsbApprovalNotificationFactory.KIND_PAIRING && approved)
        ) {
            Log.w(TAG, "Ignoring malformed USB approval notification action")
            return
        }

        val result = goAsync()
        val scheduled =
            NativeBridgeTaskDispatcher.execute("mobile_usb.approval") {
                try {
                    if (MobileUsbAccessoryNativeShell.resolveNativeUsbApproval(kind, attemptId, approved)) {
                        UsbApprovalNotificationFactory.cancel(context.applicationContext)
                    }
                } finally {
                    result.finish()
                }
            }
        if (!scheduled) result.finish()
    }

    private companion object {
        private const val TAG = "ChromVoid/MobileUsb"
    }
}
