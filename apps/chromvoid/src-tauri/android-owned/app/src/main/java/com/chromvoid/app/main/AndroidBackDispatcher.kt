package com.chromvoid.app.main

import android.webkit.WebView

internal class AndroidBackDispatcher(
    private val scriptEvaluator: WebViewScriptEvaluator = DefaultWebViewScriptEvaluator,
) {
    private var dispatchInFlight = false

    fun dispatch(
        webView: WebView?,
        moveTaskToBack: () -> Unit,
    ) {
        if (dispatchInFlight) {
            return
        }

        val target = webView
        if (target == null) {
            moveTaskToBack()
            return
        }

        dispatchInFlight = true
        try {
            scriptEvaluator.evaluate(target, ANDROID_BACK_DISPATCH_SCRIPT) { result ->
                dispatchInFlight = false
                if (result != "true") {
                    moveTaskToBack()
                }
            }
        } catch (_error: Exception) {
            dispatchInFlight = false
            moveTaskToBack()
        }
    }

    companion object {
        private val ANDROID_BACK_DISPATCH_SCRIPT =
            """
            (function () {
              try {
                const handler = window.__chromvoidHandleAndroidBack
                return typeof handler === 'function' ? Boolean(handler()) : null
              } catch (_error) {
                return null
              }
            })();
            """.trimIndent()
    }
}
