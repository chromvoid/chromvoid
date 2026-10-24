package com.chromvoid.air.ui

import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.chromvoid.air.ui.access.PresenceCheck
import com.chromvoid.air.ui.access.PresenceGate
import com.chromvoid.air.ui.access.PresencePreference
import com.chromvoid.air.ui.autofill.AutoFillModel
import com.chromvoid.air.ui.autofill.AutoFillStore
import com.chromvoid.air.ui.connections.ConnectionsModel
import com.chromvoid.air.ui.connections.HostStore
import com.chromvoid.air.ui.credentials.CredentialClipboard
import com.chromvoid.air.ui.credentials.CredentialStore
import com.chromvoid.air.ui.credentials.OfferedLogin
import com.chromvoid.air.ui.credentials.OfferedLogins
import com.chromvoid.air.ui.credentials.OtpScanner
import com.chromvoid.air.ui.files.FileDevice
import com.chromvoid.air.ui.files.FileSettings
import com.chromvoid.air.ui.files.FileSharing
import com.chromvoid.air.ui.files.FileStore
import com.chromvoid.air.ui.files.PhotoCapture
import com.chromvoid.air.ui.files.FilesScope
import com.chromvoid.air.ui.maintenance.EraseOutcome
import com.chromvoid.air.ui.maintenance.AppResetModel
import com.chromvoid.air.ui.maintenance.MaintenanceScope
import com.chromvoid.air.ui.maintenance.MaintenanceServices
import com.chromvoid.air.ui.media.MediaPlayers
import com.chromvoid.air.ui.passkeys.PasskeyStore
import com.chromvoid.air.ui.root.AirRoot
import com.chromvoid.air.ui.settings.AutoLockControl
import com.chromvoid.air.ui.settings.LockTileRequest
import com.chromvoid.air.ui.settings.SessionPreferences
import com.chromvoid.air.ui.settings.SessionSettingsModel
import com.chromvoid.air.ui.transfer.ImportSource
import com.chromvoid.air.ui.vault.VaultScope
import com.chromvoid.air.ui.wallet.WalletStore
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch

/**
 * Keeps one [VaultScope] and one [FilesScope] per unlocked generation, and one [MaintenanceScope]
 * per generation Core admits administration under. It survives a configuration
 * change like any view model, and it closes the vault's scope the moment the
 * session reports anything but that generation unlocked - a lock, a failure or
 * a new unlock - rather than waiting for the screen to go away.
 */
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
@OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
public class ShellViewModel(
    private val session: AccessSession,
    private val credentials: CredentialStore,
    private val clipboard: CredentialClipboard,
    private val dispatcher: CoroutineDispatcher = Dispatchers.Main.immediate,
    private val scanner: OtpScanner? = null,
    presenceCheck: PresenceCheck? = null,
    presencePreference: PresencePreference? = null,
    autoLock: AutoLockControl? = null,
    sessionPreferences: SessionPreferences? = null,
    private val maintenanceServices: MaintenanceServices? = null,
    private val fileStore: FileStore? = null,
    /** The Files settings; null where nothing stores them (tests, previews). */
    public val fileSettings: FileSettings? = null,
    private val fileDevice: FileDevice? = null,
    private val fileSharing: FileSharing? = null,
    private val mediaPlayers: MediaPlayers? = null,
    /** The camera, for Take Photo in Files; null where there is none (tests, previews). */
    private val photoCapture: PhotoCapture? = null,
    /** Opens a shared document for the Passwords import; null where nothing can (tests, previews). */
    private val credentialSources: ((Uri) -> ImportSource)? = null,
    /** The wallet's store; null where this client offers no wallet (tests, previews). */
    private val wallets: WalletStore? = null,
    /** The vault's passkeys; null where this client offers none (tests, previews). */
    private val passkeys: PasskeyStore? = null,
    /** The runtime's host; null where this client offers no Connections (tests, previews). */
    hosts: HostStore? = null,
    /** The provider paths' setup; null where this client offers no AutoFill (tests, previews). */
    private val autoFillStore: AutoFillStore? = null,
    /** Logins other apps offered to save; null where nothing offers them (tests, previews). */
    private val offeredLogins: OfferedLogins? = null,
    /** Adds the Lock tile to Quick Settings; null where Android cannot (older versions, tests). */
    lockTile: LockTileRequest? = null,
    /** How this device names itself to a computer it pairs with. */
    deviceLabel: String = "Android",
) : ViewModel() {
    /** The optional app-presence gate; null where the device offers no check (tests, previews). */
    public val presence: PresenceGate? = if (presenceCheck != null && presencePreference != null) {
        PresenceGate(presenceCheck, presencePreference, viewModelScope)
    } else {
        null
    }

    /** The Session settings; null where nothing stores them (tests, previews). */
    public val sessionSettings: SessionSettingsModel? = if (autoLock != null && sessionPreferences != null) {
        SessionSettingsModel(autoLock, sessionPreferences, viewModelScope, lockTile)
    } else {
        null
    }

    private val mutableVault = MutableStateFlow<VaultScope?>(null)
    public val vault: StateFlow<VaultScope?> = mutableVault.asStateFlow()

    /**
     * This device as a host for trusted computers. It follows the session
     * locked or open - as on iOS - and pauses while there is none.
     */
    public val connections: ConnectionsModel? = hosts?.let {
        ConnectionsModel(it, deviceLabel, viewModelScope, clipboard)
    }

    /** Whether this shell has a Files root at all; without one the tab keeps its placeholder. */
    public val offersFiles: Boolean = fileStore != null && fileSettings != null

    private val mutableFiles = MutableStateFlow<FilesScope?>(null)

    /** The Files root of the unlocked generation; null while locked or where nothing implements it. */
    public val files: StateFlow<FilesScope?> = mutableFiles.asStateFlow()

    /** Whether Settings offers the AutoFill page at all. */
    public val offersAutoFill: Boolean = autoFillStore != null

    private val mutableAutoFill = MutableStateFlow<AutoFillModel?>(null)

    /** The AutoFill page while it is open; it belongs to one unlocked generation. */
    public val autoFill: StateFlow<AutoFillModel?> = mutableAutoFill.asStateFlow()

    public fun openAutoFill() {
        val store = autoFillStore ?: return
        val generation = mutableVault.value?.generation ?: return
        if (mutableAutoFill.value?.generation == generation) return
        mutableAutoFill.value?.close()
        mutableAutoFill.value = AutoFillModel(store, generation, viewModelScope)
    }

    public fun closeAutoFill() {
        mutableAutoFill.value?.close()
        mutableAutoFill.value = null
    }

    private val mutableMaintenance = MutableStateFlow<MaintenanceScope?>(null)

    /** Device administration for the current generation, locked or open; null where nothing implements it. */
    public val maintenance: StateFlow<MaintenanceScope?> = mutableMaintenance.asStateFlow()

    private val mutableRecoveryReset = MutableStateFlow<AppResetModel?>(null)

    /** Device-local recovery uses the existing reset flow without inventing a Core generation. */
    public val recoveryReset: StateFlow<AppResetModel?> = mutableRecoveryReset.asStateFlow()

    public val offersRecoveryReset: Boolean
        get() = maintenanceServices?.appReset != null &&
            (session.state.value as? AirSessionState.Unavailable)?.adoption == AdoptionIssue.PEPPER_UNAVAILABLE

    public fun openRecoveryReset() {
        if (!offersRecoveryReset || mutableRecoveryReset.value != null) return
        mutableRecoveryReset.value = AppResetModel(checkNotNull(maintenanceServices?.appReset))
    }

    public fun dismissRecoveryReset() {
        mutableRecoveryReset.value?.revoke()
        mutableRecoveryReset.value = null
    }

    private val mutableEraseOutcome = MutableStateFlow<EraseOutcome?>(null)

    /**
     * How the last erase ended, until the person has read it. It is not a
     * secret, so it outlives the session the erase replaced, as on iOS.
     */
    public val eraseOutcome: StateFlow<EraseOutcome?> = mutableEraseOutcome.asStateFlow()

    public fun dismissEraseOutcome() {
        mutableEraseOutcome.value = null
    }

    private val mutableShare = MutableStateFlow<List<Uri>?>(null)

    /**
     * Documents another app shared that no unlocked session has taken yet:
     * only their addresses, in memory, never written anywhere. A locked
     * vault says they wait; a process that ends forgets them.
     */
    public val pendingShare: StateFlow<List<Uri>?> = mutableShare.asStateFlow()

    private val mutableLogin = MutableStateFlow<OfferedLogin?>(null)

    /**
     * A login another app offered to save that no open vault has taken yet: in memory
     * only. A locked vault says it waits; a newer offer replaces it.
     */
    public val pendingLogin: StateFlow<OfferedLogin?> = mutableLogin.asStateFlow()

    /** The system asked to save a login in ChromVoid; [token] names it in the platform. */
    private fun receiveLogin(logins: OfferedLogins, token: String) {
        viewModelScope.launch(dispatcher) {
            val login = logins.read(token) ?: return@launch
            mutableLogin.value?.takeIf { it.token != login.token }?.let { finishLogin(it, saved = false) }
            mutableLogin.value = login
            deliverLogin()
        }
    }

    /** The person let a waiting login go. */
    public fun discardLogin() {
        val login = mutableLogin.value ?: return
        mutableLogin.value = null
        finishLogin(login, saved = false)
    }

    /** Hands a waiting login to the open vault's form, which answers the platform once. */
    private fun deliverLogin() {
        val login = mutableLogin.value ?: return
        val vault = mutableVault.value ?: return
        if (vault.offerLogin(login) { saved -> finishLogin(login, saved) }) {
            mutableLogin.value = null
            mutableRootRequest.value = AirRoot.VAULT
        }
    }

    private fun finishLogin(login: OfferedLogin, saved: Boolean) {
        val logins = offeredLogins ?: return
        viewModelScope.launch(dispatcher) { runCatching { logins.finish(login.token, saved) } }
    }

    private val mutableRootRequest = MutableStateFlow<AirRoot?>(null)

    /** A root the shell asks the scaffold to show, once. */
    public val rootRequest: StateFlow<AirRoot?> = mutableRootRequest.asStateFlow()

    /** Another app shared [documents]; a newer share replaces one still waiting. */
    public fun receiveShare(documents: List<Uri>) {
        mutableShare.value = documents
        deliverShare()
    }

    /** The person let a waiting share go. */
    public fun discardShare() {
        mutableShare.value = null
    }

    public fun rootRequestHandled() {
        mutableRootRequest.value = null
    }

    /** Hands a waiting share to the unlocked session, unless one it holds is still importing. */
    private fun deliverShare() {
        val documents = mutableShare.value ?: return
        val files = mutableFiles.value ?: return
        val device = fileDevice ?: return
        val single = documents.singleOrNull()
        val toPasswords = if (single != null && credentialSources != null) {
            { importCredentials(single) }
        } else {
            null
        }
        if (files.receiveShare(documents.map(device::source), toPasswords)) mutableShare.value = null
    }

    private fun importCredentials(document: Uri) {
        val vault = mutableVault.value ?: return
        val open = credentialSources ?: return
        vault.importShared(open(document))
        mutableRootRequest.value = AirRoot.VAULT
    }

    init {
        viewModelScope.launch(dispatcher) {
            session.state.collect { state ->
                val generation = (state as? AirSessionState.Unlocked)?.generation
                val current = mutableVault.value
                if (current?.generation != generation) {
                    current?.close()
                    mutableVault.value = generation?.let {
                        VaultScope(
                            credentials,
                            it,
                            clipboard,
                            dispatcher,
                            scanner = scanner,
                            wallets = wallets,
                            passkeys = passkeys,
                        )
                            .apply { synchronize(session.sequence.value) }
                    }
                    deliverLogin()
                }
                if (mutableAutoFill.value?.generation != generation) closeAutoFill()
                val files = mutableFiles.value
                if (files?.generation != generation) {
                    files?.close()
                    mutableFiles.value = generation?.let { open ->
                        if (fileStore == null || fileSettings == null) return@let null
                        FilesScope(
                            fileStore,
                            open,
                            fileSettings,
                            dispatcher,
                            device = fileDevice,
                            sharing = fileSharing,
                            players = mediaPlayers,
                            camera = photoCapture,
                        ).apply { synchronize(session.sequence.value) }
                    }
                }
            }
        }
        viewModelScope.launch(dispatcher) {
            // A share waiting for an unlock, or for the one before it to finish, goes on then.
            mutableFiles.flatMapLatest { files -> files?.incoming ?: flowOf(null) }.collect { incoming ->
                if (incoming == null) deliverShare()
            }
        }
        viewModelScope.launch(dispatcher) {
            // Administration follows its own generation: it runs locked as well
            // as open, and ends when Core stops admitting it rather than at a lock.
            session.administration.collect { generation ->
                val current = mutableMaintenance.value
                if (current?.generation != generation) {
                    current?.close()
                    mutableMaintenance.value = generation?.let { open ->
                        maintenanceServices?.let { services ->
                            MaintenanceScope(
                                open,
                                services,
                                viewModelScope,
                                session = { session.state.value },
                                onStorageReplaced = { viewModelScope.launch { session.refresh() } },
                                onErased = { outcome ->
                                    mutableEraseOutcome.value = outcome
                                    viewModelScope.launch { session.refresh() }
                                },
                            )
                        }
                    }
                }
            }
        }
        viewModelScope.launch(dispatcher) {
            session.state.collect { state ->
                if ((state as? AirSessionState.Unavailable)?.adoption != AdoptionIssue.PEPPER_UNAVAILABLE) {
                    dismissRecoveryReset()
                }
            }
        }
        offeredLogins?.let { logins ->
            viewModelScope.launch(dispatcher) {
                // Each offer is taken once, whenever this shell exists to take it.
                logins.waiting.collect { token ->
                    if (token != null) {
                        logins.take(token)
                        receiveLogin(logins, token)
                    }
                }
            }
        }
        connections?.let { model ->
            viewModelScope.launch(dispatcher) {
                combine(session.administration, session.state) { generation, state ->
                    val open = state is AirSessionState.Unlocked
                    generation.takeIf { open || state == AirSessionState.Locked } to open
                }.distinctUntilChanged().collect { (generation, open) -> model.synchronize(generation, open) }
            }
        }
        viewModelScope.launch(dispatcher) {
            session.sequence.collect { sequence ->
                mutableVault.value?.synchronize(sequence)
                mutableFiles.value?.synchronize(sequence)
            }
        }
    }

    /** The app left the foreground and the vault may still be open: hide what was revealed. */
    public fun coverSensitiveValues() {
        mutableVault.value?.coverSensitiveValues()
    }

    override fun onCleared() {
        connections?.suspend()
        presence?.close()
        mutableVault.value?.close()
        mutableVault.value = null
        mutableFiles.value?.close()
        mutableFiles.value = null
        mutableMaintenance.value?.close()
        mutableMaintenance.value = null
        dismissRecoveryReset()
        closeAutoFill()
    }
}
