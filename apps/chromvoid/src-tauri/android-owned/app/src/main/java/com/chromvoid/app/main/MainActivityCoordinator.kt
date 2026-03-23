package com.chromvoid.app.main

import android.content.Intent
import android.webkit.WebView
import com.chromvoid.app.credentialprovider.AndroidBridgeGateway

internal class MainActivityCoordinator(
    bridgeGateway: AndroidBridgeGateway,
    passwordSaveRequestStore: PasswordSaveRequestStore,
    passwordSaveReviewController: PasswordSaveReviewController,
    private val backDispatcher: AndroidBackDispatcher = AndroidBackDispatcher(),
    private val passwordSaveBridge: PasswordSaveWebViewBridge =
        PasswordSaveWebViewBridge(
            bridgeGateway = bridgeGateway,
            requestStore = passwordSaveRequestStore,
            reviewController = passwordSaveReviewController,
        ),
) {
    fun consumePasswordSavePayload(intent: Intent?) {
        passwordSaveBridge.consumeIntent(intent)
    }

    fun dispatchBackToWebView(
        webView: WebView?,
        moveTaskToBack: () -> Unit,
    ) {
        backDispatcher.dispatch(webView, moveTaskToBack)
    }

    fun dispatchPendingPasswordSaveToWebView(webView: WebView?) {
        passwordSaveBridge.dispatchPending(webView)
    }
}
