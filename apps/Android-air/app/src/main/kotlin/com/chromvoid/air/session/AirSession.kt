package com.chromvoid.air.session

import com.chromvoid.air.bridge.AirSessionRuntime
import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.ffi.AirPhase
import com.chromvoid.air.ffi.AirSnapshot
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.AccessInput
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AccessSession
import com.chromvoid.air.ui.AdoptionIssue
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.credentials.CredentialStore
import com.chromvoid.air.ui.files.FileStore
import com.chromvoid.air.ui.maintenance.BackupStore
import com.chromvoid.air.ui.maintenance.EraseStore
import com.chromvoid.air.ui.maintenance.MaintenanceStore
import com.chromvoid.air.ui.maintenance.RestoreStore
import com.chromvoid.air.ui.settings.AutoLockControl
import com.chromvoid.air.ui.settings.SessionPreferences
import com.chromvoid.air.ui.connections.HostStore
import com.chromvoid.air.ui.passkeys.PasskeyStore
import com.chromvoid.air.ui.wallet.WalletStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Session authority as the shell sees it.
 *
 * Rust decides what the session is; this class only asks, records the answer
 * and never invents a transition. In particular it never reports an unlocked
 * vault as failed because its catalog turned out to be empty, and it never
 * claims a password was wrong - Core's refusal is passed through by code.
 */
public class AirSession(
    private val openRuntime: suspend () -> AirSessionRuntime,
    private val scope: CoroutineScope,
    private val preferences: SessionPreferences? = null,
) : AccessSession, AutoLockControl {
    private val transitions = Mutex()
    private val mutableState = MutableStateFlow<AirSessionState>(AirSessionState.Starting)
    override val state: StateFlow<AirSessionState> = mutableState.asStateFlow()

    private val mutableSequence = MutableStateFlow(0uL)
    override val sequence: StateFlow<ULong> = mutableSequence.asStateFlow()

    private val mutableAdministration = MutableStateFlow<ULong?>(null)
    override val administration: StateFlow<ULong?> = mutableAdministration.asStateFlow()

    @Volatile
    private var runtime: AirSessionRuntime? = null

    /** The credential commands of whatever session is current. */
    public val credentials: CredentialStore = SessionCredentialStore { runtime }

    /** The catalog of files, over the same runtime. */
    public val files: FileStore = SessionFileStore { runtime }

    /** The wallet: metadata, setup and accounts, over the same runtime. */
    public val wallet: WalletStore = SessionWalletStore { runtime }

    /** The vault's passkeys, as metadata. */
    public val passkeys: PasskeyStore = SessionPasskeyStore { runtime }

    /** The runtime's host for trusted computers; Rust owns its trust and lifetime. */
    internal val hostStore: SessionHostStore = SessionHostStore(runtime = { runtime })

    public val hosts: HostStore get() = hostStore

    /** Device administration - the two passwords - of whatever session is current. */
    public val maintenance: MaintenanceStore = SessionMaintenanceStore { runtime }

    /** Backups of the whole storage, of whatever session is current. */
    public val backups: BackupStore = SessionBackupStore { runtime }

    /** Restoring a backup into the empty storage of whatever session is current. */
    public val restores: RestoreStore = SessionRestoreStore { runtime }

    /** Deleting all local data of whatever session is current. */
    public val erasure: EraseStore = SessionEraseStore { runtime }

    public suspend fun start(): Unit = transitions.withLock {
        if (runtime != null) return@withLock
        try {
            val opened = openRuntime()
            // The inactivity lock is a runtime setting: it is given once, before
            // the first unlock, and changed only from Settings afterwards.
            preferences?.autoLockSeconds?.takeIf { it > 0 }?.let { seconds ->
                opened.setAutoLockTimeout(opened.snapshot().generation, seconds.toULong())
            }
            runtime = opened
            publish(opened.snapshot())
            observe(opened)
        } catch (error: BridgeException) {
            unavailable(error)
        } catch (error: UnsatisfiedLinkError) {
            unavailable("MissingNativeLibrary")
        }
    }

    override suspend fun setUpAdministrator(password: String, confirmation: String): AccessOutcome {
        AccessInput.administratorProblem(password, confirmation)?.let { return AccessOutcome.Rejected(it) }
        return attempt { it.setupAdministrator(password) }
    }

    override suspend fun unlock(password: String): AccessOutcome {
        AccessInput.unlockProblem(password)?.let { return AccessOutcome.Rejected(it) }
        return attempt { it.unlock(password) }
    }

    /** The app came forward. Rust decides whether anything is still valid. */
    public suspend fun activate(): Unit = withRuntime { publish(it.activate()) }

    /**
     * The app is leaving the foreground. Deactivation is synchronous, so no
     * secret can be delivered after it returns; the lock completes behind it.
     */
    public suspend fun deactivate(): Unit = withRuntime {
        publish(it.deactivate())
        publish(it.lock())
    }

    override suspend fun lock(): Unit = withRuntime { publish(it.lock()) }

    override suspend fun refresh(): Unit = withRuntime { publish(it.snapshot()) }

    /**
     * The app left the foreground. It locks only when Settings asks for it;
     * otherwise the vault stays open, covered, until the inactivity lock, an
     * explicit lock or a screen-off lock when that separate setting is on.
     * Without stored preferences it locks.
     */
    public suspend fun leaveForeground() {
        if (preferences?.lockOnLeave != false) deactivate()
    }

    /**
     * The screen went off. An open vault locks only when the separate screen-off
     * setting is on; without stored preferences it locks.
     */
    public suspend fun screenOff() {
        if (preferences?.lockOnScreenOff != false && state.value is AirSessionState.Unlocked) lock()
    }

    override suspend fun applyAutoLock(seconds: Long): Boolean = transitions.withLock {
        val current = runtime ?: return@withLock false
        try {
            current.setAutoLockTimeout(current.snapshot().generation, seconds.coerceAtLeast(0).toULong())
            true
        } catch (error: BridgeException) {
            publish(current.snapshot())
            false
        }
    }

    public suspend fun recordUserActivity() {
        val generation = (state.value as? AirSessionState.Unlocked)?.generation ?: return
        runtime?.recordUserActivity(generation)
    }

    private suspend fun attempt(action: suspend (AirSessionRuntime) -> Unit): AccessOutcome =
        transitions.withLock {
            val current = runtime ?: return@withLock AccessOutcome.Refused("RuntimeUnavailable")
            try {
                action(current)
                publish(current.snapshot())
                AccessOutcome.Accepted
            } catch (refusal: CoreRefusal) {
                publish(current.snapshot())
                AccessOutcome.Refused(refusal.code)
            } catch (error: BridgeException) {
                publish(current.snapshot())
                AccessOutcome.Refused(errorCode(error))
            }
        }

    private suspend fun withRuntime(action: suspend (AirSessionRuntime) -> Unit) {
        transitions.withLock {
            val current = runtime ?: return@withLock
            try {
                action(current)
            } catch (error: BridgeException) {
                unavailable(error)
            }
        }
    }

    /**
     * Follows the runtime's ordered events for as long as the runtime is open.
     * Rust can change the session without the shell asking - an inactivity
     * lock, a provider or host path, a vault change - so each batch re-reads
     * authority and republishes it, and the sequence tells the vault's state
     * holders that what they read may be stale.
     */
    private fun observe(opened: AirSessionRuntime) {
        scope.launch {
            var after = 0uL
            try {
                while (isActive) {
                    val batch = opened.events(after)
                    after = batch.snapshot.sequence
                    // A queued event may predate a background cycle: the current
                    // snapshot is the authority, not the one in the batch.
                    val current = opened.snapshot()
                    transitions.withLock { if (runtime === opened) publish(current) }
                    mutableSequence.value = after
                    if (current.phase == AirPhase.CLOSED || current.phase == AirPhase.FAILED) return@launch
                }
            } catch (error: BridgeException) {
                transitions.withLock {
                    if (runtime === opened) unavailable(error)
                }
            }
        }
    }

    private fun publish(snapshot: AirSnapshot) {
        val administering = !snapshot.cleanupPending &&
            (snapshot.phase == AirPhase.LOCKED || snapshot.phase == AirPhase.UNLOCKED)
        mutableAdministration.value = snapshot.generation.takeIf { administering }
        mutableState.value = when (snapshot.phase) {
            AirPhase.UNLOCKED -> AirSessionState.Unlocked(snapshot.generation)
            AirPhase.LOCKED ->
                if (snapshot.masterConfigured) AirSessionState.Locked else AirSessionState.NeedsAdministrator
            // Leaving or left the foreground: the shell shows the locked surface
            // rather than whatever the previous session was displaying.
            AirPhase.DEACTIVATING, AirPhase.INACTIVE -> AirSessionState.Locked
            AirPhase.CLOSED -> AirSessionState.Unavailable("SessionClosed")
            AirPhase.FAILED -> AirSessionState.Unavailable("SessionFailed")
        }
    }

    private fun unavailable(code: String) {
        mutableAdministration.value = null
        mutableState.value = AirSessionState.Unavailable(code)
    }

    private fun unavailable(error: BridgeException) {
        mutableAdministration.value = null
        val adoption = when (error) {
            is BridgeException.AdoptionBlocked -> AdoptionIssue.BLOCKED
            is BridgeException.AdoptionLegacyRootOutsideDataDir -> AdoptionIssue.LEGACY_ROOT_OUTSIDE_DATA_DIR
            is BridgeException.AdoptionLegacyRootUnavailable -> AdoptionIssue.LEGACY_ROOT_UNAVAILABLE
            is BridgeException.AdoptionPepperUnavailable -> AdoptionIssue.PEPPER_UNAVAILABLE
            is BridgeException.AdoptionStorageUnavailable -> AdoptionIssue.STORAGE_UNAVAILABLE
            is BridgeException.AdoptionActionForbidden -> AdoptionIssue.ACTION_FORBIDDEN
            else -> null
        }
        mutableState.value = AirSessionState.Unavailable(errorCode(error), adoption)
    }

    private fun errorCode(error: BridgeException): String = when (error) {
        is BridgeException.AdoptionBlocked -> "AdoptionBlocked"
        is BridgeException.AdoptionLegacyRootOutsideDataDir -> "AdoptionLegacyRootOutsideDataDir"
        is BridgeException.AdoptionLegacyRootUnavailable -> "AdoptionLegacyRootUnavailable"
        is BridgeException.AdoptionPepperUnavailable -> "AdoptionPepperUnavailable"
        is BridgeException.AdoptionStorageUnavailable -> "AdoptionStorageUnavailable"
        is BridgeException.AdoptionActionForbidden -> "AdoptionActionForbidden"
        else -> error::class.simpleName ?: "BridgeException"
    }
}
