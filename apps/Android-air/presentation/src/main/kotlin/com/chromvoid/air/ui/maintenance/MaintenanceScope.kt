package com.chromvoid.air.ui.maintenance

import android.net.Uri
import com.chromvoid.air.ui.AirSessionState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** What device administration can start, as the iOS client names it. */
public enum class MaintenanceAction {
    BACKUP,
    RESTORE,
    ERASE,
    APP_RESET,
    VAULT_PASSWORD,
    ADMINISTRATOR_PASSWORD,
    ;

    /**
     * Core-backed storage and administrative password operations re-authenticate
     * inside Core. The Android app reset is a separate device-local operation.
     */
    internal fun admittedIn(state: AirSessionState): Boolean = when (this) {
        VAULT_PASSWORD -> state is AirSessionState.Unlocked
        // Restoring fills empty storage, so it is offered before the first setup too.
        RESTORE -> state is AirSessionState.NeedsAdministrator ||
            state is AirSessionState.Locked ||
            state is AirSessionState.Unlocked
        BACKUP, ERASE, APP_RESET, ADMINISTRATOR_PASSWORD ->
            state is AirSessionState.Locked || state is AirSessionState.Unlocked
    }
}

/** What the platform supplies for administration; a missing part leaves its action out. */
public class MaintenanceServices(
    public val passwords: MaintenanceStore? = null,
    public val backups: BackupStore? = null,
    /** Turns the folder the system picker returned into somewhere to write a backup. */
    public val backupDestinations: ((Uri) -> BackupDestination)? = null,
    public val restores: RestoreStore? = null,
    /** Turns the folder the system picker returned into a backup to read. */
    public val restoreSources: ((Uri) -> RestoreSource)? = null,
    public val erasure: EraseStore? = null,
    public val appReset: AppReset? = null,
)

/** The one administration screen open at a time. */
public sealed interface MaintenanceRoute {
    public fun revoke()

    public class Password(public val model: PasswordMaintenanceModel) : MaintenanceRoute {
        override fun revoke(): Unit = model.revoke()
    }

    public class Backup(public val model: StorageBackupModel) : MaintenanceRoute {
        override fun revoke(): Unit = model.revoke()
    }

    public class Restore(public val model: StorageRestoreModel) : MaintenanceRoute {
        override fun revoke(): Unit = model.revoke()
    }

    public class Erase(public val model: StorageEraseModel) : MaintenanceRoute {
        override fun revoke(): Unit = model.revoke()
    }

    public class ResetApp(public val model: AppResetModel) : MaintenanceRoute {
        override fun revoke(): Unit = model.revoke()
    }
}

/**
 * Device administration for one generation of the session, locked or open:
 * what Settings and the locked screen can start, and what the session's end
 * takes away. At most one screen is open, and whatever it holds - a password,
 * a chosen folder, work in flight - is revoked with it.
 */
public class MaintenanceScope(
    public val generation: ULong,
    private val services: MaintenanceServices,
    private val scope: CoroutineScope,
    /** The session as it is now: which actions it admits. */
    private val session: () -> AirSessionState,
    /** A restore replaced the storage: the session has a new state to read. */
    private val onStorageReplaced: () -> Unit = {},
    /**
     * An erase ended. The outcome outlives this scope: the erase replaces the
     * session, which ends the scope while the deletion is still finishing.
     */
    private val onErased: (EraseOutcome) -> Unit = {},
) {
    private val mutableRoute = MutableStateFlow<MaintenanceRoute?>(null)

    /** The open administration screen, if any. */
    public val route: StateFlow<MaintenanceRoute?> = mutableRoute.asStateFlow()

    /** Whether [action] is offered: something implements it and the session admits it now. */
    public fun offers(action: MaintenanceAction): Boolean = implements(action) && action.admittedIn(session())

    public fun open(action: MaintenanceAction) {
        if (mutableRoute.value != null || !offers(action)) return
        mutableRoute.value = when (action) {
            MaintenanceAction.VAULT_PASSWORD -> password(PasswordMaintenanceModel.Kind.VAULT)
            MaintenanceAction.ADMINISTRATOR_PASSWORD -> password(PasswordMaintenanceModel.Kind.ADMINISTRATOR)
            MaintenanceAction.BACKUP -> MaintenanceRoute.Backup(
                StorageBackupModel(checkNotNull(services.backups), generation, scope, services.backupDestinations),
            )
            MaintenanceAction.RESTORE -> MaintenanceRoute.Restore(
                StorageRestoreModel(
                    checkNotNull(services.restores),
                    generation,
                    scope,
                    services.restoreSources,
                    onStorageReplaced,
                ),
            )
            MaintenanceAction.ERASE -> MaintenanceRoute.Erase(
                StorageEraseModel(checkNotNull(services.erasure), generation, scope, onErased).apply { prepare() },
            )
            MaintenanceAction.APP_RESET -> MaintenanceRoute.ResetApp(AppResetModel(checkNotNull(services.appReset)))
        }
    }

    /** Closes the open screen; nothing it held stays behind. */
    public fun dismiss() {
        mutableRoute.value?.revoke()
        mutableRoute.value = null
    }

    /** The forgotten-password path releases Core's unused erase review before local reset. */
    public fun resetAppInsteadOfErasing() {
        val erase = mutableRoute.value as? MaintenanceRoute.Erase ?: return
        if (!offers(MaintenanceAction.APP_RESET) ||
            erase.model.state.value.status == StorageEraseModel.Status.COMMITTING
        ) {
            return
        }
        dismiss()
        open(MaintenanceAction.APP_RESET)
    }

    /** The generation ended. */
    public fun close(): Unit = dismiss()

    private fun password(kind: PasswordMaintenanceModel.Kind): MaintenanceRoute =
        MaintenanceRoute.Password(PasswordMaintenanceModel(kind, checkNotNull(services.passwords), generation, scope))

    private fun implements(action: MaintenanceAction): Boolean = when (action) {
        MaintenanceAction.VAULT_PASSWORD, MaintenanceAction.ADMINISTRATOR_PASSWORD -> services.passwords != null
        MaintenanceAction.BACKUP -> services.backups != null && services.backupDestinations != null
        MaintenanceAction.RESTORE -> services.restores != null && services.restoreSources != null
        MaintenanceAction.ERASE -> services.erasure != null
        MaintenanceAction.APP_RESET -> services.appReset != null
    }
}
