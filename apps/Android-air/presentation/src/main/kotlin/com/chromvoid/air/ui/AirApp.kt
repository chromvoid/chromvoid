package com.chromvoid.air.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.GppMaybe
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.chromvoid.air.presentation.R
import com.chromvoid.air.ui.access.AccessFrame
import com.chromvoid.air.ui.access.AccessMessage
import com.chromvoid.air.ui.access.AccessViewModel
import com.chromvoid.air.ui.access.BrandMarkTransitionHost
import com.chromvoid.air.ui.access.AdministratorSetupScreen
import com.chromvoid.air.ui.access.DeviceUtilitiesSheet
import com.chromvoid.air.ui.access.PresenceScreen
import com.chromvoid.air.ui.access.UnlockScreen
import com.chromvoid.air.ui.connections.ConnectionsScreen
import com.chromvoid.air.ui.connections.UsbApprovalPrompt
import com.chromvoid.air.ui.design.AirType
import com.chromvoid.air.ui.files.FilesRoot
import com.chromvoid.air.ui.files.IncomingShareScreen
import com.chromvoid.air.ui.help.HelpFlow
import com.chromvoid.air.ui.help.HelpTopic
import com.chromvoid.air.ui.maintenance.EraseOutcome
import com.chromvoid.air.ui.maintenance.AppResetScreen
import com.chromvoid.air.ui.maintenance.MaintenanceAction
import com.chromvoid.air.ui.maintenance.MaintenanceHost
import com.chromvoid.air.ui.maintenance.MaintenanceScope
import com.chromvoid.air.ui.root.RootScaffold
import com.chromvoid.air.ui.settings.AppVersion
import com.chromvoid.air.ui.settings.AppearanceModel
import com.chromvoid.air.ui.settings.SettingsRoot
import com.chromvoid.air.ui.vault.VaultRoot

public const val SESSION_STATE_TAG: String = "session-state"
public const val STORAGE_HELP_TAG: String = "storage-help"
public const val ERASE_OUTCOME_TAG: String = "erase-outcome"
public const val ERASE_OUTCOME_DONE_TAG: String = "erase-outcome-done"
public const val LOCKED_CONNECTIONS_TAG: String = "locked-connections"
public const val ADOPTION_RETRY_TAG: String = "adoption-retry"
public const val ADOPTION_SUPPORT_TAG: String = "adoption-support"
public const val ADOPTION_RESET_TAG: String = "adoption-reset"

/**
 * The shell follows the session Rust reports. It never decides on its own that
 * the vault is open, and a locked session reaches only the safe roots.
 */
@Composable
public fun AirApp(
    model: AccessViewModel,
    shell: ShellViewModel,
    onRetry: () -> Unit,
    appearance: AppearanceModel? = null,
    version: AppVersion? = null,
    /** Asks for what a running host needs - its notification - before [proceed] starts it. */
    beforeHostStarts: (proceed: () -> Unit) -> Unit = { it() },
) {
    Box(modifier = Modifier.fillMaxSize().background(Air.colors.canvas)) {
        val state by model.displayState.collectAsStateWithLifecycle()
        val recoveryReset by shell.recoveryReset.collectAsStateWithLifecycle()
        val maintenance by shell.maintenance.collectAsStateWithLifecycle()
        val presence = shell.presence
        val sessionSettings = shell.sessionSettings
        val keepAwake = sessionSettings?.state?.collectAsStateWithLifecycle()?.value?.keepScreenAwake == true
        val gate = presence?.state?.collectAsStateWithLifecycle()?.value
        val settled = state != AirSessionState.Starting && state !is AirSessionState.Unavailable
        if (presence != null && gate?.required == true && settled) {
            // Nothing of the app - not even the unlock screen - until the device confirms the person.
            PresenceScreen(presence)
            return@Box
        }
        if (recoveryReset != null &&
            (state as? AirSessionState.Unavailable)?.adoption == AdoptionIssue.PEPPER_UNAVAILABLE
        ) {
            AppResetScreen(checkNotNull(recoveryReset), onDismiss = shell::dismissRecoveryReset)
            return@Box
        }
        // Help is reachable before the vault opens; it is offline text and leaves with the entry screens.
        var help by rememberSaveable { mutableStateOf<HelpTopic?>(null) }
        var helpOpen by rememberSaveable { mutableStateOf(false) }
        val openHelp = { topic: HelpTopic? ->
            help = topic
            helpOpen = true
        }
        // An administration screen covers whichever of these the session shows, as the iOS sheets do.
        BrandMarkTransitionHost(model) {
            MaintenanceHost(maintenance) {
                if (helpOpen && state !is AirSessionState.Unlocked) {
                    HelpFlow(onClose = { helpOpen = false }, start = help)
                    return@MaintenanceHost
                }
                SessionScreens(state, model, shell, onRetry, appearance, version, keepAwake, openHelp, beforeHostStarts)
            }
            EraseOutcomeDialog(shell)
        }
    }
}

/** How the last erase ended, as the iOS alert; it waits behind the presence gate like the rest. */
@Composable
private fun EraseOutcomeDialog(shell: ShellViewModel) {
    val outcome = shell.eraseOutcome.collectAsStateWithLifecycle().value ?: return
    AlertDialog(
        onDismissRequest = shell::dismissEraseOutcome,
        title = { Text(stringResource(R.string.erase_outcome_title)) },
        text = {
            Text(
                stringResource(
                    when (outcome) {
                        EraseOutcome.COMPLETED -> R.string.erase_outcome_completed
                        EraseOutcome.INCOMPLETE -> R.string.erase_outcome_incomplete
                        EraseOutcome.UNCONFIRMED -> R.string.erase_outcome_unconfirmed
                    },
                ),
                modifier = Modifier.testTag(ERASE_OUTCOME_TAG),
            )
        },
        confirmButton = {
            TextButton(onClick = shell::dismissEraseOutcome, modifier = Modifier.testTag(ERASE_OUTCOME_DONE_TAG)) {
                Text(stringResource(R.string.erase_outcome_done), color = Air.colors.accent)
            }
        },
    )
}

@Composable
private fun SessionScreens(
    state: AirSessionState,
    model: AccessViewModel,
    shell: ShellViewModel,
    onRetry: () -> Unit,
    appearance: AppearanceModel?,
    version: AppVersion?,
    keepAwake: Boolean,
    openHelp: (HelpTopic?) -> Unit,
    beforeHostStarts: (proceed: () -> Unit) -> Unit,
) {
    val vault by shell.vault.collectAsStateWithLifecycle()
    val files by shell.files.collectAsStateWithLifecycle()
    val maintenance by shell.maintenance.collectAsStateWithLifecycle()
    val pendingShare by shell.pendingShare.collectAsStateWithLifecycle()
    val pendingLogin by shell.pendingLogin.collectAsStateWithLifecycle()
    val rootRequest by shell.rootRequest.collectAsStateWithLifecycle()
    val autoFill by shell.autoFill.collectAsStateWithLifecycle()
    val presence = shell.presence
    val sessionSettings = shell.sessionSettings
    // Without stored settings the session locks on leave, and the host pauses with it.
    val pausesOnLeave = sessionSettings?.state?.collectAsStateWithLifecycle()?.value?.lockOnLeave ?: true
    val connections: (@Composable (Modifier, (() -> Unit)?, (() -> Unit)?) -> Unit)? =
        shell.connections?.let { hosts ->
            { modifier, onDone, onLock ->
                ConnectionsScreen(hosts, modifier, pausesOnLeave, onDone, onLock, beforeHostStarts)
            }
        }
    when (val current = state) {
        AirSessionState.Starting -> AccessFrame {
            Column(
                modifier = Modifier.fillMaxSize(),
                verticalArrangement = Arrangement.spacedBy(16.dp, Alignment.CenterVertically),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                CircularProgressIndicator(color = Air.colors.accent)
                Text(
                    text = stringResource(R.string.session_starting),
                    style = AirType.body,
                    color = Air.colors.textSecondary,
                    modifier = Modifier.testTag(SESSION_STATE_TAG),
                )
            }
        }
        is AirSessionState.Unavailable -> if (current.adoption != null) {
            AdoptionScreen(
                current.adoption,
                onRetry = onRetry,
                onReset = if (shell.offersRecoveryReset) shell::openRecoveryReset else null,
            )
        } else AccessMessage(
            icon = Icons.Rounded.GppMaybe,
            title = stringResource(R.string.session_unavailable),
            message = stringResource(R.string.session_unavailable_text),
            action = stringResource(R.string.session_retry),
            onAction = onRetry,
            titleModifier = Modifier.testTag(SESSION_STATE_TAG),
            onHelp = { openHelp(null) },
        ) {
            Text(
                stringResource(R.string.session_code, current.code),
                style = AirType.footnote,
                color = Air.colors.textSecondary,
            )
            TextButton(onClick = { openHelp(HelpTopic.STORAGE) }, modifier = Modifier.testTag(STORAGE_HELP_TAG)) {
                Text(stringResource(R.string.help_storage_link), color = Air.colors.accent)
            }
        }
        AirSessionState.NeedsAdministrator -> AdministratorSetupScreen(
            model,
            onHelp = { openHelp(null) },
            onRestore = maintenance?.takeIf { it.offers(MaintenanceAction.RESTORE) }?.let { scope ->
                { scope.open(MaintenanceAction.RESTORE) }
            },
        )
        AirSessionState.Locked -> LockedScreens(
            model,
            maintenance,
            pendingShare = pendingShare?.size ?: 0,
            onDiscardShare = shell::discardShare,
            pendingLogin = pendingLogin?.title,
            onDiscardLogin = shell::discardLogin,
            onHelp = { openHelp(null) },
            connections = connections?.let { screen -> { onDone -> screen(Modifier, onDone, null) } },
        )
        is AirSessionState.Unlocked -> {
            // The scope belongs to exactly this generation; anything else is a
            // session the shell has not caught up with yet and shows nothing.
            val scope = vault?.takeIf { it.generation == current.generation }
            // Only while the vault is open and the app is on screen: the flag
            // belongs to this window and goes with it.
            KeepScreenOn(keepAwake)
            val open = files?.takeIf { it.generation == current.generation }
            val incoming = open?.incoming?.collectAsStateWithLifecycle()?.value
            RootScaffold(
                unlocked = true,
                request = rootRequest,
                onRequestHandled = shell::rootRequestHandled,
                overlay = incoming?.let { shared ->
                    { IncomingShareScreen(shared, open.device, onClose = open::closeIncoming, onLock = model::lock) }
                },
                vault = { modifier ->
                    if (scope != null) {
                        VaultRoot(scope, modifier, onLock = model::lock)
                    } else {
                        Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            CircularProgressIndicator()
                        }
                    }
                },
                files = if (shell.offersFiles) {
                    { modifier ->
                        if (open != null) {
                            FilesRoot(open, modifier, onLock = model::lock)
                        } else {
                            Box(modifier = modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                CircularProgressIndicator()
                            }
                        }
                    }
                } else {
                    null
                },
                connections = connections?.let { screen -> { modifier -> screen(modifier, null, model::lock) } },
                settings = { modifier ->
                    SettingsRoot(
                        presence,
                        modifier,
                        onLock = model::lock,
                        session = sessionSettings,
                        files = shell.fileSettings,
                        maintenance = maintenance,
                        appearance = appearance,
                        version = version,
                        attachments = files?.takeIf { shell.offersFiles && it.generation == current.generation },
                        onAutoFill = if (shell.offersAutoFill) shell::openAutoFill else null,
                        beforeNotifications = beforeHostStarts,
                        autoFill = autoFill?.takeIf { it.generation == current.generation },
                        onCloseAutoFill = shell::closeAutoFill,
                    )
                },
            )
        }
    }
    // A computer on the USB cable asks the person over whatever screen shows, locked or open.
    if (state == AirSessionState.Locked || state is AirSessionState.Unlocked) {
        shell.connections?.let { UsbApprovalPrompt(it) }
    }
}

/** Adoption failures keep the existing entry-screen style and never expose storage paths. */
@Composable
internal fun AdoptionScreen(issue: AdoptionIssue, onRetry: () -> Unit, onReset: (() -> Unit)? = null) {
    val browser = LocalUriHandler.current
    // The same contact is published in the ChromVoid website footer. The address
    // remains readable if this device has no email application to handle mailto.
    val support = { runCatching { browser.openUri("mailto:support@chromvoid.com") }; Unit }
    val title = when (issue) {
        AdoptionIssue.BLOCKED -> R.string.adoption_blocked_title
        AdoptionIssue.PEPPER_UNAVAILABLE -> R.string.adoption_pepper_title
        AdoptionIssue.LEGACY_ROOT_OUTSIDE_DATA_DIR -> R.string.adoption_root_unverified_title
        AdoptionIssue.LEGACY_ROOT_UNAVAILABLE -> R.string.adoption_root_unavailable_title
        AdoptionIssue.STORAGE_UNAVAILABLE -> R.string.adoption_storage_unavailable_title
        AdoptionIssue.ACTION_FORBIDDEN -> R.string.adoption_unfinished_title
    }
    val message = when (issue) {
        AdoptionIssue.BLOCKED -> R.string.adoption_blocked_text
        AdoptionIssue.PEPPER_UNAVAILABLE -> R.string.adoption_pepper_text
        AdoptionIssue.LEGACY_ROOT_OUTSIDE_DATA_DIR,
        AdoptionIssue.LEGACY_ROOT_UNAVAILABLE,
        AdoptionIssue.STORAGE_UNAVAILABLE,
        -> R.string.adoption_cannot_open_text
        AdoptionIssue.ACTION_FORBIDDEN -> R.string.maintenance_issue_adoption_required
    }
    val retryable = issue == AdoptionIssue.PEPPER_UNAVAILABLE
    AccessMessage(
        icon = Icons.Rounded.GppMaybe,
        title = stringResource(title),
        message = stringResource(message),
        action = stringResource(if (retryable) R.string.session_retry else R.string.adoption_contact_support),
        onAction = if (retryable) onRetry else support,
        titleModifier = Modifier.testTag(SESSION_STATE_TAG),
        actionModifier = Modifier.testTag(if (retryable) ADOPTION_RETRY_TAG else ADOPTION_SUPPORT_TAG),
    ) {
        Text("support@chromvoid.com", style = AirType.footnote, color = Air.colors.textSecondary)
        if (retryable) {
            TextButton(onClick = support, modifier = Modifier.testTag(ADOPTION_SUPPORT_TAG)) {
                Text(stringResource(R.string.adoption_contact_support), color = Air.colors.accent)
            }
            if (onReset != null) {
                TextButton(onClick = onReset, modifier = Modifier.testTag(ADOPTION_RESET_TAG)) {
                    Text(stringResource(R.string.adoption_reset_permanently), color = Air.colors.danger)
                }
            }
        }
    }
}

@Composable
private fun KeepScreenOn(enabled: Boolean) {
    val view = LocalView.current
    DisposableEffect(view, enabled) {
        view.keepScreenOn = enabled
        onDispose { view.keepScreenOn = false }
    }
}

/** The unlock screen, with the locked device's utilities as on iOS. */
@Composable
private fun LockedScreens(
    model: AccessViewModel,
    maintenance: MaintenanceScope?,
    pendingShare: Int,
    onDiscardShare: () -> Unit,
    pendingLogin: String?,
    onDiscardLogin: () -> Unit,
    onHelp: () -> Unit,
    /** Connections over the locked screen, as the iOS sheet; it is given its Done. */
    connections: (@Composable (onDone: () -> Unit) -> Unit)? = null,
) {
    var utilities by rememberSaveable { mutableStateOf(false) }
    var hosting by rememberSaveable { mutableStateOf(false) }
    val offered = maintenance?.let { scope -> UTILITY_ACTIONS.filter(scope::offers) }.orEmpty()
    UnlockScreen(
        model,
        onHelp = onHelp,
        onUtilities = if (offered.isNotEmpty()) ({ utilities = true }) else null,
        onConnections = connections?.let { { hosting = true } },
        pendingShare = pendingShare,
        onDiscardShare = onDiscardShare,
        pendingLogin = pendingLogin,
        onDiscardLogin = onDiscardLogin,
    )
    if (hosting && connections != null) {
        BackHandler { hosting = false }
        Box(modifier = Modifier.fillMaxSize().background(Air.colors.canvas).testTag(LOCKED_CONNECTIONS_TAG)) {
            connections { hosting = false }
        }
    }
    if (utilities && maintenance != null) {
        DeviceUtilitiesSheet(
            offers = { it in offered },
            onChoose = { action ->
                utilities = false
                maintenance.open(action)
            },
            onClose = { utilities = false },
        )
    }
}

private val UTILITY_ACTIONS = listOf(
    MaintenanceAction.BACKUP,
    MaintenanceAction.RESTORE,
    MaintenanceAction.ADMINISTRATOR_PASSWORD,
    MaintenanceAction.ERASE,
    MaintenanceAction.APP_RESET,
)
