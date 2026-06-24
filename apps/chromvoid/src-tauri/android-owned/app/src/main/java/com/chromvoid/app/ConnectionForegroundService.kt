package com.chromvoid.app

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import com.chromvoid.app.nativebridge.MobileUsbAccessoryForegroundRuntime
import com.chromvoid.app.shared.ConnectionNotificationFactory
import com.chromvoid.app.shared.ForegroundServiceSupport
import com.chromvoid.app.shared.NativeRuntimeLoader

/**
 * Foreground service that keeps the active remote host transport alive when the app is backgrounded.
 *
 * Lifecycle:
 * - Started when `mobile_acceptor_start` is invoked via Tauri command.
 * - Stopped when `mobile_acceptor_stop` is invoked or the connection drops.
 * - Shows a persistent notification with connection status and a disconnect action.
 */
class ConnectionForegroundService : Service() {
    private lateinit var notificationFactory: ConnectionNotificationFactory
    private var foregroundStarted = false
    private var serviceOwner: ConnectionForegroundOwner? = null
    private var ownerStopNotified = false

    companion object {
        private const val TAG = "ChromVoid/ConnectionFg"
        const val CHANNEL_ID = "chromvoid_connection"
        const val NOTIFICATION_ID = 1001

        const val ACTION_START = "com.chromvoid.app.ACTION_START_CONNECTION_SERVICE"
        const val ACTION_STOP = "com.chromvoid.app.ACTION_STOP_CONNECTION_SERVICE"
        const val ACTION_DISCONNECT = "com.chromvoid.app.ACTION_DISCONNECT"
        const val ACTION_START_USB_ACCESSORY = "com.chromvoid.app.ACTION_START_USB_ACCESSORY_CONNECTION"
        const val ACTION_STOP_USB_ACCESSORY = "com.chromvoid.app.ACTION_STOP_USB_ACCESSORY_CONNECTION"
        const val ACTION_USB_ACCESSORY_DISCONNECT = "com.chromvoid.app.ACTION_USB_ACCESSORY_DISCONNECT"

        const val EXTRA_DEVICE_NAME = "device_name"
        const val EXTRA_USB_ACCESSORY_SESSION_LABEL = "usb_accessory_session_label"

        @Volatile
        private var activeOwner: ConnectionForegroundOwner? = null

        /**
         * Start the foreground service with an optional connected device name.
         */
        @JvmStatic
        fun start(context: Context, deviceName: String?): Boolean {
            if (!claimOwner(ConnectionForegroundOwner.Network)) return false
            val intent = Intent(context, ConnectionForegroundService::class.java).apply {
                action = ACTION_START
                deviceName?.let { putExtra(EXTRA_DEVICE_NAME, it) }
            }
            val started = ForegroundServiceSupport.startForegroundService(context, intent, TAG)
            if (!started) releaseOwner(ConnectionForegroundOwner.Network)
            return started
        }

        @JvmStatic
        fun startUsbAccessory(context: Context, sessionLabel: String?): Boolean {
            if (!claimOwner(ConnectionForegroundOwner.UsbMobile)) return false
            val intent = Intent(context, ConnectionForegroundService::class.java).apply {
                action = ACTION_START_USB_ACCESSORY
                sessionLabel?.let { putExtra(EXTRA_USB_ACCESSORY_SESSION_LABEL, it) }
            }
            val started = ForegroundServiceSupport.startForegroundService(context, intent, TAG)
            if (!started) releaseOwner(ConnectionForegroundOwner.UsbMobile)
            return started
        }

        /**
         * Stop the foreground service.
         */
        @JvmStatic
        fun stop(context: Context) {
            context.stopService(Intent(context, ConnectionForegroundService::class.java))
        }

        @JvmStatic
        fun disconnectUsbAccessory(context: Context): Boolean {
            val intent = Intent(context, ConnectionForegroundService::class.java).apply {
                action = ACTION_USB_ACCESSORY_DISCONNECT
            }
            return ForegroundServiceSupport.startForegroundService(context, intent, TAG)
        }

        @JvmStatic
        fun stopUsbAccessory(context: Context) {
            releaseOwner(ConnectionForegroundOwner.UsbMobile)
            context.stopService(Intent(context, ConnectionForegroundService::class.java))
        }

        internal fun activeOwnerForTests(): ConnectionForegroundOwner? = activeOwner

        internal fun resetOwnerForTests() {
            activeOwner = null
        }

        private fun claimOwner(owner: ConnectionForegroundOwner): Boolean =
            synchronized(this) {
                val current = activeOwner
                if (current != null && current != owner) {
                    Log.w(TAG, "Connection foreground service already owned by $current")
                    return@synchronized false
                }
                activeOwner = owner
                true
            }

        private fun releaseOwner(owner: ConnectionForegroundOwner?) {
            synchronized(this) {
                if (owner == null || activeOwner == owner) {
                    activeOwner = null
                }
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        notificationFactory = ConnectionNotificationFactory(this)
        notificationFactory.ensureChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                if (!claimServiceOwner(ConnectionForegroundOwner.Network)) return START_NOT_STICKY
                val deviceName = intent.getStringExtra(EXTRA_DEVICE_NAME) ?: "Desktop"
                if (!enterForeground(notificationFactory.build(deviceName))) {
                    stopConnectionService(ConnectionForegroundOwner.Network, stopId = startId)
                    return START_NOT_STICKY
                }
                return START_STICKY
            }
            ACTION_START_USB_ACCESSORY -> {
                if (!claimServiceOwner(ConnectionForegroundOwner.UsbMobile)) return START_NOT_STICKY
                val label =
                    intent.getStringExtra(EXTRA_USB_ACCESSORY_SESSION_LABEL) ?: "USB Mobile"
                if (!enterForeground(
                        notificationFactory.build(
                            label,
                            ACTION_USB_ACCESSORY_DISCONNECT,
                        ),
                    )
                ) {
                    stopConnectionService(ConnectionForegroundOwner.UsbMobile, stopId = startId)
                    return START_NOT_STICKY
                }
                return START_STICKY
            }
            ACTION_STOP -> {
                stopConnectionService(ConnectionForegroundOwner.Network)
                return START_NOT_STICKY
            }
            ACTION_DISCONNECT -> {
                stopConnectionService(serviceOwner ?: activeOwner ?: ConnectionForegroundOwner.Network)
                return START_NOT_STICKY
            }
            ACTION_STOP_USB_ACCESSORY, ACTION_USB_ACCESSORY_DISCONNECT -> {
                stopConnectionService(ConnectionForegroundOwner.UsbMobile)
                return START_NOT_STICKY
            }
            else -> {
                // Unknown action — start with default notification to avoid crash.
                if (!claimServiceOwner(ConnectionForegroundOwner.Network)) return START_NOT_STICKY
                if (!enterForeground(notificationFactory.build("Desktop"))) {
                    stopConnectionService(ConnectionForegroundOwner.Network, stopId = startId)
                    return START_NOT_STICKY
                }
                return START_STICKY
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopForegroundIfStarted()
        if (!ownerStopNotified) {
            notifyOwnerStopped(serviceOwner ?: activeOwner ?: ConnectionForegroundOwner.Network)
        }
        super.onDestroy()
    }

    private fun enterForeground(notification: Notification): Boolean {
        val started =
            ForegroundServiceSupport.enterForeground(
                this,
                NOTIFICATION_ID,
                notification,
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
                } else {
                    null
                },
                TAG,
            )
        foregroundStarted = started
        return started
    }

    private fun stopConnectionService(
        owner: ConnectionForegroundOwner,
        stopId: Int? = null,
    ) {
        stopForegroundIfStarted()
        notifyOwnerStopped(owner)
        if (stopId == null) {
            stopSelf()
        } else {
            stopSelf(stopId)
        }
    }

    private fun stopForegroundIfStarted() {
        if (!foregroundStarted) return
        runCatching {
            stopForeground(STOP_FOREGROUND_REMOVE)
        }.onFailure { error ->
            Log.w(TAG, "Failed to stop connection foreground notification", error)
        }
        foregroundStarted = false
    }

    private fun claimServiceOwner(owner: ConnectionForegroundOwner): Boolean {
        if (!Companion.claimOwner(owner)) return false
        serviceOwner = owner
        ownerStopNotified = false
        return true
    }

    private fun notifyOwnerStopped(owner: ConnectionForegroundOwner) {
        if (ownerStopNotified) return
        ownerStopNotified = true
        releaseOwner(owner)
        serviceOwner = null
        when (owner) {
            ConnectionForegroundOwner.Network -> notifyNetworkServiceStopped()
            ConnectionForegroundOwner.UsbMobile -> {
                MobileUsbAccessoryForegroundRuntime.disconnectActive(applicationContext)
            }
        }
    }

    private fun notifyNetworkServiceStopped() {
        runCatching {
            NativeRuntimeLoader.runWhenLoaded(TAG) { nativeOnServiceStopped() }
        }
            .onFailure { error ->
                Log.w(TAG, "Failed to notify native connection shutdown", error)
            }
    }

    // ── JNI callback — implemented in Rust (.so) ──────────────────────────
    // Called when the service is destroyed so Rust can update acceptor state.
    private external fun nativeOnServiceStopped()
}

internal enum class ConnectionForegroundOwner {
    Network,
    UsbMobile,
}
