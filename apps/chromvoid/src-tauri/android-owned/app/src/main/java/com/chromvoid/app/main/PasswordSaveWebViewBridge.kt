package com.chromvoid.app.main

import android.content.Intent
import android.webkit.WebView
import com.chromvoid.app.credentialprovider.AndroidBridgeGateway
import com.chromvoid.app.credentialprovider.BridgeResult

internal class PasswordSaveWebViewBridge(
    private val bridgeGateway: AndroidBridgeGateway,
    private val requestStore: PasswordSaveRequestStore,
    private val reviewController: PasswordSaveReviewController,
    private val emitter: PasswordSaveWebViewEmitter = PasswordSaveWebViewEmitter(),
) {
    fun consumeIntent(intent: Intent?) {
        PasswordSaveIntentContract.requestToken(intent)?.let(requestStore::stage)
    }

    fun dispatchPending(webView: WebView?) {
        val target = webView ?: return
        val pending = requestStore.current() ?: return

        when (val response = bridgeGateway.passwordSaveRequest(pending.token)) {
            is BridgeResult.Failure -> {
                requestStore.remove(pending.token)
            }
            is BridgeResult.Success -> {
                emitter.emit(
                    webView = target,
                    payload =
                        PasswordSaveWebViewPayload(
                            token = pending.token,
                            title = response.value.title,
                            username = response.value.username,
                            password = response.value.password,
                            urls = response.value.urls,
                        ),
                    onResult = { delivered ->
                        if (delivered) {
                            handleMarkedLaunch(pending.token)
                        }
                    },
                    onException = {},
                )
            }
        }
    }

    private fun handleMarkedLaunch(token: String) {
        when (val launched = bridgeGateway.passwordSaveMarkLaunched(token)) {
            is BridgeResult.Failure -> {
                requestStore.remove(token)
                reviewController.completeReview(token, "dismissed", false)
            }
            is BridgeResult.Success -> {
                requestStore.remove(token)
                if (!launched.value) {
                    reviewController.completeReview(token, "dismissed", false)
                }
            }
        }
    }
}
