package com.chromvoid.app

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.JavascriptInterface
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.enableEdgeToEdge
import com.chromvoid.app.main.AndroidKeyboardInsetsBridge
import com.chromvoid.app.main.MainActivityCoordinator
import com.chromvoid.app.main.StartupSplashController
import com.chromvoid.app.nativebridge.AndroidShareImportNativeShell
import com.chromvoid.app.nativebridge.NativeUploadNativeShell
import com.chromvoid.app.nativebridge.SafBackupNativeShell
import kotlin.math.roundToInt

class MainActivity : TauriActivity() {
    private val startupTimelineStartedAtMs = SystemClock.uptimeMillis()
    private val startupSplashBridge = StartupSplashBridge()
    private val androidShareBridge = AndroidShareBridge()
    private val keyboardInsetsBridge = AndroidKeyboardInsetsBridge()
    private var webView: WebView? = null
    private lateinit var startupSplashController: StartupSplashController
    private lateinit var coordinator: MainActivityCoordinator
    private val mediaLocationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            NativeUploadNativeShell.handleMediaLocationPermissionResult(granted)
        }
    private val postNotificationsPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {
            VaultStatusNotificationController.handlePostNotificationsPermissionResult(
                applicationContext,
            )
        }
    private val nativeUploadLauncher =
        registerForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { uris ->
            NativeUploadNativeShell.handlePickerResult(applicationContext, uris)
        }
    private val safBackupTreeLauncher =
        registerForActivityResult(ActivityResultContracts.OpenDocumentTree()) { uri ->
            SafBackupNativeShell.handleTreePickerResult(applicationContext, uri)
        }

    private val appBackCallback =
        object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                coordinator.dispatchBackToWebView(webView) {
                    moveTaskToBack(true)
                }
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        val launchIntent = Intent(intent)
        logStartup("activity.onCreate.begin", "savedState=${savedInstanceState != null}")
        window.setBackgroundDrawable(ColorDrawable(StartupSplashController.BACKGROUND_COLOR))
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        logStartup("activity.onCreate.after_super")
        startupSplashController = StartupSplashController(this, ::logStartup)
        startupSplashController.install()
        NativeUploadNativeShell.bindPickerLauncher(
            applicationContext,
            nativeUploadLauncher,
            mediaLocationPermissionLauncher,
        )
        VaultStatusNotificationController.bindPostNotificationsPermissionLauncher(
            postNotificationsPermissionLauncher,
        )
        SafBackupNativeShell.bindTreePickerLauncher(
            safBackupTreeLauncher,
        )

        val graph = applicationContext.androidAppGraph()
        logStartup("activity.graph.ready")
        coordinator =
            MainActivityCoordinator(
                bridgeGateway = graph.bridgeGateway,
                passwordSaveRequestStore = graph.passwordSaveRequestStore,
                passwordSaveReviewController = graph.passwordSaveReviewController,
            )
        coordinator.consumePasswordSavePayload(launchIntent)
        onBackPressedDispatcher.addCallback(this, appBackCallback)
        logStartup("activity.onCreate.end")
    }

    @SuppressLint("JavascriptInterface")
    override fun onWebViewCreate(webView: WebView) {
        logStartup("webview.create.begin")
        super.onWebViewCreate(webView)
        this.webView = webView
        if (BuildConfig.DEBUG) {
            webView.settings.cacheMode = WebSettings.LOAD_NO_CACHE
            webView.clearCache(true)
            logStartup("webview.cache.disabled")
        }
        webView.setBackgroundColor(StartupSplashController.BACKGROUND_COLOR)
        webView.addJavascriptInterface(startupSplashBridge, STARTUP_SPLASH_BRIDGE_NAME)
        webView.addJavascriptInterface(androidShareBridge, ANDROID_SHARE_BRIDGE_NAME)
        keyboardInsetsBridge.attach(webView)
        coordinator.dispatchPendingPasswordSaveToWebView(webView)
        AndroidShareImportNativeShell.dispatchPending(webView)
        startupSplashController.ensureOnTop("webview.create")
        logStartup("webview.create.end")
    }

    override fun onResume() {
        super.onResume()
        logStartup("activity.onResume")
        coordinator.dispatchPendingPasswordSaveToWebView(webView)
        AndroidShareImportNativeShell.dispatchPending(webView)
    }

    override fun onNewIntent(intent: Intent) {
        val incomingIntent = Intent(intent)
        super.onNewIntent(incomingIntent)
        setIntent(incomingIntent)
        coordinator.consumePasswordSavePayload(incomingIntent)
        coordinator.dispatchPendingPasswordSaveToWebView(webView)
        AndroidShareImportNativeShell.dispatchPending(webView)
    }

    override fun onDestroy() {
        logStartup("activity.onDestroy")
        if (::startupSplashController.isInitialized) {
            startupSplashController.dispose()
        }
        NativeUploadNativeShell.clearPickerLauncher(nativeUploadLauncher)
        VaultStatusNotificationController.clearPostNotificationsPermissionLauncher(
            postNotificationsPermissionLauncher,
        )
        SafBackupNativeShell.clearTreePickerLauncher(safBackupTreeLauncher)
        keyboardInsetsBridge.detach(webView)
        webView = null
        super.onDestroy()
    }

    private fun logStartup(label: String, detail: String? = null) {
        val elapsedMs = SystemClock.uptimeMillis() - startupTimelineStartedAtMs
        val suffix = if (detail.isNullOrBlank()) "" else " | $detail"
        Log.d(STARTUP_LOG_TAG, "t+${elapsedMs}ms $label$suffix")
    }

    private inner class StartupSplashBridge {
        @JavascriptInterface
        fun domReady() {
            logStartup("bridge.domReady.received")
            runOnUiThread {
                logStartup("bridge.domReady.ui")
                keyboardInsetsBridge.replayCurrentInsets(webView)
                startupSplashController.requestRelease()
            }
        }

        @JavascriptInterface
        fun startupLog(label: String?, webElapsedMs: Double, details: String?) {
            val roundedWebElapsedMs = webElapsedMs.roundToInt()
            val normalizedLabel = label ?: "unknown"
            val nativeLabel = if (normalizedLabel.startsWith("web.")) normalizedLabel else "web.$normalizedLabel"
            val suffix = if (details.isNullOrBlank()) "" else " $details"
            logStartup(nativeLabel, "webT+${roundedWebElapsedMs}ms$suffix")
        }
    }

    private inner class AndroidShareBridge {
        @JavascriptInterface
        fun requestPendingSharedFiles() {
            AndroidShareImportDiagnostics.log("web_ready_pending_request")
            runOnUiThread {
                AndroidShareImportNativeShell.dispatchPending(webView)
            }
        }
    }

    companion object {
        private const val STARTUP_LOG_TAG = "ChromVoidStartup"
        private const val STARTUP_SPLASH_BRIDGE_NAME = "ChromVoidSplash"
        private const val ANDROID_SHARE_BRIDGE_NAME = "ChromVoidAndroidShare"
    }
}
