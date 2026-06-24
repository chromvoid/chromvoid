package com.chromvoid.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.hardware.usb.UsbManager
import com.chromvoid.app.nativebridge.MobileUsbAccessoryForegroundRuntime
import com.chromvoid.app.nativebridge.MobileUsbAccessoryIntentContract

class MobileUsbAccessorySystemReceiver : BroadcastReceiver() {
    override fun onReceive(
        context: Context,
        intent: Intent?,
    ) {
        val appContext = context.applicationContext
        when (intent?.action) {
            MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_HANDSHAKE ->
                MobileUsbAccessoryForegroundRuntime.handleSystemAccessoryHandshake(appContext)
            MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_DEBUG_HANDSHAKE ->
                if (BuildConfig.DEBUG) {
                    MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(appContext)
                } else {
                    Unit
                }
            UsbManager.ACTION_USB_ACCESSORY_ATTACHED,
            UsbManager.ACTION_USB_ACCESSORY_DETACHED ->
                MobileUsbAccessoryForegroundRuntime.handleIntent(appContext, intent)
            else -> Unit
        }
    }
}
