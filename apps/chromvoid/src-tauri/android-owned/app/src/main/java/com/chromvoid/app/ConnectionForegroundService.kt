package com.chromvoid.app

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import com.chromvoid.app.shared.ConnectionNotificationFactory

/**
 * Foreground service that keeps the WebRTC/WSS connection alive when the app is backgrounded.
 *
 * Lifecycle:
 * - Started when `mobile_acceptor_start` is invoked via Tauri command.
 * - Stopped when `mobile_acceptor_stop` is invoked or the connection drops.
 * - Shows a persistent notification with connection status and a disconnect action.
 */
class ConnectionForegroundService : Service() {
    private lateinit var notificationFactory: ConnectionNotificationFactory

    companion object {
        private const val TAG = "ChromVoid/ConnectionFg"
        const val CHANNEL_ID = "chromvoid_connection"
        const val NOTIFICATION_ID = 1001

        const val ACTION_START = "com.chromvoid.app.ACTION_START_CONNECTION_SERVICE"
        const val ACTION_STOP = "com.chromvoid.app.ACTION_STOP_CONNECTION_SERVICE"
        const val ACTION_DISCONNECT = "com.chromvoid.app.ACTION_DISCONNECT"

        const val EXTRA_DEVICE_NAME = "device_name"

        /**
         * Start the foreground service with an optional connected device name.
         */
        @JvmStatic
        fun start(context: Context, deviceName: String?) {
            val intent = Intent(context, ConnectionForegroundService::class.java).apply {
                action = ACTION_START
                deviceName?.let { putExtra(EXTRA_DEVICE_NAME, it) }
            }
            context.startForegroundService(intent)
        }

        /**
         * Stop the foreground service.
         */
        @JvmStatic
        fun stop(context: Context) {
            val intent = Intent(context, ConnectionForegroundService::class.java).apply {
                action = ACTION_STOP
            }
            context.startService(intent)
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
                val deviceName = intent.getStringExtra(EXTRA_DEVICE_NAME) ?: "Desktop"
                val notification = notificationFactory.build(deviceName)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
                    )
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
            }
            ACTION_STOP, ACTION_DISCONNECT -> {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
            else -> {
                // Unknown action — start with default notification to avoid crash.
                val notification = notificationFactory.build("Desktop")
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE
                    )
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
            }
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        // Notify Rust side that the service was destroyed (e.g., by system kill).
        runCatching { nativeOnServiceStopped() }
            .onFailure { error ->
                Log.w(TAG, "Failed to notify native connection shutdown", error)
            }
    }

    // ── JNI callback — implemented in Rust (.so) ──────────────────────────
    // Called when the service is destroyed so Rust can update acceptor state.
    private external fun nativeOnServiceStopped()
}
