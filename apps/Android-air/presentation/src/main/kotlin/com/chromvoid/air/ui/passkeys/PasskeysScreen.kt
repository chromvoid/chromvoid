package com.chromvoid.air.ui.passkeys

import android.text.format.DateUtils
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.bridge.wire.VaultPasskeySummary
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSearchField
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.StatusBlock
import com.chromvoid.air.ui.design.TabBarClearance

public const val PASSKEYS_TAG: String = "passkeys"
public const val PASSKEYS_BACK_TAG: String = "passkeys-back"
public const val PASSKEYS_SEARCH_TAG: String = "passkeys-search"
public const val PASSKEYS_REFRESH_TAG: String = "passkeys-refresh"
public const val PASSKEYS_EMPTY_TAG: String = "passkeys-empty"
public const val PASSKEYS_NOTICE_TAG: String = "passkeys-notice"
public const val PASSKEYS_RETRY_TAG: String = "passkeys-retry"
public const val PASSKEY_DETAIL_TAG: String = "passkey-detail"
public const val PASSKEY_BACK_TAG: String = "passkey-back"
public const val PASSKEY_DELETE_TAG: String = "passkey-delete"
public const val PASSKEY_DELETE_CONFIRM_TAG: String = "passkey-delete-confirm"

public fun passkeyRowTag(id: String): String = "passkey-$id"

/**
 * The vault's passkeys, as the iOS page: searched by website or account,
 * each row opening its details - where it can be deleted from this vault,
 * which leaves the website's account alone.
 */
@Composable
public fun PasskeysScreen(
    model: PasskeysModel,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onLock: () -> Unit = {},
) {
    val state by model.state.collectAsStateWithLifecycle()
    val open = state.selected
    if (open != null) {
        BackHandler(onBack = model::closeDetail)
        PasskeyDetail(model, state, open, onLock, modifier)
    } else {
        BackHandler(onBack = onBack)
        PasskeyList(model, state, onBack, onLock, modifier)
    }
    if (state.confirmingDelete) {
        AlertDialog(
            onDismissRequest = model::cancelDelete,
            title = { Text(stringResource(R.string.pk_delete_title)) },
            text = { Text(stringResource(R.string.pk_delete_text)) },
            confirmButton = {
                TextButton(onClick = model::confirmDelete, modifier = Modifier.testTag(PASSKEY_DELETE_CONFIRM_TAG)) {
                    Text(stringResource(R.string.pk_delete), color = Air.colors.danger)
                }
            },
            dismissButton = {
                TextButton(onClick = model::cancelDelete) { Text(stringResource(R.string.form_cancel)) }
            },
        )
    }
}

@Composable
private fun PasskeyList(
    model: PasskeysModel,
    state: PasskeysModel.State,
    onBack: () -> Unit,
    onLock: () -> Unit,
    modifier: Modifier,
) {
    val busy = state.phase == PasskeysModel.Phase.LOADING || state.phase == PasskeysModel.Phase.DELETING
    AirScreen(
        title = stringResource(R.string.vault_passkeys),
        modifier = modifier.testTag(PASSKEYS_TAG),
        onBack = onBack,
        backTag = PASSKEYS_BACK_TAG,
        backDescription = stringResource(R.string.detail_back),
        actions = {
            PillIcon(
                Icons.Rounded.Refresh,
                stringResource(R.string.pk_refresh),
                onClick = model::reload,
                enabled = !busy,
                modifier = Modifier.testTag(PASSKEYS_REFRESH_TAG),
            )
            PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock)
        },
    ) {
        item(key = "search") {
            AirSearchField(
                value = state.query,
                onValueChange = model::search,
                placeholder = stringResource(R.string.pk_search),
                fieldModifier = Modifier.testTag(PASSKEYS_SEARCH_TAG),
            )
        }
        item(key = "intro") {
            Column(modifier = Modifier.padding(horizontal = 36.dp, vertical = 4.dp)) {
                Text(stringResource(R.string.pk_intro), style = AirType.footnote, color = Air.colors.textSecondary)
                Text(
                    stringResource(R.string.pk_in_development),
                    style = AirType.footnote,
                    color = Air.colors.textSecondary,
                )
            }
        }
        state.notice?.let { notice ->
            item(key = "notice") {
                AirSection(modifier = Modifier.testTag(PASSKEYS_NOTICE_TAG)) {
                    AirRow(title = stringResource(noticeText(notice)))
                }
            }
        }
        when (state.phase) {
            PasskeysModel.Phase.LOADING -> item(key = "loading") { Working(R.string.pk_loading) }
            PasskeysModel.Phase.FAILED, PasskeysModel.Phase.UNCERTAIN -> item(key = "failed") {
                AirSection {
                    if (state.phase == PasskeysModel.Phase.FAILED) {
                        AirRow(title = stringResource(R.string.pk_failed), titleColor = Air.colors.textSecondary)
                        RowDivider()
                    }
                    ActionRow(
                        stringResource(R.string.pk_refresh),
                        onClick = model::reload,
                        modifier = Modifier.testTag(PASSKEYS_RETRY_TAG),
                    )
                }
            }
            PasskeysModel.Phase.READY, PasskeysModel.Phase.DELETING -> item(key = "passkeys") {
                val matches = state.matches
                if (matches.isEmpty()) {
                    val none = state.rows.isEmpty()
                    StatusBlock(
                        stringResource(if (none) R.string.pk_empty else R.string.pk_no_match),
                        message = stringResource(if (none) R.string.pk_empty_text else R.string.pk_no_match_text),
                        icon = Icons.Rounded.Key,
                        modifier = Modifier.testTag(PASSKEYS_EMPTY_TAG),
                    )
                } else {
                    AirSection {
                        matches.forEachIndexed { index, passkey ->
                            if (index > 0) RowDivider(inset = 58.dp)
                            AirRow(
                                title = passkey.rpID,
                                subtitle = account(passkey),
                                icon = Icons.Rounded.Key,
                                chevron = true,
                                onClick = { model.select(passkey.credentialIDB64URL) },
                                modifier = Modifier.testTag(passkeyRowTag(passkey.credentialIDB64URL)),
                            )
                        }
                    }
                }
            }
            PasskeysModel.Phase.REVOKED -> Unit
        }
        item(key = "clearance") { TabBarClearance() }
    }
}

@Composable
private fun PasskeyDetail(
    model: PasskeysModel,
    state: PasskeysModel.State,
    passkey: VaultPasskeySummary,
    onLock: () -> Unit,
    modifier: Modifier,
) {
    val account = account(passkey)
    AirScreen(
        title = stringResource(R.string.pk_title),
        largeTitle = false,
        modifier = modifier.testTag(PASSKEY_DETAIL_TAG),
        onBack = model::closeDetail,
        backTag = PASSKEY_BACK_TAG,
        backDescription = stringResource(R.string.detail_back),
        actions = { PillIcon(Icons.Outlined.Lock, stringResource(R.string.vault_lock), onClick = onLock) },
    ) {
        item(key = "website") {
            AirSection(header = stringResource(R.string.pk_website)) {
                AirRow(
                    title = passkey.rpID,
                    subtitle = passkey.rpName.takeIf { it.isNotEmpty() && it != passkey.rpID },
                    icon = Icons.Rounded.Key,
                )
            }
        }
        item(key = "account") {
            AirSection(header = stringResource(R.string.pk_account)) {
                AirRow(
                    title = account,
                    subtitle = passkey.userDisplayName.takeIf { it.isNotEmpty() && it != account },
                )
            }
        }
        item(key = "details") {
            AirSection(
                header = stringResource(R.string.pk_details),
                footer = stringResource(if (passkey.portable) R.string.pk_portable else R.string.pk_not_portable),
            ) {
                AirRow(title = stringResource(R.string.pk_created), value = date(passkey.createdAtEpochMS))
                RowDivider()
                AirRow(title = stringResource(R.string.pk_last_used), value = date(passkey.lastUsedEpochMS))
            }
        }
        item(key = "delete") {
            AirSection(footer = stringResource(R.string.pk_delete_footer)) {
                ActionRow(
                    stringResource(R.string.pk_delete),
                    onClick = model::requestDelete,
                    enabled = state.phase == PasskeysModel.Phase.READY,
                    destructive = true,
                    modifier = Modifier.testTag(PASSKEY_DELETE_TAG),
                )
                if (state.phase == PasskeysModel.Phase.DELETING) Working(R.string.pk_deleting)
            }
        }
        item(key = "clearance") { TabBarClearance() }
    }
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

@Composable
private fun account(passkey: VaultPasskeySummary): String = when {
    passkey.userName.isNotEmpty() -> passkey.userName
    passkey.userDisplayName.isNotEmpty() -> passkey.userDisplayName
    else -> stringResource(R.string.pk_unnamed)
}

@Composable
private fun date(milliseconds: Long): String {
    if (milliseconds <= 0) return stringResource(R.string.pk_not_recorded)
    val flags = DateUtils.FORMAT_SHOW_DATE or DateUtils.FORMAT_SHOW_YEAR
    return DateUtils.formatDateTime(LocalContext.current, milliseconds, flags)
}

private fun noticeText(notice: PasskeysModel.Notice): Int = when (notice) {
    PasskeysModel.Notice.DELETED -> R.string.pk_deleted
    PasskeysModel.Notice.MISSING -> R.string.pk_missing
    PasskeysModel.Notice.UNCERTAIN -> R.string.pk_uncertain
}
