package com.chromvoid.air.ui.settings

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.HelpOutline
import androidx.compose.material.icons.automirrored.rounded.OpenInNew
import androidx.compose.material.icons.outlined.Backup
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Lock
import androidx.compose.material.icons.outlined.PrivacyTip
import androidx.compose.material.icons.outlined.SettingsBackupRestore
import androidx.compose.material.icons.rounded.UnfoldMore
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.Air
import com.chromvoid.air.ui.access.PresenceGate
import com.chromvoid.air.ui.autofill.AutoFillModel
import com.chromvoid.air.ui.autofill.AutoFillScreen
import com.chromvoid.air.ui.design.ActionRow
import com.chromvoid.air.ui.design.AirRow
import com.chromvoid.air.ui.design.AirScreen
import com.chromvoid.air.ui.design.AirSection
import com.chromvoid.air.ui.design.AirSwitchRow
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.design.PillIcon
import com.chromvoid.air.ui.design.RowDivider
import com.chromvoid.air.ui.design.TabBarClearance
import com.chromvoid.air.ui.files.FileSettings
import com.chromvoid.air.ui.files.FilesScope
import com.chromvoid.air.ui.files.FolderChooserScreen
import com.chromvoid.air.ui.help.HelpFlow
import com.chromvoid.air.ui.maintenance.MaintenanceAction
import com.chromvoid.air.ui.maintenance.MaintenanceScope
import com.chromvoid.air.ui.support.LegalDocument

public const val SETTINGS_LIST_TAG: String = "settings-list"
public const val SETTINGS_PRESENCE_TAG: String = "settings-presence"
public const val SETTINGS_PRESENCE_ISSUE_TAG: String = "settings-presence-issue"
public const val SETTINGS_LOCK_TAG: String = "settings-lock"
public const val SETTINGS_HELP_TAG: String = "settings-help"
public const val SETTINGS_PRIVACY_POLICY_TAG: String = "settings-privacy-policy"
public const val SETTINGS_TERMS_TAG: String = "settings-terms"
public const val SETTINGS_BACKUP_TAG: String = "settings-backup"
public const val SETTINGS_RESTORE_TAG: String = "settings-restore"
public const val SETTINGS_ERASE_TAG: String = "settings-erase"
public const val SETTINGS_VERSION_TAG: String = "settings-version"
public const val SETTINGS_AUTOFILL_TAG: String = "settings-autofill"
public const val SETTINGS_LOCK_NOTIFICATION_TAG: String = "settings-lock-notification"
public const val SETTINGS_LOCK_TILE_TAG: String = "settings-lock-tile"

/** The installed app's version and build, as About shows them on iOS. */
public data class AppVersion(val name: String, val build: String)
public const val SETTINGS_THEME_TAG: String = "settings-theme"
public const val SETTINGS_LANGUAGE_TAG: String = "settings-language"
public const val SETTINGS_VAULT_PASSWORD_TAG: String = "settings-vault-password"
public const val SETTINGS_ADMIN_PASSWORD_TAG: String = "settings-admin-password"
public const val SETTINGS_KEEP_AWAKE_TAG: String = "settings-keep-awake"
public const val SETTINGS_SHOW_HIDDEN_TAG: String = "settings-show-hidden"
public const val SETTINGS_CONFIRM_DELETION_TAG: String = "settings-confirm-deletion"
public const val SETTINGS_ATTACHMENT_FOLDER_TAG: String = "settings-attachment-folder"
public const val SETTINGS_LOCK_ON_LEAVE_TAG: String = "settings-lock-on-leave"
public const val SETTINGS_LOCK_ON_SCREEN_OFF_TAG: String = "settings-lock-on-screen-off"
public const val SETTINGS_AUTO_LOCK_TAG: String = "settings-auto-lock"
public const val SETTINGS_AUTO_LOCK_ISSUE_TAG: String = "settings-auto-lock-issue"

public fun autoLockOptionTag(timeout: AutoLockTimeout): String = "auto-lock-${timeout.name.lowercase()}"

public fun themeOptionTag(theme: AppearanceModel.Theme): String = "theme-${theme.name.lowercase()}"

public fun languageOptionTag(language: AppearanceModel.Language): String = "language-${language.name.lowercase()}"

public fun legalDocumentTag(document: LegalDocument): String = when (document) {
    LegalDocument.PRIVACY_POLICY -> SETTINGS_PRIVACY_POLICY_TAG
    LegalDocument.TERMS_OF_SERVICE -> SETTINGS_TERMS_TAG
}

/**
 * Settings, laid out as on iOS: a large title, the lock on the right and
 * white sections with their footers. It holds only what this client can do
 * today; the rest of the iOS sections arrive with their stages.
 */
@Composable
public fun SettingsRoot(
    presence: PresenceGate?,
    modifier: Modifier = Modifier,
    onLock: (() -> Unit)? = null,
    session: SessionSettingsModel? = null,
    files: FileSettings? = null,
    maintenance: MaintenanceScope? = null,
    appearance: AppearanceModel? = null,
    version: AppVersion? = null,
    /** The unlocked session's Files, for choosing where note images go. */
    attachments: FilesScope? = null,
    /** Opens the AutoFill page; null where this client offers none. */
    onAutoFill: (() -> Unit)? = null,
    /** The AutoFill page while it is open. */
    autoFill: AutoFillModel? = null,
    onCloseAutoFill: () -> Unit = {},
    /** Asks for the permission to post notifications, then goes on whatever the answer. */
    beforeNotifications: (proceed: () -> Unit) -> Unit = { it() },
) {
    var helpOpen by rememberSaveable { mutableStateOf(false) }
    if (helpOpen) {
        HelpFlow(onClose = { helpOpen = false }, modifier = modifier)
        return
    }
    Box(modifier = modifier) {
        SettingsList(
            presence,
            onLock,
            session,
            files,
            maintenance,
            appearance,
            version,
            attachments,
            onAutoFill,
            beforeNotifications,
        ) { helpOpen = true }
        if (attachments != null) {
            val picker by attachments.attachmentFolder.collectAsStateWithLifecycle()
            picker?.let {
                FolderChooserScreen(
                    it,
                    title = stringResource(R.string.attachments_title),
                    hint = stringResource(R.string.attachments_hint),
                    confirm = stringResource(R.string.attachments_use),
                    onCancel = attachments::dismissAttachmentFolder,
                    onLock = onLock ?: {},
                )
            }
        }
        if (autoFill != null) AutoFillScreen(autoFill, onDismiss = onCloseAutoFill)
    }
}

@Composable
private fun SettingsList(
    presence: PresenceGate?,
    onLock: (() -> Unit)?,
    session: SessionSettingsModel?,
    files: FileSettings?,
    maintenance: MaintenanceScope?,
    appearance: AppearanceModel?,
    version: AppVersion?,
    attachments: FilesScope?,
    onAutoFill: (() -> Unit)?,
    beforeNotifications: (proceed: () -> Unit) -> Unit,
    onHelp: () -> Unit,
) {
    AirScreen(
        title = stringResource(R.string.root_settings),
        listTag = SETTINGS_LIST_TAG,
        actions = onLock?.let { lock ->
            {
                PillIcon(
                    Icons.Outlined.Lock,
                    stringResource(R.string.vault_lock),
                    onClick = lock,
                    modifier = Modifier.testTag(SETTINGS_LOCK_TAG),
                )
            }
        },
    ) {
        if (appearance != null) {
            item(key = "appearance") { AppearanceSection(appearance) }
        }
        if (files != null) {
            item(key = "files") { FilesSection(files, attachments) }
        }
        if (session != null) {
            item(key = "session") { SessionSection(session) }
            item(key = "lock-shortcuts") { LockShortcutsSection(session, beforeNotifications) }
        }
        if (onAutoFill != null) {
            item(key = "passwords-passkeys") {
                AirSection(header = stringResource(R.string.settings_passwords_passkeys)) {
                    ActionRow(
                        title = stringResource(R.string.autofill_title),
                        icon = Icons.Outlined.Key,
                        onClick = onAutoFill,
                        modifier = Modifier.testTag(SETTINGS_AUTOFILL_TAG),
                    )
                }
            }
        }
        if (presence != null || session != null) {
            item(key = "app-access") { AppAccessSection(presence, session) }
        }
        val backup = maintenance?.offers(MaintenanceAction.BACKUP) == true
        val restore = maintenance?.offers(MaintenanceAction.RESTORE) == true
        if (maintenance != null && (backup || restore)) {
            item(key = "storage") {
                AirSection(header = stringResource(R.string.settings_storage)) {
                    if (backup) {
                        ActionRow(
                            title = stringResource(R.string.backup_title),
                            icon = Icons.Outlined.Backup,
                            onClick = { maintenance.open(MaintenanceAction.BACKUP) },
                            modifier = Modifier.testTag(SETTINGS_BACKUP_TAG),
                        )
                    }
                    if (backup && restore) RowDivider()
                    if (restore) {
                        ActionRow(
                            title = stringResource(R.string.restore_title),
                            icon = Icons.Outlined.SettingsBackupRestore,
                            onClick = { maintenance.open(MaintenanceAction.RESTORE) },
                            modifier = Modifier.testTag(SETTINGS_RESTORE_TAG),
                        )
                    }
                }
            }
        }
        if (maintenance?.offers(MaintenanceAction.VAULT_PASSWORD) == true) {
            item(key = "passwords") {
                AirSection(header = stringResource(R.string.settings_passwords)) {
                    ActionRow(
                        title = stringResource(R.string.maint_change_vault),
                        onClick = { maintenance.open(MaintenanceAction.VAULT_PASSWORD) },
                        modifier = Modifier.testTag(SETTINGS_VAULT_PASSWORD_TAG),
                    )
                    RowDivider()
                    ActionRow(
                        title = stringResource(R.string.maint_change_admin),
                        onClick = { maintenance.open(MaintenanceAction.ADMINISTRATOR_PASSWORD) },
                        modifier = Modifier.testTag(SETTINGS_ADMIN_PASSWORD_TAG),
                    )
                }
            }
        }
        if (maintenance?.offers(MaintenanceAction.ERASE) == true) {
            item(key = "erase") {
                AirSection {
                    ActionRow(
                        stringResource(R.string.settings_erase),
                        onClick = { maintenance.open(MaintenanceAction.ERASE) },
                        destructive = true,
                        modifier = Modifier.testTag(SETTINGS_ERASE_TAG),
                    )
                }
            }
        }
        item(key = "about") {
            AirSection(header = stringResource(R.string.settings_about)) {
                AirRow(
                    title = stringResource(R.string.help_title),
                    icon = Icons.AutoMirrored.Outlined.HelpOutline,
                    chevron = true,
                    onClick = onHelp,
                    modifier = Modifier.testTag(SETTINGS_HELP_TAG),
                )
                LegalDocument.entries.forEach { document ->
                    RowDivider()
                    LegalDocumentRow(document)
                }
                if (version != null) {
                    RowDivider()
                    AirRow(
                        title = stringResource(R.string.about_version),
                        value = version.name,
                        modifier = Modifier.testTag(SETTINGS_VERSION_TAG),
                    )
                    RowDivider()
                    AirRow(title = stringResource(R.string.about_build), value = version.build)
                }
            }
        }
        item(key = "tab-bar-clearance") { TabBarClearance() }
    }
}

/**
 * A published legal document, as on iOS. It opens in the browser, so the row
 * ends in an outward arrow where a page inside the app shows a chevron.
 */
@Composable
private fun LegalDocumentRow(document: LegalDocument) {
    val uri = LocalUriHandler.current
    AirRow(
        title = stringResource(document.title),
        icon = when (document) {
            LegalDocument.PRIVACY_POLICY -> Icons.Outlined.PrivacyTip
            LegalDocument.TERMS_OF_SERVICE -> Icons.Outlined.Description
        },
        // Without a browser to take it, the tap opens nothing rather than failing.
        onClick = { runCatching { uri.openUri(document.url) } },
        modifier = Modifier.testTag(legalDocumentTag(document)),
        trailing = {
            Icon(
                Icons.AutoMirrored.Rounded.OpenInNew,
                contentDescription = null,
                tint = Air.colors.textTertiary,
                modifier = Modifier.size(20.dp),
            )
        },
    )
}

/** Appearance, as on iOS: the theme and the language, neither from the vault. */
@Composable
private fun AppearanceSection(model: AppearanceModel) {
    val state by model.state.collectAsStateWithLifecycle()
    AirSection(header = stringResource(R.string.settings_appearance)) {
        ChoiceRow(
            title = stringResource(R.string.appearance_theme),
            value = stringResource(state.theme.label),
            tag = SETTINGS_THEME_TAG,
            options = AppearanceModel.Theme.entries.map {
                Triple(stringResource(it.label), themeOptionTag(it)) { model.setTheme(it) }
            },
        )
        RowDivider()
        ChoiceRow(
            title = stringResource(R.string.appearance_language),
            value = stringResource(state.language.label),
            tag = SETTINGS_LANGUAGE_TAG,
            options = AppearanceModel.Language.entries.map {
                Triple(stringResource(it.label), languageOptionTag(it)) { model.setLanguage(it) }
            },
        )
    }
}

/** One row that opens a short list of choices, as the iOS picker does. */
@Composable
private fun ChoiceRow(title: String, value: String, tag: String, options: List<Triple<String, String, () -> Unit>>) {
    var choosing by remember { mutableStateOf(false) }
    Box {
        AirRow(
            title = title,
            value = value,
            onClick = { choosing = true },
            modifier = Modifier.testTag(tag),
            trailing = {
                Icon(Icons.Rounded.UnfoldMore, contentDescription = null, tint = Air.colors.textSecondary)
            },
        )
        DropdownMenu(expanded = choosing, onDismissRequest = { choosing = false }) {
            options.forEach { (label, optionTag, choose) ->
                DropdownMenuItem(
                    text = { Text(label) },
                    onClick = {
                        choosing = false
                        choose()
                    },
                    modifier = Modifier.testTag(optionTag),
                )
            }
        }
    }
}

/** Session: keep the screen awake, and whether leaving or turning the screen off locks. */
@Composable
private fun SessionSection(model: SessionSettingsModel) {
    val state by model.state.collectAsStateWithLifecycle()
    AirSection(
        header = stringResource(R.string.settings_session),
        footer = stringResource(R.string.settings_session_footer),
    ) {
        AirSwitchRow(
            title = stringResource(R.string.settings_keep_awake),
            checked = state.keepScreenAwake,
            onCheckedChange = model::setKeepScreenAwake,
            modifier = Modifier.testTag(SETTINGS_KEEP_AWAKE_TAG),
        )
        RowDivider()
        AirSwitchRow(
            title = stringResource(R.string.settings_lock_on_leave),
            checked = state.lockOnLeave,
            onCheckedChange = model::setLockOnLeave,
            modifier = Modifier.testTag(SETTINGS_LOCK_ON_LEAVE_TAG),
        )
        RowDivider()
        AirSwitchRow(
            title = stringResource(R.string.settings_lock_on_screen_off),
            checked = state.lockOnScreenOff,
            onCheckedChange = model::setLockOnScreenOff,
            modifier = Modifier.testTag(SETTINGS_LOCK_ON_SCREEN_OFF_TAG),
        )
    }
}

/**
 * Locking from outside the app, which Android offers and iOS does not: a notification with Lock
 * while the vault is open, and a Quick Settings tile. Neither names anything in the vault.
 */
@Composable
private fun LockShortcutsSection(model: SessionSettingsModel, beforeNotifications: (proceed: () -> Unit) -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    AirSection(
        header = stringResource(R.string.settings_lock_shortcuts),
        footer = stringResource(R.string.settings_lock_shortcuts_footer),
    ) {
        AirSwitchRow(
            title = stringResource(R.string.settings_lock_notification),
            checked = state.lockNotification,
            onCheckedChange = { enabled ->
                if (enabled) {
                    beforeNotifications { model.setLockNotification(true) }
                } else {
                    model.setLockNotification(false)
                }
            },
            modifier = Modifier.testTag(SETTINGS_LOCK_NOTIFICATION_TAG),
        )
        if (model.offersLockTile) {
            RowDivider()
            ActionRow(
                stringResource(R.string.settings_lock_tile),
                onClick = model::addLockTile,
                modifier = Modifier.testTag(SETTINGS_LOCK_TILE_TAG),
            )
        }
    }
}

/** Files, as on iOS: whether folders show hidden items and whether a delete asks first. */
@Composable
private fun FilesSection(model: FileSettings, attachments: FilesScope?) {
    val state by model.state.collectAsStateWithLifecycle()
    AirSection(header = stringResource(R.string.settings_files)) {
        AirSwitchRow(
            title = stringResource(R.string.files_show_hidden),
            checked = state.showHidden,
            onCheckedChange = model::setShowHidden,
            modifier = Modifier.testTag(SETTINGS_SHOW_HIDDEN_TAG),
        )
        RowDivider()
        AirSwitchRow(
            title = stringResource(R.string.settings_confirm_deletion),
            checked = state.confirmDeletion,
            onCheckedChange = model::setConfirmDeletion,
            modifier = Modifier.testTag(SETTINGS_CONFIRM_DELETION_TAG),
        )
        if (attachments != null) {
            RowDivider()
            ActionRow(
                title = stringResource(R.string.attachments_title),
                // A path can be long; below the title it never squeezes it.
                subtitle = state.attachmentFolder,
                onClick = attachments::chooseAttachmentFolder,
                modifier = Modifier.testTag(SETTINGS_ATTACHMENT_FOLDER_TAG),
            )
        }
    }
}

/** App access, as on iOS: the inactivity lock and the device-authentication gate. */
@Composable
private fun AppAccessSection(presence: PresenceGate?, session: SessionSettingsModel?) {
    val gate = presence?.state?.collectAsStateWithLifecycle()?.value
    AirSection(
        header = stringResource(R.string.settings_app_access),
        footer = if (presence != null) stringResource(R.string.settings_presence_text) else null,
    ) {
        if (session != null) AutoLockRow(session)
        if (presence != null && gate != null) {
            if (session != null) RowDivider()
            AirSwitchRow(
                title = stringResource(R.string.settings_presence),
                checked = gate.enabled,
                onCheckedChange = presence::setEnabled,
                enabled = !gate.busy,
                modifier = Modifier.testTag(SETTINGS_PRESENCE_TAG),
            )
        }
    }
    val sessionFailed = session?.state?.collectAsStateWithLifecycle()?.value?.failed == true
    if (sessionFailed) {
        SettingsIssue(stringResource(R.string.settings_auto_lock_failed), SETTINGS_AUTO_LOCK_ISSUE_TAG)
    }
    gate?.issue?.let { issue ->
        SettingsIssue(
            stringResource(
                when (issue) {
                    PresenceGate.Issue.NOT_CONFIRMED -> R.string.presence_not_confirmed
                    PresenceGate.Issue.UNAVAILABLE -> R.string.presence_unavailable
                },
            ),
            SETTINGS_PRESENCE_ISSUE_TAG,
        )
    }
}

@Composable
private fun AutoLockRow(model: SessionSettingsModel) {
    val state by model.state.collectAsStateWithLifecycle()
    var choosing by remember { mutableStateOf(false) }
    Box {
        AirRow(
            title = stringResource(R.string.settings_auto_lock),
            value = stringResource(state.autoLock.label),
            enabled = !state.busy,
            onClick = { choosing = true },
            modifier = Modifier.testTag(SETTINGS_AUTO_LOCK_TAG),
            trailing = {
                Icon(Icons.Rounded.UnfoldMore, contentDescription = null, tint = Air.colors.textSecondary)
            },
        )
        DropdownMenu(expanded = choosing, onDismissRequest = { choosing = false }) {
            AutoLockTimeout.entries.forEach { timeout ->
                DropdownMenuItem(
                    text = { Text(stringResource(timeout.label)) },
                    onClick = {
                        choosing = false
                        model.setAutoLock(timeout)
                    },
                    modifier = Modifier.testTag(autoLockOptionTag(timeout)),
                )
            }
        }
    }
}

@Composable
private fun SettingsIssue(text: String, tag: String) {
    Text(
        text,
        style = AirType.footnote,
        color = Air.colors.danger,
        modifier = Modifier.padding(horizontal = 36.dp, vertical = 4.dp).testTag(tag),
    )
}
