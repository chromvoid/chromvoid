package com.chromvoid.app

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import com.chromvoid.app.main.MainActivityCoordinator

class MainActivity : TauriActivity() {
    private var webView: WebView? = null
    private lateinit var coordinator: MainActivityCoordinator

    private val appBackCallback =
        object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                coordinator.dispatchBackToWebView(webView) {
                    moveTaskToBack(true)
                }
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        val graph = applicationContext.androidAppGraph()
        coordinator =
            MainActivityCoordinator(
                bridgeGateway = graph.bridgeGateway,
                passwordSaveRequestStore = graph.passwordSaveRequestStore,
                passwordSaveReviewController = graph.passwordSaveReviewController,
            )
        coordinator.consumePasswordSavePayload(intent)
        onBackPressedDispatcher.addCallback(this, appBackCallback)
    }

    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        this.webView = webView
        coordinator.dispatchPendingPasswordSaveToWebView(webView)
    }

    override fun onResume() {
        super.onResume()
        coordinator.dispatchPendingPasswordSaveToWebView(webView)
    }

    override fun onNewIntent(intent: android.content.Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        coordinator.consumePasswordSavePayload(intent)
        coordinator.dispatchPendingPasswordSaveToWebView(webView)
    }

    override fun onDestroy() {
        webView = null
        super.onDestroy()
    }
}
