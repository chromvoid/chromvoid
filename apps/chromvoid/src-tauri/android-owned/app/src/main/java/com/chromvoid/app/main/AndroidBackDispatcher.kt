package com.chromvoid.app.main

import android.util.Log
import android.webkit.WebView

internal class AndroidBackDispatcher(
    private val scriptEvaluator: WebViewScriptEvaluator = DefaultWebViewScriptEvaluator,
) {
    fun dispatch(
        webView: WebView?,
        moveTaskToBack: () -> Unit,
    ) {
        val target = webView
        if (target == null) {
            moveTaskToBack()
            return
        }

        try {
            scriptEvaluator.evaluate(target, ANDROID_BACK_DISPATCH_SCRIPT) { result ->
                if (result != "true") {
                    moveTaskToBack()
                }
            }
        } catch (error: Exception) {
            Log.w(TAG, "Android back dispatch failed", error)
            moveTaskToBack()
        }
    }

    companion object {
        private const val TAG = "ChromVoid/AndroidBack"

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
