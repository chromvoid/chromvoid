package com.chromvoid.air.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.R

public const val BRIDGE_PROBE_STATUS_TAG: String = "bridge-probe-status"
public const val BRIDGE_PROBE_RETRY_TAG: String = "bridge-probe-retry"

@Composable
public fun BridgeProbeScreen(model: BridgeProbeViewModel) {
    val state by model.state.collectAsStateWithLifecycle()
    Scaffold { insets ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(insets)
                .padding(24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = stringResource(R.string.bridge_probe_title),
                style = MaterialTheme.typography.headlineSmall,
            )
            when (state) {
                BridgeProbeUiState.Checking -> Checking()
                is BridgeProbeUiState.Ready -> Ready(state as BridgeProbeUiState.Ready)
                is BridgeProbeUiState.Failed -> Failed(state as BridgeProbeUiState.Failed, model)
            }
        }
    }
}

@Composable
private fun Checking() {
    Row(
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator()
        Text(
            text = stringResource(R.string.bridge_probe_checking),
            modifier = Modifier.testTag(BRIDGE_PROBE_STATUS_TAG),
        )
    }
}

@Composable
private fun Ready(state: BridgeProbeUiState.Ready) {
    Text(
        text = stringResource(R.string.bridge_probe_ready),
        style = MaterialTheme.typography.titleMedium,
        modifier = Modifier.testTag(BRIDGE_PROBE_STATUS_TAG),
    )
    state.lines.forEach { (label, value) ->
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(text = label, style = MaterialTheme.typography.labelLarge)
            Text(text = value, style = MaterialTheme.typography.bodyMedium)
        }
    }
}

@Composable
private fun Failed(state: BridgeProbeUiState.Failed, model: BridgeProbeViewModel) {
    Text(
        text = stringResource(R.string.bridge_probe_failed),
        style = MaterialTheme.typography.titleMedium,
        color = MaterialTheme.colorScheme.error,
        modifier = Modifier.testTag(BRIDGE_PROBE_STATUS_TAG),
    )
    Text(text = state.code, style = MaterialTheme.typography.bodyMedium)
    state.detail?.let { Text(text = it, style = MaterialTheme.typography.bodySmall) }
    Button(
        onClick = model::check,
        modifier = Modifier.testTag(BRIDGE_PROBE_RETRY_TAG),
    ) {
        Text(text = stringResource(R.string.bridge_probe_retry))
    }
}
