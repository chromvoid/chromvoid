package com.chromvoid.air.ui.maintenance

import com.chromvoid.air.ffi.BridgeException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** A device-local Android operation, never a vault RPC or a password recovery method. */
public fun interface AppReset {
    /** True means Android accepted the request; the process ends before completion can be reported. */
    public fun requestReset(): Boolean
}

/** Two explicit steps before asking Android to erase this application's data. */
public class AppResetModel(private val reset: AppReset) {
    public enum class Status { WARNING, CONFIRMING, REQUESTED, FAILED, REVOKED }

    public enum class Issue { ACKNOWLEDGEMENT_REQUIRED, ADOPTION_REQUIRED }

    public data class State(
        val status: Status = Status.WARNING,
        val acknowledged: Boolean = false,
        val issue: Issue? = null,
    )

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()

    public fun acknowledge(value: Boolean) {
        if (mutableState.value.status != Status.WARNING) return
        mutableState.value = State(acknowledged = value)
    }

    public fun review() {
        val current = mutableState.value
        if (current.status != Status.WARNING) return
        mutableState.value = if (current.acknowledged) {
            current.copy(status = Status.CONFIRMING, issue = null)
        } else {
            current.copy(issue = Issue.ACKNOWLEDGEMENT_REQUIRED)
        }
    }

    public fun cancelConfirmation() {
        if (mutableState.value.status == Status.CONFIRMING) mutableState.value = State()
    }

    public fun confirm() {
        if (mutableState.value.status != Status.CONFIRMING) return
        mutableState.value = State(status = Status.REQUESTED)
        val accepted = try {
            reset.requestReset()
        } catch (_: BridgeException.AdoptionActionForbidden) {
            mutableState.value = State(status = Status.FAILED, issue = Issue.ADOPTION_REQUIRED)
            return
        } catch (_: Exception) {
            false
        }
        if (!accepted) mutableState.value = State(status = Status.FAILED)
    }

    public fun retry() {
        if (mutableState.value.status == Status.FAILED) mutableState.value = State()
    }

    public fun revoke() {
        mutableState.value = State(status = Status.REVOKED)
    }
}
