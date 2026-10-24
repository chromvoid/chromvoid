package com.chromvoid.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.chromvoid.app.nativebridge.MobileUsbAccessoryForegroundRuntime

class MobileUsbAccessoryReceiver : BroadcastReceiver() {
    override fun onReceive(
        context: Context,
        intent: Intent?,
    ) {
        MobileUsbAccessoryForegroundRuntime.handleIntent(context.applicationContext, intent)
    }
}
