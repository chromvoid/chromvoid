package com.chromvoid.air.session

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat
import com.chromvoid.air.bridge.AirRuntimeClient
import com.chromvoid.air.bridge.AirSessionRuntime
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.app.VaultStatusNotificationController
import com.chromvoid.app.nativebridge.MobileUsbAccessoryNativeShell
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.launch

/**
 * One application-scoped composition. No service locator and no framework:
 * the graph is created once by the application and passed down explicitly.
 */
public class AirAppGraph private constructor(context: Context) {
    private val applicationContext: Context = context.applicationContext

    /** The process context, for the platform pieces a screen hands work to. */
    internal fun applicationContext(): Context = applicationContext

    /** Work that lives as long as the process, like the runtime it follows. */
    private val processScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

    init {
        // Import before preferences capture their initial flows and before the runtime opens.
        TauriSettingsImport.importIfPresent(applicationContext)
    }

    /** The Session settings' stored choices; nothing from the vault. */
    internal val sessionPreferences: StoredSessionPreferences = StoredSessionPreferences(applicationContext)

    /** Whether folders show hidden items and whether a delete asks first. */
    internal val filePreferences: StoredFilePreferences = StoredFilePreferences(applicationContext)

    /** The theme and language, read before the vault opens. */
    internal val appearancePreferences: StoredAppearancePreferences =
        StoredAppearancePreferences(applicationContext)

    public val session: AirSession = AirSession(
        { testRuntime?.invoke(applicationContext) ?: AirRuntimeClient.open(applicationContext) },
        processScope,
        sessionPreferences,
    )

    /** One per process, so what it owns on the clipboard outlives an activity. */
    internal val clipboard: SystemCredentialClipboard = SystemCredentialClipboard(applicationContext)

    /** Logins the system asked to save, waiting for the shell to take them. */
    internal val offeredLogins: SystemOfferedLogins = SystemOfferedLogins(applicationContext)

    /** Copies offered to other apps; withdrawn whenever the vault is not open. */
    internal val shares: FileShares = FileShares(applicationContext, { session.files }, processScope)

    /** The shared QR scanner, its results consumed here rather than in native code. */
    internal val otpScanner: PlatformOtpScanner by lazy { PlatformOtpScanner(applicationContext) }
    internal val photoCapture: PlatformPhotoCapture by lazy { PlatformPhotoCapture(applicationContext) }

    /**
     * How this phone names itself to a computer it pairs with: the name the
     * person gave the device, else its model.
     */
    internal val deviceLabel: String by lazy {
        android.provider.Settings.Global.getString(
            applicationContext.contentResolver,
            android.provider.Settings.Global.DEVICE_NAME,
        )?.takeIf { it.isNotBlank() } ?: android.os.Build.MODEL
    }

    /** Keeps the process running while the host serves a computer, whatever screen shows. */
    private val hostForeground: HostForeground =
        HostForeground(applicationContext, session.hosts, session.state, processScope)

    /** The phone as a USB accessory: the platform's accessory handling over the runtime's host. */
    private val usbAccessories: UsbAccessoryHost =
        UsbAccessoryHost(applicationContext, session.hostStore, { deviceLabel }, session.state, processScope)

    /** The optional app-presence gate's check and its stored on/off choice. */
    internal val presenceCheck: DevicePresenceCheck by lazy { DevicePresenceCheck(applicationContext) }
    internal val presencePreference: StoredPresencePreference by lazy { StoredPresencePreference(applicationContext) }

    /** Locks from outside the app - the status notification's Lock, the tile - at once. */
    internal fun lockFromOutside() {
        processScope.launch { session.lock() }
    }

    init {
        // Installed before any accessory event can reach the platform's handling.
        MobileUsbAccessoryNativeShell.installSink(usbAccessories)
        processScope.launch {
            session.state.collect { state -> if (state !is AirSessionState.Unlocked) shares.revoke() }
        }
        // The lock surfaces outside the app follow the session: the notification only while
        // the vault is open and chosen, the tile always offered, locking only an open vault.
        processScope.launch {
            combine(session.state, sessionPreferences.lockNotificationChoice) { state, shown ->
                (state is AirSessionState.Unlocked) to shown
            }.distinctUntilChanged().collect { (open, shown) ->
                VaultStatusNotificationController.sync(
                    applicationContext,
                    unlocked = open,
                    notificationEnabled = shown,
                    quickTileEnabled = true,
                )
            }
        }
        // Screen-off locking follows its own Session setting, off by default.
        // Lock on leave still applies when screen-off pauses the foreground app.
        ContextCompat.registerReceiver(
            applicationContext,
            object : BroadcastReceiver() {
                override fun onReceive(context: Context, intent: Intent) {
                    processScope.launch { session.screenOff() }
                }
            },
            IntentFilter(Intent.ACTION_SCREEN_OFF),
            ContextCompat.RECEIVER_NOT_EXPORTED,
        )
    }

    public companion object {
        @Volatile
        private var instance: AirAppGraph? = null

        /**
         * Instrumentation starts the app on one of Core's fixtures before the
         * activity opens. Rust refuses fixtures outside a debug fixture build.
         */
        @androidx.annotation.VisibleForTesting
        @Volatile
        internal var testRuntime: (suspend (Context) -> AirSessionRuntime)? = null

        public fun of(context: Context): AirAppGraph =
            instance ?: synchronized(this) {
                instance ?: AirAppGraph(context).also { instance = it }
            }
    }
}
