package com.chromvoid.app

import android.Manifest
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.activity.result.ActivityResultLauncher
import com.chromvoid.app.shared.NativeBridgeTaskDispatcher
import com.chromvoid.app.shared.NativeRuntimeLoader

internal object VaultStatusNotificationController {
    const val CHANNEL_ID = "chromvoid_vault_status"
    const val NOTIFICATION_ID = 1003

    private const val TAG = "ChromVoid/VaultStatus"
    private const val PREFS_NAME = "chromvoid_vault_status"
    private const val KEY_POST_NOTIFICATIONS_REQUESTED = "post_notifications_requested"

    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var vaultUnlocked = false

    @Volatile
    private var notificationEnabled = true

    @Volatile
    private var quickTileEnabled = true

    @Volatile
    private var postNotificationsPermissionLauncher: ActivityResultLauncher<String>? = null

    @Volatile
    private var quickLockHandlerForTests: ((String) -> Unit)? = null

    fun bindPostNotificationsPermissionLauncher(launcher: ActivityResultLauncher<String>) {
        postNotificationsPermissionLauncher = launcher
    }

    fun clearPostNotificationsPermissionLauncher(launcher: ActivityResultLauncher<String>) {
        if (postNotificationsPermissionLauncher === launcher) {
            postNotificationsPermissionLauncher = null
        }
    }

    @JvmStatic
    fun syncFromNative(
        context: Context,
        unlocked: Boolean,
        notificationEnabled: Boolean,
        quickTileEnabled: Boolean,
    ) {
        runOnMainThread {
            vaultUnlocked = unlocked
            this.notificationEnabled = notificationEnabled
            this.quickTileEnabled = quickTileEnabled
            applyNotificationState(context.applicationContext)
            VaultQuickSettingsTileService.requestStateRefresh(context.applicationContext)
        }
    }

    fun handlePostNotificationsPermissionResult(context: Context) {
        runOnMainThread {
            applyNotificationState(context.applicationContext)
        }
    }

    fun isVaultUnlocked(): Boolean = vaultUnlocked

    fun isQuickTileEnabled(): Boolean = quickTileEnabled

    fun lockVaultFromQuickAction(source: String) {
        quickLockHandlerForTests?.invoke(source)
            ?: NativeBridgeTaskDispatcher.execute("vault.quick_lock") {
                NativeRuntimeLoader.runWhenLoaded(TAG) { nativeOnQuickLockAction(source) }
            }
    }

    fun setQuickLockHandlerForTests(handler: ((String) -> Unit)?) {
        quickLockHandlerForTests = handler
    }

    fun resetForTests() {
        vaultUnlocked = false
        notificationEnabled = true
        quickTileEnabled = true
        quickLockHandlerForTests = null
        postNotificationsPermissionLauncher = null
    }

    private fun applyNotificationState(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return
        if (!vaultUnlocked || !notificationEnabled) {
            manager.cancel(NOTIFICATION_ID)
            return
        }

        val factory = VaultStatusNotificationFactory(context)
        factory.ensureChannel()
        if (!canPostNotifications(context)) {
            requestPostNotificationsOnce()
            manager.cancel(NOTIFICATION_ID)
            return
        }

        manager.notify(NOTIFICATION_ID, factory.build())
    }

    private fun canPostNotifications(context: Context): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun requestPostNotificationsOnce() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        val context = ChromVoidApplication.applicationContextOrNull() ?: return
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        if (prefs.getBoolean(KEY_POST_NOTIFICATIONS_REQUESTED, false)) return
        val launcher = postNotificationsPermissionLauncher ?: return

        prefs.edit().putBoolean(KEY_POST_NOTIFICATIONS_REQUESTED, true).apply()
        launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    private fun runOnMainThread(action: () -> Unit) {
        if (Looper.myLooper() === Looper.getMainLooper()) {
            action()
            return
        }
        mainHandler.post(action)
    }

    @JvmStatic
    private external fun nativeOnQuickLockAction(source: String)
}
