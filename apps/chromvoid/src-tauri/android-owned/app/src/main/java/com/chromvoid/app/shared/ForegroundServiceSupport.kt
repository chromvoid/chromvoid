package com.chromvoid.app.shared

import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat

internal object ForegroundServiceSupport {
    @Volatile
    private var startForegroundServiceForTests: ((Context, Intent) -> Unit)? = null

    @Volatile
    private var enterForegroundForTests: ((Service, Int, Notification, Int?) -> Unit)? = null

    fun startForegroundService(
        context: Context,
        intent: Intent,
        tag: String,
    ): Boolean {
        return try {
            startForegroundServiceForTests?.invoke(context, intent)
                ?: ContextCompat.startForegroundService(context, intent)
            true
        } catch (error: SecurityException) {
            Log.w(tag, "Foreground service start denied", error)
            false
        } catch (error: IllegalStateException) {
            Log.w(tag, "Foreground service start is not allowed in the current app state", error)
            false
        }
    }

    fun enterForeground(
        service: Service,
        notificationId: Int,
        notification: Notification,
        foregroundServiceType: Int?,
        tag: String,
    ): Boolean {
        return try {
            val override = enterForegroundForTests
            if (override != null) {
                override(service, notificationId, notification, foregroundServiceType)
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && foregroundServiceType != null) {
                service.startForeground(notificationId, notification, foregroundServiceType)
            } else {
                service.startForeground(notificationId, notification)
            }
            true
        } catch (error: SecurityException) {
            Log.w(tag, "Foreground entry denied", error)
            false
        } catch (error: RuntimeException) {
            Log.w(tag, "Foreground entry failed", error)
            false
        }
    }

    internal fun setStartForegroundServiceForTests(starter: ((Context, Intent) -> Unit)?) {
        startForegroundServiceForTests = starter
    }

    internal fun setEnterForegroundForTests(starter: ((Service, Int, Notification, Int?) -> Unit)?) {
        enterForegroundForTests = starter
    }

    internal fun resetForTests() {
        startForegroundServiceForTests = null
        enterForegroundForTests = null
    }
}
