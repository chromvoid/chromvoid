package com.chromvoid.air.ui.access

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** The device's own authentication: biometrics or the screen lock. */
public interface PresenceCheck {
    public enum class Result { ACCEPTED, CANCELLED, FAILED, UNAVAILABLE }

    public suspend fun authenticate(): Result

    public fun cancel()
}

/** Where the person's choice to use the gate is kept; it holds no vault data. */
public interface PresencePreference {
    public var enabled: Boolean
}

/**
 * The optional app-presence gate (ADR-032). When it is on, the app asks for
 * the device's authentication each time it returns to the foreground, before
 * it shows anything - even the unlock screen. It only admits the person to
 * the app: it never unlocks the vault and never stands in for its password.
 */
public class PresenceGate(
    private val check: PresenceCheck,
    private val preference: PresencePreference,
    private val scope: CoroutineScope,
) {
    public enum class Issue { NOT_CONFIRMED, UNAVAILABLE }

    public data class State(
        val enabled: Boolean,
        val satisfied: Boolean = false,
        val busy: Boolean = false,
        val issue: Issue? = null,
    ) {
        /** True while the app must show the gate instead of anything else. */
        val required: Boolean get() = enabled && !satisfied
    }

    private val mutableState = MutableStateFlow(State(enabled = preference.enabled))
    public val state: StateFlow<State> = mutableState.asStateFlow()
    private var work: Job? = null

    /** The app left the foreground: the next return asks again. A check in progress is left alone. */
    public fun onBackground() {
        val current = mutableState.value
        if (current.busy) return
        mutableState.value = current.copy(satisfied = false, issue = null)
    }

    /** Asks for the device's authentication while the gate is shown. */
    public fun authenticate() {
        if (mutableState.value.required) run(enabling = false)
    }

    /** Turning the gate on first proves the device can authenticate the person. */
    public fun setEnabled(enabled: Boolean) {
        val current = mutableState.value
        if (current.busy || current.enabled == enabled) return
        if (enabled) {
            run(enabling = true)
        } else {
            preference.enabled = false
            mutableState.value = State(enabled = false)
        }
    }

    public fun close() {
        work?.cancel()
        check.cancel()
    }

    private fun run(enabling: Boolean) {
        if (mutableState.value.busy) return
        mutableState.value = mutableState.value.copy(busy = true, issue = null)
        work = scope.launch {
            val result = try {
                check.authenticate()
            } catch (cancellation: CancellationException) {
                mutableState.value = mutableState.value.copy(busy = false)
                throw cancellation
            } catch (error: Exception) {
                PresenceCheck.Result.FAILED
            }
            mutableState.value = when (result) {
                PresenceCheck.Result.ACCEPTED -> {
                    if (enabling) preference.enabled = true
                    State(enabled = preference.enabled, satisfied = true)
                }
                PresenceCheck.Result.CANCELLED -> mutableState.value.copy(busy = false)
                PresenceCheck.Result.FAILED -> mutableState.value.copy(busy = false, issue = Issue.NOT_CONFIRMED)
                PresenceCheck.Result.UNAVAILABLE -> mutableState.value.copy(busy = false, issue = Issue.UNAVAILABLE)
            }
        }
    }
}
