package com.chromvoid.air.ui.connections

import android.content.Intent
import android.text.format.DateUtils
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Computer
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.LockOpen
import androidx.compose.material.icons.rounded.Smartphone
import androidx.compose.material.icons.rounded.WifiTethering
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.ffi.AirHostPeer
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirQrCode
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.DoneButton
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.SectionFooter
import com.chromvoid.air.ui.design.TabBarClearance

public const val CONNECTIONS_TAG: String = "connections"
public const val CONNECTIONS_LIST_TAG: String = "connections-list"
public const val CONNECTIONS_DONE_TAG: String = "connections-done"
public const val HOST_SUMMARY_TAG: String = "host-summary"
public const val HOST_VAULT_TAG: String = "host-vault"
public const val HOST_RELAY_TAG: String = "host-relay"
public const val HOST_ISSUE_TAG: String = "host-issue"
public const val HOST_RETRY_TAG: String = "host-retry"
public const val HOST_STOP_TAG: String = "host-stop"
public const val HOST_START_TAG: String = "host-start"
public const val HOST_PAIR_TAG: String = "host-pair"
public const val HOST_CODE_TAG: String = "host-code"
public const val HOST_INVITATION_TAG: String = "host-invitation"
public const val HOST_SHARE_TAG: String = "host-share"
public const val HOST_COPY_TAG: String = "host-copy"
public const val HOST_CANCEL_TAG: String = "host-cancel"
public const val HOST_NO_PEERS_TAG: String = "host-no-peers"
public const val HOST_REVOKE_CONFIRM_TAG: String = "host-revoke-confirm"

public fun hostPeerTag(peerId: String): String = "host-peer-$peerId"

public fun hostRevokeTag(peerId: String): String = "host-revoke-$peerId"

/**
 * This device as a host, as the iOS Connections page: what the host is doing
 * and whether the vault is open, the relay and the start, pair and stop
 * actions, the code and invitation while a computer is being added, and the
 * trusted computers with a way to revoke each.
 *
 * [pausesOnLeave] is the Session setting: leaving the app either pauses the
 * host, as on iOS, or leaves it running behind its notification.
 * [beforeHostStarts] lets the app ask for what the running host needs - the
 * notification that shows it - before [proceed] starts it.
 */
@Composable
public fun ConnectionsScreen(
    model: ConnectionsModel,
    modifier: Modifier = Modifier,
    pausesOnLeave: Boolean = false,
    onDone: (() -> Unit)? = null,
    onLock: (() -> Unit)? = null,
    beforeHostStarts: (proceed: () -> Unit) -> Unit = { it() },
) {
    val state by model.state.collectAsStateWithLifecycle()
    AirScreen(
        title = stringResource(R.string.root_connections),
        modifier = modifier,
        listTag = CONNECTIONS_LIST_TAG,
        leading = onDone?.let { done ->
            {
                DoneButton(
                    stringResource(R.string.tags_done),
                    onClick = done,
                    modifier = Modifier.testTag(CONNECTIONS_DONE_TAG),
                )
            }
        },
        actions = onLock?.let { lock ->
            { PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = lock) }
        },
    ) {
        item(key = "host") { HostHeader(state, pausesOnLeave) }
        when (state.phase) {
            ConnectionsModel.Phase.LOADING, ConnectionsModel.Phase.SUSPENDED -> item(key = "loading") {
                Working(R.string.host_loading)
            }
            ConnectionsModel.Phase.FAILED -> item(key = "failed") {
                AirSection(modifier = Modifier.testTag(HOST_ISSUE_TAG)) {
                    AirRow(
                        title = stringResource(issueText(state.issue ?: ConnectionsModel.Issue.UNAVAILABLE)),
                        titleColor = Air.colors.danger,
                    )
                    RowDivider()
                    ActionRow(
                        stringResource(R.string.vault_try_again),
                        onClick = model::reload,
                        modifier = Modifier.testTag(HOST_RETRY_TAG),
                    )
                    RowDivider()
                    ActionRow(
                        stringResource(R.string.host_stop),
                        onClick = model::stop,
                        enabled = !state.busy,
                        destructive = true,
                        modifier = Modifier.testTag(HOST_STOP_TAG),
                    )
                }
            }
            ConnectionsModel.Phase.READY -> {
                controls(model, state, beforeHostStarts)
                state.pairingCode?.let { code -> pairing(model, state, code) }
                trusted(model, state)
                usbCable(state)
            }
        }
        item(key = "tab-bar-clearance") { TabBarClearance() }
    }
    state.revokeCandidate?.let { peer ->
        AlertDialog(
            onDismissRequest = model::cancelRevoke,
            title = { Text(stringResource(R.string.host_revoke_title)) },
            text = { Text(peer.label + "\n\n" + stringResource(R.string.host_revoke_text)) },
            confirmButton = {
                TextButton(onClick = model::confirmRevoke, modifier = Modifier.testTag(HOST_REVOKE_CONFIRM_TAG)) {
                    Text(stringResource(R.string.host_revoke), color = Air.colors.danger)
                }
            },
            dismissButton = {
                TextButton(onClick = model::cancelRevoke) { Text(stringResource(R.string.form_cancel)) }
            },
        )
    }
}

@Composable
private fun HostHeader(state: ConnectionsModel.State, pausesOnLeave: Boolean) {
    val colors = Air.colors
    AirSection(
        footer = stringResource(if (pausesOnLeave) R.string.host_leave_pauses else R.string.host_leave_continues),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(20.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                if (state.activeHost) Icons.Rounded.WifiTethering else Icons.Rounded.Smartphone,
                contentDescription = null,
                tint = colors.accent,
                modifier = Modifier.size(36.dp),
            )
            Text(
                stringResource(summaryText(state.summary)),
                style = AirType.title2.copy(fontWeight = FontWeight.Bold),
                color = colors.text,
                modifier = Modifier.testTag(HOST_SUMMARY_TAG),
            )
            Text(stringResource(R.string.host_intro), style = AirType.subheadline, color = colors.textSecondary)
        }
        RowDivider()
        AirRow(
            title = stringResource(if (state.vaultOpen) R.string.host_vault_open else R.string.host_vault_closed),
            icon = if (state.vaultOpen) Icons.Outlined.LockOpen else Icons.Outlined.Lock,
            modifier = Modifier.testTag(HOST_VAULT_TAG),
        )
    }
}

private fun LazyListScope.controls(
    model: ConnectionsModel,
    state: ConnectionsModel.State,
    beforeHostStarts: (proceed: () -> Unit) -> Unit,
) {
    item(key = "controls") {
        val focus = LocalFocusManager.current
        val relay = remember { FocusRequester() }
        LaunchedEffect(state.validationRevision) {
            if (state.validationRevision > 0) runCatching { relay.requestFocus() }
        }
        val editable = !state.activeHost && !state.busy
        AirSection(
            header = stringResource(R.string.host_section),
            footer = stringResource(R.string.host_stop_first).takeIf { state.activeHost && state.pairingCode == null },
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 56.dp)
                    .padding(horizontal = 20.dp, vertical = 10.dp),
            ) {
                Text(
                    stringResource(R.string.host_relay_url),
                    style = AirType.footnote,
                    color = Air.colors.textSecondary,
                )
                BasicTextField(
                    value = state.relayUrl,
                    onValueChange = model::changeRelay,
                    enabled = editable,
                    singleLine = true,
                    textStyle = AirType.body.copy(color = if (editable) Air.colors.text else Air.colors.textSecondary),
                    cursorBrush = SolidColor(Air.colors.accent),
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.None,
                        autoCorrectEnabled = false,
                        keyboardType = KeyboardType.Uri,
                        imeAction = ImeAction.Go,
                    ),
                    keyboardActions = KeyboardActions(
                        onGo = {
                            focus.clearFocus()
                            beforeHostStarts(model::submitRelay)
                        },
                    ),
                    // A whole touch target under its label, the text centred in it.
                    decorationBox = { field -> Box(contentAlignment = Alignment.CenterStart) { field() } },
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(min = 48.dp)
                        .focusRequester(relay)
                        .testTag(HOST_RELAY_TAG),
                )
            }
            state.issue?.let { issue ->
                RowDivider()
                AirRow(
                    title = stringResource(issueText(issue)),
                    titleColor = Air.colors.danger,
                    modifier = Modifier.testTag(HOST_ISSUE_TAG),
                )
            }
            failureText(state)?.let { message ->
                RowDivider()
                AirRow(title = stringResource(message), titleColor = Air.colors.textSecondary)
            }
            if (state.activeHost || state.savedEnabled) {
                RowDivider()
                ActionRow(
                    stringResource(R.string.host_stop),
                    onClick = model::stop,
                    enabled = !state.busy,
                    destructive = true,
                    modifier = Modifier.testTag(HOST_STOP_TAG),
                )
            }
            if (!state.activeHost) {
                if (state.peers.isNotEmpty()) {
                    RowDivider()
                    ActionRow(
                        stringResource(R.string.host_start),
                        onClick = {
                            focus.clearFocus()
                            beforeHostStarts(model::start)
                        },
                        enabled = !state.busy,
                        modifier = Modifier.testTag(HOST_START_TAG),
                    )
                }
                RowDivider()
                ActionRow(
                    stringResource(R.string.host_pair),
                    onClick = {
                        focus.clearFocus()
                        beforeHostStarts(model::pair)
                    },
                    enabled = !state.busy,
                    modifier = Modifier.testTag(HOST_PAIR_TAG),
                )
            }
            if (state.busy) Working(R.string.host_updating)
        }
    }
}

private fun LazyListScope.pairing(model: ConnectionsModel, state: ConnectionsModel.State, code: String) {
    item(key = "pairing") {
        val context = LocalContext.current
        val share = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {}
        val invitation = state.invitation
        AirSection(header = stringResource(R.string.host_pair)) {
            Column(
                modifier = Modifier.fillMaxWidth().padding(20.dp),
                verticalArrangement = Arrangement.spacedBy(14.dp),
            ) {
                Text(stringResource(R.string.host_pair_instructions), style = AirType.body, color = Air.colors.text)
                Text(
                    code,
                    style = AirType.largeTitle.copy(fontFamily = FontFamily.Monospace, letterSpacing = 4.sp),
                    color = Air.colors.text,
                    modifier = Modifier.testTag(HOST_CODE_TAG),
                )
                state.snapshot?.pairingOffer?.let { offer ->
                    val time = DateUtils.formatDateTime(
                        context,
                        offer.expiresAtMs.toLong(),
                        DateUtils.FORMAT_SHOW_TIME,
                    )
                    Text(
                        stringResource(R.string.host_expires_at) + " " + time,
                        style = AirType.footnote,
                        color = Air.colors.textSecondary,
                    )
                }
                if (invitation != null) {
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) {
                        AirQrCode(invitation, modifier = Modifier.testTag(HOST_INVITATION_TAG))
                    }
                }
            }
            if (invitation != null) {
                RowDivider()
                ActionRow(
                    stringResource(R.string.host_share_invitation),
                    onClick = {
                        val send = Intent(Intent.ACTION_SEND)
                            .setType("text/plain")
                            .putExtra(Intent.EXTRA_TEXT, invitation)
                        // Started for a result, so the app counts the share sheet as its own step.
                        share.launch(Intent.createChooser(send, null))
                    },
                    modifier = Modifier.testTag(HOST_SHARE_TAG),
                )
            }
            RowDivider()
            ActionRow(
                stringResource(R.string.host_copy_code),
                onClick = model::copyPairingCode,
                modifier = Modifier.testTag(HOST_COPY_TAG),
            )
            if (state.codeCopied) SectionFooter(stringResource(R.string.host_code_copied))
            RowDivider()
            ActionRow(
                stringResource(R.string.host_cancel_pairing),
                onClick = model::stop,
                enabled = !state.busy,
                modifier = Modifier.testTag(HOST_CANCEL_TAG),
            )
        }
    }
}

private fun LazyListScope.trusted(model: ConnectionsModel, state: ConnectionsModel.State) {
    item(key = "trusted") {
        AirSection(header = stringResource(R.string.host_trusted)) {
            if (state.peers.isEmpty()) {
                AirRow(
                    title = stringResource(R.string.host_no_peers),
                    titleColor = Air.colors.textSecondary,
                    modifier = Modifier.testTag(HOST_NO_PEERS_TAG),
                )
            }
            state.peers.forEachIndexed { index, peer ->
                if (index > 0) RowDivider()
                PeerRow(model, state, peer)
            }
        }
    }
}

@Composable
private fun PeerRow(model: ConnectionsModel, state: ConnectionsModel.State, peer: AirHostPeer) {
    AirRow(
        title = peer.label,
        subtitle = stringResource(
            if (state.isConnected(peer.peerId)) R.string.host_connected else R.string.host_not_connected,
        ),
        icon = Icons.Outlined.Computer,
        modifier = Modifier.testTag(hostPeerTag(peer.peerId)),
    )
    ActionRow(
        stringResource(R.string.host_revoke),
        onClick = { model.requestRevoke(peer) },
        enabled = !state.busy,
        destructive = true,
        modifier = Modifier.testTag(hostRevokeTag(peer.peerId)),
    )
}

@Composable
private fun Working(label: Int) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(20.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator(color = Air.colors.accent, strokeWidth = 2.dp, modifier = Modifier.size(18.dp))
        Text(stringResource(label), style = AirType.subheadline, color = Air.colors.textSecondary)
    }
}

private fun summaryText(summary: ConnectionsModel.Summary): Int = when (summary) {
    ConnectionsModel.Summary.PREPARING -> R.string.host_preparing
    ConnectionsModel.Summary.READY_TO_PAIR -> R.string.host_ready_to_pair
    ConnectionsModel.Summary.DEVICE_CONNECTED -> R.string.host_device_connected
    ConnectionsModel.Summary.LISTENING -> R.string.host_listening
    ConnectionsModel.Summary.INTERRUPTED -> R.string.host_interrupted
    ConnectionsModel.Summary.EXPIRED -> R.string.host_expired
    ConnectionsModel.Summary.PAUSED -> R.string.host_paused
    ConnectionsModel.Summary.STOPPED -> R.string.host_stopped
    ConnectionsModel.Summary.UNAVAILABLE -> R.string.host_unavailable_status
    ConnectionsModel.Summary.CHECKING -> R.string.host_checking
}

private fun failureText(state: ConnectionsModel.State): Int? = when (state.summary) {
    ConnectionsModel.Summary.EXPIRED -> R.string.host_expired_text
    ConnectionsModel.Summary.INTERRUPTED -> R.string.host_error_text
    else -> null
}

private fun issueText(issue: ConnectionsModel.Issue): Int = when (issue) {
    ConnectionsModel.Issue.UNAVAILABLE -> R.string.host_issue_unavailable
    ConnectionsModel.Issue.RELAY -> R.string.host_issue_relay
    ConnectionsModel.Issue.OPERATION -> R.string.host_issue_operation
    ConnectionsModel.Issue.REVOKE -> R.string.host_issue_revoke
}
