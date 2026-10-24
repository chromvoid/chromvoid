package com.chromvoid.air.session

import android.content.Context
import com.chromvoid.air.ui.settings.SessionPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** The Session settings in the app's private preferences; backups exclude them. */
internal class StoredSessionPreferences(context: Context) : SessionPreferences {
    private val preferences = context.getSharedPreferences("air-session", Context.MODE_PRIVATE)

    override var autoLockSeconds: Long
        get() = preferences.getLong(AUTO_LOCK, 0)
        set(value) {
            preferences.edit().putLong(AUTO_LOCK, value).apply()
        }

    override var keepScreenAwake: Boolean
        get() = preferences.getBoolean(KEEP_AWAKE, false)
        set(value) {
            preferences.edit().putBoolean(KEEP_AWAKE, value).apply()
        }

    override var lockOnLeave: Boolean
        get() = preferences.getBoolean(LOCK_ON_LEAVE, false)
        set(value) {
            preferences.edit().putBoolean(LOCK_ON_LEAVE, value).apply()
        }

    override var lockOnScreenOff: Boolean
        get() = preferences.getBoolean(LOCK_ON_SCREEN_OFF, false)
        set(value) {
            preferences.edit().putBoolean(LOCK_ON_SCREEN_OFF, value).apply()
        }

    private val mutableLockNotification = MutableStateFlow(preferences.getBoolean(LOCK_NOTIFICATION, true))

    /** The lock notification's choice as it changes, for the surfaces outside the app. */
    val lockNotificationChoice: StateFlow<Boolean> = mutableLockNotification.asStateFlow()

    override var lockNotification: Boolean
        get() = mutableLockNotification.value
        set(value) {
            preferences.edit().putBoolean(LOCK_NOTIFICATION, value).apply()
            mutableLockNotification.value = value
        }

    private companion object {
        const val AUTO_LOCK = "auto-lock-seconds"
        const val KEEP_AWAKE = "keep-screen-awake"
        const val LOCK_ON_LEAVE = "lock-on-leave"
        const val LOCK_ON_SCREEN_OFF = "lock-on-screen-off"
        const val LOCK_NOTIFICATION = "lock-notification"
    }
}
