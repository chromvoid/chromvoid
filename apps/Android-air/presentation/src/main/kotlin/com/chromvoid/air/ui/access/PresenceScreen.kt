package com.chromvoid.air.ui.access

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.HowToReg
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.AirType

public const val PRESENCE_SCREEN_TAG: String = "presence-screen"
public const val PRESENCE_CONFIRM_TAG: String = "presence-confirm"
public const val PRESENCE_ISSUE_TAG: String = "presence-issue"

/** Shown instead of everything else until the device confirms the person; it asks once on its own. */
@Composable
public fun PresenceScreen(gate: PresenceGate) {
    val state by gate.state.collectAsStateWithLifecycle()
    LaunchedEffect(Unit) { gate.authenticate() }
    AccessMessage(
        icon = Icons.Rounded.HowToReg,
        title = stringResource(R.string.presence_title),
        message = stringResource(R.string.presence_text),
        action = stringResource(R.string.presence_confirm),
        onAction = gate::authenticate,
        busy = state.busy,
        modifier = Modifier.testTag(PRESENCE_SCREEN_TAG),
        actionModifier = Modifier.testTag(PRESENCE_CONFIRM_TAG),
    ) {
        state.issue?.let { issue ->
            Text(
                stringResource(
                    when (issue) {
                        PresenceGate.Issue.NOT_CONFIRMED -> R.string.presence_not_confirmed
                        PresenceGate.Issue.UNAVAILABLE -> R.string.presence_unavailable
                    },
                ),
                style = AirType.body,
                color = Air.colors.textSecondary,
                textAlign = TextAlign.Center,
                modifier = Modifier.testTag(PRESENCE_ISSUE_TAG),
            )
        }
    }
}
