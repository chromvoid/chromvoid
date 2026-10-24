package com.chromvoid.air.ui.settings

import com.chromvoid.air.presentation.R
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** The inactivity choices iOS offers. */
public enum class AutoLockTimeout(public val seconds: Long, internal val label: Int) {
    NEVER(0, R.string.auto_lock_never),
    ONE_MINUTE(60, R.string.auto_lock_1m),
    FIVE_MINUTES(300, R.string.auto_lock_5m),
    FIFTEEN_MINUTES(900, R.string.auto_lock_15m),
    THIRTY_MINUTES(1800, R.string.auto_lock_30m),
    ONE_HOUR(3600, R.string.auto_lock_1h),
    ;

    public companion object {
        /** A stored value the list no longer offers reads as the nearest safe one: never longer. */
        public fun of(seconds: Long): AutoLockTimeout =
            entries.firstOrNull { it.seconds == seconds }
                ?: entries.filter { it != NEVER && it.seconds <= seconds }.maxByOrNull { it.seconds }
                ?: if (seconds <= 0) NEVER else ONE_MINUTE
    }
}

/** Where the session choices are kept: the app's private preferences, no vault data. */
public interface SessionPreferences {
    public var autoLockSeconds: Long
    public var keepScreenAwake: Boolean

    /**
     * Whether leaving the app locks the vault. Off by default, as on iOS: the
     * screen is covered and revealed values hidden instead, and the vault
     * stays open until the inactivity lock, an explicit lock or an enabled
     * screen-off lock. Turning the screen off while the app is in the
     * foreground also pauses it, so this setting still locks then.
     */
    public var lockOnLeave: Boolean

    /**
     * Whether turning the screen off locks the vault. Off by default and
     * independent of [lockOnLeave], which can still lock when the screen
     * going off pauses the foreground app.
     */
    public var lockOnScreenOff: Boolean

    /**
     * Whether a notification with Lock shows while the vault is open. On by default: with
     * leaving the app not locking, it is the way to lock from anywhere. It names nothing.
     */
    public var lockNotification: Boolean
}

/** Asks Android to add ChromVoid's Lock tile to Quick Settings; where it cannot, there is none. */
public fun interface LockTileRequest {
    public fun add()
}

/** The runtime's inactivity lock. Rust owns the timer; this only sets its length. */
public fun interface AutoLockControl {
    /** True when the runtime took [seconds]; false when the session moved on or refused. */
    public suspend fun applyAutoLock(seconds: Long): Boolean
}

/**
 * The Session settings: how long the vault may stay open without input,
 * whether leaving the app or turning the screen off locks it, and whether
 * the screen stays on while it is open. A new inactivity length is kept only
 * once the runtime has taken it, so the stored choice and the one in force
 * never disagree.
 */
public class SessionSettingsModel(
    private val control: AutoLockControl,
    private val preferences: SessionPreferences,
    private val scope: CoroutineScope,
    /** The Lock tile's request; null where Android cannot add a tile from the app. */
    private val lockTile: LockTileRequest? = null,
) {
    public data class State(
        val autoLock: AutoLockTimeout,
        val keepScreenAwake: Boolean,
        val lockOnLeave: Boolean,
        val lockOnScreenOff: Boolean,
        val lockNotification: Boolean = true,
        val busy: Boolean = false,
        val failed: Boolean = false,
    )

    private val mutableState = MutableStateFlow(
        State(
            AutoLockTimeout.of(preferences.autoLockSeconds),
            preferences.keepScreenAwake,
            preferences.lockOnLeave,
            preferences.lockOnScreenOff,
            preferences.lockNotification,
        ),
    )
    public val state: StateFlow<State> = mutableState.asStateFlow()

    public fun setAutoLock(timeout: AutoLockTimeout) {
        val current = mutableState.value
        if (current.busy || current.autoLock == timeout) return
        mutableState.value = current.copy(busy = true, failed = false)
        scope.launch {
            mutableState.value = if (control.applyAutoLock(timeout.seconds)) {
                preferences.autoLockSeconds = timeout.seconds
                mutableState.value.copy(autoLock = timeout, busy = false)
            } else {
                mutableState.value.copy(busy = false, failed = true)
            }
        }
    }

    public fun setLockOnLeave(enabled: Boolean) {
        preferences.lockOnLeave = enabled
        mutableState.value = mutableState.value.copy(lockOnLeave = enabled)
    }

    public fun setLockOnScreenOff(enabled: Boolean) {
        preferences.lockOnScreenOff = enabled
        mutableState.value = mutableState.value.copy(lockOnScreenOff = enabled)
    }

    public fun setLockNotification(enabled: Boolean) {
        preferences.lockNotification = enabled
        mutableState.value = mutableState.value.copy(lockNotification = enabled)
    }

    /** Whether Settings offers to add the Lock tile. */
    public val offersLockTile: Boolean get() = lockTile != null

    public fun addLockTile() {
        lockTile?.add()
    }

    public fun setKeepScreenAwake(enabled: Boolean) {
        preferences.keepScreenAwake = enabled
        mutableState.value = mutableState.value.copy(keepScreenAwake = enabled)
    }
}
