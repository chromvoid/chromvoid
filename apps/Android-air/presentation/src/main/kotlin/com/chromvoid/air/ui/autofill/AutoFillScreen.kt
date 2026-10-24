package com.chromvoid.air.ui.autofill

import android.content.ActivityNotFoundException
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.maintenance.MaintenanceNote
import com.chromvoid.air.ui.maintenance.MaintenanceProgress
import com.chromvoid.air.ui.maintenance.MaintenanceSheet

public const val AUTOFILL_CLOSE_TAG: String = "autofill-close"
public const val AUTOFILL_SYSTEM_TAG: String = "autofill-system"
public const val AUTOFILL_ACCESS_TAG: String = "autofill-access"
public const val AUTOFILL_REFRESH_TAG: String = "autofill-refresh"
public const val AUTOFILL_FAILED_TAG: String = "autofill-failed"
public const val AUTOFILL_SETTINGS_TAG: String = "autofill-settings"
public const val AUTOFILL_SETTINGS_FAILED_TAG: String = "autofill-settings-failed"
public const val AUTOFILL_PASSKEYS_TAG: String = "autofill-passkeys"
public const val AUTOFILL_PASSKEY_SETTINGS_TAG: String = "autofill-passkey-settings"

/**
 * AutoFill, as the iOS page: what it does, where the system and this vault stand, and the
 * system's own screen for choosing ChromVoid. The status is read again whenever the page
 * comes back on screen, so a choice made in the system shows here at once.
 */
@Composable
public fun AutoFillScreen(model: AutoFillModel, onDismiss: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { model.reload() }
    val settings = model.settingsIntent
    val passkeySettings = model.passkeySettingsIntent
    val chooser = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) {
        model.reload()
    }
    MaintenanceSheet(
        title = stringResource(R.string.autofill_title),
        onDismiss = onDismiss,
        closeTag = AUTOFILL_CLOSE_TAG,
    ) {
        item(key = "intro") {
            AirSection {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Icon(Icons.Outlined.Key, contentDescription = null, tint = Air.colors.accent)
                        Text(
                            stringResource(R.string.autofill_intro_title),
                            style = AirType.headline,
                            color = Air.colors.text,
                        )
                    }
                    Text(stringResource(R.string.autofill_intro), style = AirType.body, color = Air.colors.text)
                    Text(
                        stringResource(R.string.autofill_intro_locked),
                        style = AirType.subheadline,
                        color = Air.colors.textSecondary,
                    )
                }
            }
        }
        item(key = "status") {
            AirSection(
                header = stringResource(R.string.autofill_status),
                footer = stringResource(R.string.autofill_status_footer),
            ) {
                when (state.phase) {
                    AutoFillModel.Phase.LOADING -> MaintenanceProgress(stringResource(R.string.autofill_checking))
                    AutoFillModel.Phase.READY -> {
                        StatusRow(
                            stringResource(R.string.autofill_system),
                            stringResource(systemSummary(state.status?.system)),
                            AUTOFILL_SYSTEM_TAG,
                        )
                        RowDivider()
                        StatusRow(
                            stringResource(R.string.autofill_passkeys),
                            stringResource(passkeySummary(state.status?.passkeys)),
                            AUTOFILL_PASSKEYS_TAG,
                        )
                        RowDivider()
                        StatusRow(
                            stringResource(R.string.autofill_access),
                            stringResource(accessSummary(state.access)),
                            AUTOFILL_ACCESS_TAG,
                        )
                    }
                    AutoFillModel.Phase.FAILED -> Text(
                        stringResource(R.string.autofill_failed),
                        style = AirType.body,
                        color = Air.colors.text,
                        modifier = Modifier.padding(16.dp).testTag(AUTOFILL_FAILED_TAG),
                    )
                    AutoFillModel.Phase.REVOKED -> Unit
                }
                RowDivider()
                ActionRow(
                    stringResource(R.string.autofill_refresh),
                    onClick = model::reload,
                    icon = Icons.Rounded.Refresh,
                    enabled = state.phase != AutoFillModel.Phase.LOADING,
                    modifier = Modifier.testTag(AUTOFILL_REFRESH_TAG),
                )
            }
        }
        item(key = "configure") {
            AirSection(header = stringResource(R.string.autofill_configure)) {
                if (settings != null) {
                    ActionRow(
                        stringResource(R.string.autofill_open_settings),
                        onClick = {
                            try {
                                chooser.launch(settings)
                                model.settingsOpened()
                            } catch (error: ActivityNotFoundException) {
                                model.settingsFailed()
                            }
                        },
                        icon = Icons.AutoMirrored.Rounded.OpenInNew,
                        modifier = Modifier.testTag(AUTOFILL_SETTINGS_TAG),
                    )
                    RowDivider()
                    Note(stringResource(R.string.autofill_choose))
                    if (passkeySettings != null) {
                        RowDivider()
                        ActionRow(
                            stringResource(R.string.autofill_open_passkey_settings),
                            onClick = {
                                try {
                                    chooser.launch(passkeySettings)
                                    model.settingsOpened()
                                } catch (error: ActivityNotFoundException) {
                                    model.settingsFailed()
                                }
                            },
                            icon = Icons.AutoMirrored.Rounded.OpenInNew,
                            modifier = Modifier.testTag(AUTOFILL_PASSKEY_SETTINGS_TAG),
                        )
                        RowDivider()
                        Note(stringResource(R.string.autofill_choose_passkeys))
                    }
                } else {
                    Note(stringResource(R.string.autofill_unsupported))
                }
                if (state.settingsFailed) {
                    RowDivider()
                    Note(
                        stringResource(R.string.autofill_settings_failed),
                        Modifier.testTag(AUTOFILL_SETTINGS_FAILED_TAG),
                    )
                }
            }
        }
        item(key = "note") { MaintenanceNote(stringResource(R.string.autofill_return)) }
    }
}

@Composable
private fun StatusRow(title: String, value: String, tag: String) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(title, style = AirType.subheadline, color = Air.colors.textSecondary)
        Text(value, style = AirType.body, color = Air.colors.text, modifier = Modifier.testTag(tag))
    }
}

@Composable
private fun Note(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = AirType.subheadline,
        color = Air.colors.textSecondary,
        modifier = modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
    )
}

private fun systemSummary(system: AutoFillSystem?): Int = when (system) {
    AutoFillSystem.SELECTED -> R.string.autofill_system_selected
    AutoFillSystem.NOT_SELECTED -> R.string.autofill_system_not_selected
    AutoFillSystem.UNSUPPORTED, null -> R.string.autofill_system_unsupported
}

private fun passkeySummary(passkeys: PasskeyProvider?): Int = when (passkeys) {
    PasskeyProvider.ENABLED -> R.string.autofill_passkeys_enabled
    PasskeyProvider.NOT_ENABLED -> R.string.autofill_passkeys_not_enabled
    PasskeyProvider.UNKNOWN -> R.string.autofill_passkeys_unknown
    PasskeyProvider.UNSUPPORTED, null -> R.string.autofill_passkeys_unsupported
}

private fun accessSummary(access: AutoFillModel.Access?): Int = when (access) {
    AutoFillModel.Access.AUTHORIZED -> R.string.autofill_access_authorized
    AutoFillModel.Access.VAULT_CLOSED -> R.string.autofill_access_closed
    AutoFillModel.Access.UNAVAILABLE, null -> R.string.autofill_access_unavailable
}
