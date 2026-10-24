package com.chromvoid.air.ui

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.chromvoid.air.bridge.BridgeProbe
import com.chromvoid.air.bridge.BridgeProbing
import com.chromvoid.air.bridge.BridgeProbeResult
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

public sealed interface BridgeProbeUiState {
    public data object Checking : BridgeProbeUiState

    public data class Ready(val lines: List<Pair<String, String>>) : BridgeProbeUiState

    public data class Failed(val code: String, val detail: String?) : BridgeProbeUiState
}

/**
 * The W1 shell has one job: say whether the native bridge is usable, and why
 * not when it is not. It holds no vault state and shows no vault content.
 */
public class BridgeProbeViewModel(
    private val context: Context,
    private val probe: BridgeProbing = BridgeProbe(),
) : ViewModel() {
    private val mutableState = MutableStateFlow<BridgeProbeUiState>(BridgeProbeUiState.Checking)
    public val state: StateFlow<BridgeProbeUiState> = mutableState.asStateFlow()

    init {
        check()
    }

    public fun check() {
        mutableState.value = BridgeProbeUiState.Checking
        viewModelScope.launch {
            mutableState.value = when (val result = probe.run(context)) {
                is BridgeProbeResult.Ready -> BridgeProbeUiState.Ready(
                    listOf(
                        "protocol" to result.report.protocolVersion.toString(),
                        "fingerprint" to result.report.fingerprint,
                        "fixture" to result.report.fixtureEnabled.toString(),
                        "storage root" to result.report.storageRoot,
                        "locked at start" to result.report.initiallyLocked.toString(),
                        "entries" to result.report.entryCount.toString(),
                        "folders" to result.report.folderCount.toString(),
                        "locked after probe" to result.report.lockedAfterProbe.toString(),
                    ),
                )
                is BridgeProbeResult.Unavailable ->
                    BridgeProbeUiState.Failed(result.code, result.detail)
            }
        }
    }

    public companion object {
        public fun factory(context: Context): ViewModelProvider.Factory =
            object : ViewModelProvider.Factory {
                @Suppress("UNCHECKED_CAST")
                override fun <T : ViewModel> create(modelClass: Class<T>): T =
                    BridgeProbeViewModel(context.applicationContext) as T
            }
    }
}
