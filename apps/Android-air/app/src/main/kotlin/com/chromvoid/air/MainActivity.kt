package com.chromvoid.air

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.view.KeyEvent
import android.view.MotionEvent
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.getValue
import androidx.core.content.pm.PackageInfoCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.session.AirSession
import com.chromvoid.air.session.AndroidAppReset
import com.chromvoid.air.session.SafBackupDestination
import com.chromvoid.air.session.SafFileDevice
import com.chromvoid.air.session.SafRestoreSource
import com.chromvoid.air.session.SystemAutoFillStore
import com.chromvoid.air.ui.AccessSession
import com.chromvoid.air.ui.AirApp
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.design.DarkAirColors
import com.chromvoid.air.ui.design.LightAirColors
import com.chromvoid.air.ui.ShellViewModel
import com.chromvoid.air.ui.access.AccessViewModel
import com.chromvoid.air.ui.files.FileSettings
import com.chromvoid.air.ui.maintenance.MaintenanceServices
import com.chromvoid.air.ui.settings.AppVersion
import com.chromvoid.air.ui.settings.AppearanceModel
import com.chromvoid.air.ui.settings.LockTileRequest
import com.chromvoid.air.ui.transfer.ContentImportSource
import com.chromvoid.app.VaultQuickSettingsTileService
import com.chromvoid.app.nativebridge.MobileUsbAccessoryForegroundRuntime
import com.chromvoid.app.nativebridge.MobileUsbAccessoryIntentContract
import com.chromvoid.app.shared.UsbApprovalNotificationFactory
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** A fragment activity because the system biometric prompt is hosted by one. */
public class MainActivity : FragmentActivity() {
    private lateinit var session: AirSession
    private lateinit var graph: AirAppGraph
    private val shell: ShellViewModel by lazy {
        ViewModelProvider(this, shellViewModelFactory(session, graph))[ShellViewModel::class.java]
    }

    /** The language override leaves night-mode resources following the actual system. */
    override fun attachBaseContext(newBase: Context) {
        super.attachBaseContext(airAppearanceContext(newBase, AirAppGraph.of(newBase).appearancePreferences))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Vault content never reaches a screenshot, the recents snapshot or an external display
        // in a release build; see ScreenCapture. Set before the first frame.
        ScreenCapture.apply(window)
        graph = AirAppGraph.of(this)
        session = graph.session
        val appearance = AppearanceModel(graph.appearancePreferences, onLanguageChanged = { recreate() })
        // The system owns the starting window; the app's first frame already uses the saved Air theme.
        val dark = when (appearance.state.value.theme) {
            AppearanceModel.Theme.SYSTEM -> resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK ==
                Configuration.UI_MODE_NIGHT_YES
            AppearanceModel.Theme.LIGHT -> false
            AppearanceModel.Theme.DARK -> true
        }
        applyAirWindowTheme(if (dark) DarkAirColors else LightAirColors)
        lifecycleScope.launch { session.start() }
        setContent {
            val theme by appearance.state.collectAsStateWithLifecycle()
            AirTheme(theme.theme) {
                AirWindowTheme()
                val model: AccessViewModel = viewModel(factory = accessViewModelFactory(session))
                AirApp(
                    model = model,
                    shell = shell,
                    appearance = appearance,
                    version = installedVersion(),
                    onRetry = { lifecycleScope.launch { session.start() } },
                    beforeHostStarts = ::beforeHostStarts,
                )
            }
        }
        // A share is taken once: a process the system restores gets the same
        // intent back, and the documents it named are not asked for again.
        if (savedInstanceState == null) receive(intent)
    }

    private var hostStart: (() -> Unit)? = null

    private val notifications = registerForActivityResult(ActivityResultContracts.RequestPermission()) {
        // The host starts either way; without the permission its notification is just not shown.
        hostStart?.invoke()
        hostStart = null
    }

    /**
     * A running host is shown by its notification, so the permission to post
     * one is asked for as the person starts it - once, where Android asks.
     */
    private fun beforeHostStarts(proceed: () -> Unit) {
        val granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            proceed()
            return
        }
        hostStart = proceed
        notifications.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        receive(intent)
    }

    /**
     * Documents another app shared go to the shell, in memory only. A desktop's USB accessory
     * the system opened this app for goes to the platform's accessory handling.
     */
    private fun receive(intent: Intent) {
        if (intent.action in USB_ACCESSORY_ACTIONS) {
            MobileUsbAccessoryForegroundRuntime.handleIntent(applicationContext, intent)
            return
        }
        val documents = IncomingIntents.sharedDocuments(intent) ?: return
        shell.receiveShare(documents)
    }

    override fun onStart() {
        super.onStart()
        // A desktop's question on the USB cable is asked in the app while it shows.
        UsbApprovalNotificationFactory.setAppInForeground(this, true)
        graph.presenceCheck.attach(this)
        lifecycleScope.launch { session.activate() }
    }

    /** The presence gate asks again after the app has been away. */
    override fun onStop() {
        super.onStop()
        UsbApprovalNotificationFactory.setAppInForeground(this, false)
        if (picking == null) shell.presence?.onBackground()
        graph.presenceCheck.attach(null)
    }

    /**
     * Leaving the foreground hides what was revealed at once and, when
     * Settings asks for it, locks. The work starts here rather than in
     * `onStop` so it is issued while the process is still certain to run.
     *
     * A system picker this app opened is not leaving it: the person chose a
     * folder or a file for what they are doing here, and locking under them
     * would end that work. What was revealed is still hidden, and a picker
     * left open past [PICKER_GRACE_MILLIS] counts as leaving after all.
     */
    override fun onPause() {
        super.onPause()
        shell.coverSensitiveValues()
        if (picking != null) {
            picking = lifecycleScope.launch {
                delay(PICKER_GRACE_MILLIS)
                picking = null
                shell.presence?.onBackground()
                session.leaveForeground()
            }
            return
        }
        lifecycleScope.launch { session.leaveForeground() }
    }

    override fun onResume() {
        super.onResume()
        picking?.cancel()
        picking = null
        graph.clipboard.finishPendingClear()
        // A desktop still on the cable whose session ended is listened for again.
        MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(applicationContext)
    }

    /** Set while a system picker the app opened is on screen; see [onPause]. */
    private var picking: Job? = null

    /**
     * Every activity-result launch - the folder and document pickers - comes
     * through here, so the exemption needs nothing from the screens.
     */
    @Deprecated("Called by the activity-result registry, which is what the screens use.")
    override fun startActivityForResult(intent: Intent, requestCode: Int, options: Bundle?) {
        picking = Job()
        try {
            @Suppress("DEPRECATION")
            super.startActivityForResult(intent, requestCode, options)
        } catch (error: RuntimeException) {
            // Nothing opened, so the next pause is an ordinary one.
            picking = null
            throw error
        }
    }

    /** Only input from the person counts as activity for the inactivity lock. */
    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        recordActivity()
        return super.dispatchTouchEvent(event)
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        recordActivity()
        return super.dispatchKeyEvent(event)
    }

    /** The version the system has installed, as About shows it. */
    private fun installedVersion(): AppVersion? = runCatching {
        val info = packageManager.getPackageInfo(packageName, 0)
        AppVersion(info.versionName.orEmpty(), PackageInfoCompat.getLongVersionCode(info).toString())
    }.getOrNull()

    private var lastActivity = 0L

    private fun recordActivity() {
        if (graph.sessionPreferences.autoLockSeconds <= 0) return
        val now = SystemClock.elapsedRealtime()
        if (now - lastActivity < ACTIVITY_INTERVAL_MILLIS) return
        lastActivity = now
        lifecycleScope.launch { session.recordUserActivity() }
    }

    private companion object {
        const val ACTIVITY_INTERVAL_MILLIS = 1_000L

        /** How long a picker may stay open before leaving it counts as leaving the app. */
        const val PICKER_GRACE_MILLIS = 180_000L

        /** How the system hands this activity a desktop's USB accessory. */
        val USB_ACCESSORY_ACTIONS = setOf(
            android.hardware.usb.UsbManager.ACTION_USB_ACCESSORY_ATTACHED,
            MobileUsbAccessoryIntentContract.ACTION_USB_ACCESSORY_HANDSHAKE,
        )
    }
}

internal fun accessViewModelFactory(
    session: AccessSession,
    animateUnlockCompletion: Boolean = true,
): ViewModelProvider.Factory =
    object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T =
            AccessViewModel(session, animateUnlockCompletion = animateUnlockCompletion) as T
    }

internal fun shellViewModelFactory(session: AirSession, graph: AirAppGraph): ViewModelProvider.Factory =
    object : ViewModelProvider.Factory {
        @Suppress("UNCHECKED_CAST")
        override fun <T : ViewModel> create(modelClass: Class<T>): T = ShellViewModel(
            session,
            session.credentials,
            graph.clipboard,
            scanner = graph.otpScanner,
            presenceCheck = graph.presenceCheck,
            presencePreference = graph.presencePreference,
            autoLock = session,
            sessionPreferences = graph.sessionPreferences,
            maintenanceServices = MaintenanceServices(
                passwords = session.maintenance,
                backups = session.backups,
                backupDestinations = { tree -> SafBackupDestination(graph.applicationContext(), tree) },
                restores = session.restores,
                restoreSources = { tree -> SafRestoreSource(graph.applicationContext(), tree) },
                erasure = session.erasure,
                appReset = AndroidAppReset(graph.applicationContext()),
            ),
            fileStore = session.files,
            fileSettings = FileSettings(graph.filePreferences),
            fileDevice = SafFileDevice(graph.applicationContext()),
            fileSharing = graph.shares,
            mediaPlayers = vaultPlayers(graph.applicationContext()),
            photoCapture = graph.photoCapture,
            credentialSources = { document -> ContentImportSource(graph.applicationContext(), document) },
            wallets = session.wallet,
            passkeys = session.passkeys,
            hosts = session.hosts,
            autoFillStore = SystemAutoFillStore(graph.applicationContext(), session),
            offeredLogins = graph.offeredLogins,
            lockTile = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                LockTileRequest { VaultQuickSettingsTileService.requestAddTile(graph.applicationContext()) }
            } else {
                null
            },
            deviceLabel = graph.deviceLabel,
        ) as T
    }

/**
 * Players that read only what the vault hands them: the data source is the
 * vault reader, there is no disk cache, and audio focus is the platform's.
 */
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
internal fun vaultPlayers(context: android.content.Context): com.chromvoid.air.ui.media.MediaPlayers =
    com.chromvoid.air.ui.media.MediaPlayers { source ->
        androidx.media3.exoplayer.ExoPlayer.Builder(context)
            .setMediaSourceFactory(androidx.media3.exoplayer.source.DefaultMediaSourceFactory(source))
            .setAudioAttributes(androidx.media3.common.AudioAttributes.DEFAULT, true)
            .build()
    }
