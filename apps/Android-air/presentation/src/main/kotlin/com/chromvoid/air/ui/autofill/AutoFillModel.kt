package com.chromvoid.air.ui.autofill

import android.content.Intent
import com.chromvoid.air.ui.support.FailureKind
import com.chromvoid.air.ui.support.failureKind
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The AutoFill page of one unlocked generation, as on iOS: where the system stands, whether
 * this vault can answer, and the way to the system's setting. Its status is read again each
 * time the page comes back on screen - the person may have changed the setting meanwhile -
 * and a lock ends it.
 */
public class AutoFillModel(
    private val store: AutoFillStore,
    public val generation: ULong,
    private val scope: CoroutineScope,
) {
    public enum class Phase { LOADING, READY, FAILED, REVOKED }

    /** What the page says about this vault answering other apps. */
    public enum class Access { AUTHORIZED, VAULT_CLOSED, UNAVAILABLE }

    public data class State(
        val phase: Phase = Phase.LOADING,
        val status: AutoFillStatus? = null,
        val settingsFailed: Boolean = false,
    ) {
        val access: Access?
            get() = status?.let {
                when {
                    !it.providerReady -> Access.UNAVAILABLE
                    !it.vaultOpen -> Access.VAULT_CLOSED
                    else -> Access.AUTHORIZED
                }
            }
    }

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()
    private var work: Job? = null

    /** The system screen to open; null where the device offers none. */
    public val settingsIntent: Intent? get() = store.settingsIntent()

    /** The system screen for passkey providers; null before Android 14. */
    public val passkeySettingsIntent: Intent? get() = store.passkeySettingsIntent()

    public fun reload() {
        if (mutableState.value.phase == Phase.REVOKED) return
        work?.cancel()
        mutableState.value = mutableState.value.copy(phase = Phase.LOADING, status = null)
        work = scope.launch {
            try {
                val status = store.status(generation)
                mutableState.value = mutableState.value.copy(phase = Phase.READY, status = status)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                mutableState.value = if (error.failureKind == FailureKind.REVOKED) {
                    State(phase = Phase.REVOKED)
                } else {
                    mutableState.value.copy(phase = Phase.FAILED)
                }
            }
        }
    }

    /** The system screen opened; its answer arrives as the page comes back. */
    public fun settingsOpened() {
        mutableState.value = mutableState.value.copy(settingsFailed = false)
    }

    /** The device has no screen for the setting after all. */
    public fun settingsFailed() {
        mutableState.value = mutableState.value.copy(settingsFailed = true)
    }

    public fun close() {
        work?.cancel()
        mutableState.value = State(phase = Phase.REVOKED)
    }
}
