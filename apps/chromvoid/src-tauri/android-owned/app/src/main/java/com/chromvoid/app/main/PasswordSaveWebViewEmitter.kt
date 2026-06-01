package com.chromvoid.app.main

import android.util.Log
import android.webkit.WebView

internal class PasswordSaveWebViewEmitter(
    private val scriptEvaluator: WebViewScriptEvaluator = DefaultWebViewScriptEvaluator,
) {
    fun emit(
        webView: WebView,
        payload: PasswordSaveWebViewPayload,
        onResult: (Boolean) -> Unit,
        onException: () -> Unit,
    ) {
        val payloadLiteral = PasswordSaveWebViewPayloadJsonCodec.encodeJsStringLiteral(payload)
        try {
            scriptEvaluator.evaluate(
                webView,
                """
                (function () {
                  try {
                    const payload = JSON.parse($payloadLiteral)
                    window.__chromvoidPendingAndroidPasswordSave = payload
                    window.dispatchEvent(new CustomEvent('chromvoid:android-password-save-request'))
                    return true
                  } catch (_error) {
                    return false
                  }
                })();
                """.trimIndent(),
            ) { result ->
                onResult(result == "true")
            }
        } catch (error: Exception) {
            Log.w(TAG, "Password save script eval failed", error)
            onException()
        }
    }

    companion object {
        private const val TAG = "ChromVoid/PasswordSave"
    }
}
