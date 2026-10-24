package com.chromvoid.air.ui.connections

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Usb
import androidx.compose.material.icons.rounded.UsbOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.DialogProperties
import androidx.compose.ui.window.SecureFlagPolicy
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.ffi.AirUsbLinkState
import com.chromvoid.air.ffi.AirUsbPairingRequest
import com.chromvoid.air.ffi.AirUsbSessionRequest
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType

public const val USB_SECTION_TAG: String = "usb-section"
public const val USB_STATUS_TAG: String = "usb-status"
public const val USB_PAIRING_TAG: String = "usb-pairing"
public const val USB_PIN_TAG: String = "usb-pin"
public const val USB_SESSION_TAG: String = "usb-session"
public const val USB_ALLOW_TAG: String = "usb-allow"
public const val USB_DENY_TAG: String = "usb-deny"

/** What the Connections page says about the USB cable: nothing on it, or the computer there. */
internal fun LazyListScope.usbCable(state: ConnectionsModel.State) {
    item(key = "usb") {
        val usb = state.usb
        val desktop = usb?.desktop ?: stringResource(R.string.usb_a_computer)
        val (title, footer) = when (usb?.state) {
            null -> stringResource(R.string.usb_none) to stringResource(R.string.usb_none_text)
            AirUsbLinkState.CONNECTING -> stringResource(R.string.usb_connecting) to null
            AirUsbLinkState.PAIRING, AirUsbLinkState.AWAITING_APPROVAL ->
                stringResource(R.string.usb_waiting, desktop) to null
            AirUsbLinkState.CONNECTED ->
                stringResource(R.string.usb_connected, desktop) to stringResource(R.string.usb_connected_text)
        }
        AirSection(
            header = stringResource(R.string.usb_section),
            footer = footer,
            modifier = Modifier.testTag(USB_SECTION_TAG),
        ) {
            AirRow(
                title = title,
                icon = if (usb == null) Icons.Rounded.UsbOff else Icons.Rounded.Usb,
                modifier = Modifier.testTag(USB_STATUS_TAG),
            )
        }
    }
}

/**
 * A computer on the USB cable asking the person something, over whatever screen shows: to pair
 * with it, with the PIN its person types there, or to use the vault for this session. Back
 * answers no; nothing else closes it but an answer or the computer going away.
 */
@Composable
public fun UsbApprovalPrompt(model: ConnectionsModel) {
    val state by model.state.collectAsStateWithLifecycle()
    val usb = state.usb ?: return
    val pairing = usb.pairing
    val session = usb.session
    when {
        pairing != null -> PairingPrompt(pairing, onAnswer = model::answerUsbPairing)
        session != null -> SessionPrompt(session, vaultOpen = state.vaultOpen, onAnswer = model::answerUsbSession)
    }
}

@Composable
private fun PairingPrompt(request: AirUsbPairingRequest, onAnswer: (Boolean) -> Unit) {
    val colors = Air.colors
    val spoken = request.pin.toList().joinToString(" ")
    AlertDialog(
        onDismissRequest = { onAnswer(false) },
        // Secure exactly as the app's window is: the PIN stays out of a release build's screenshots.
        properties = DialogProperties(dismissOnClickOutside = false, securePolicy = SecureFlagPolicy.Inherit),
        modifier = Modifier.testTag(USB_PAIRING_TAG),
        title = { Text(stringResource(R.string.usb_pair_title, request.desktop)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(stringResource(R.string.usb_pair_text), style = AirType.body, color = colors.text)
                Text(
                    request.pin.chunked(3).joinToString(" "),
                    style = AirType.largeTitle.copy(fontFamily = FontFamily.Monospace, letterSpacing = 4.sp),
                    color = colors.text,
                    modifier = Modifier.fillMaxWidth().testTag(USB_PIN_TAG).semantics { contentDescription = spoken },
                )
                Text(
                    stringResource(R.string.usb_pair_key, request.fingerprint.chunked(4).joinToString(" ")),
                    style = AirType.footnote.copy(fontFamily = FontFamily.Monospace),
                    color = colors.textSecondary,
                )
                if (request.attemptsLeft < FULL_ATTEMPTS) {
                    Text(
                        stringResource(R.string.usb_pair_attempts, request.attemptsLeft.toInt()),
                        style = AirType.footnote,
                        color = colors.danger,
                    )
                }
                if (request.allowed) {
                    Text(stringResource(R.string.usb_pair_allowed), style = AirType.footnote, color = colors.accent)
                }
            }
        },
        confirmButton = {
            if (!request.allowed) {
                TextButton(onClick = { onAnswer(true) }, modifier = Modifier.testTag(USB_ALLOW_TAG)) {
                    Text(stringResource(R.string.usb_allow), color = colors.accent)
                }
            }
        },
        dismissButton = {
            TextButton(onClick = { onAnswer(false) }, modifier = Modifier.testTag(USB_DENY_TAG)) {
                Text(stringResource(R.string.usb_deny), color = colors.danger)
            }
        },
    )
}

@Composable
private fun SessionPrompt(request: AirUsbSessionRequest, vaultOpen: Boolean, onAnswer: (Boolean) -> Unit) {
    val colors = Air.colors
    AlertDialog(
        onDismissRequest = { onAnswer(false) },
        properties = DialogProperties(dismissOnClickOutside = false, securePolicy = SecureFlagPolicy.Inherit),
        modifier = Modifier.testTag(USB_SESSION_TAG),
        title = { Text(stringResource(R.string.usb_session_title, request.desktop)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(stringResource(R.string.usb_session_text), style = AirType.body, color = colors.text)
                if (!vaultOpen) {
                    Text(
                        stringResource(R.string.usb_session_locked),
                        style = AirType.footnote,
                        color = colors.textSecondary,
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onAnswer(true) }, modifier = Modifier.testTag(USB_ALLOW_TAG)) {
                Text(stringResource(R.string.usb_allow), color = colors.accent)
            }
        },
        dismissButton = {
            TextButton(onClick = { onAnswer(false) }, modifier = Modifier.testTag(USB_DENY_TAG)) {
                Text(stringResource(R.string.usb_deny), color = colors.danger)
            }
        },
    )
}

private const val FULL_ATTEMPTS: UByte = 5u
