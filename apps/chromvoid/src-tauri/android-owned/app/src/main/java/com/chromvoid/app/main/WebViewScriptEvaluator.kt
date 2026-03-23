package com.chromvoid.app.main

import android.webkit.ValueCallback
import android.webkit.WebView

internal fun interface WebViewScriptEvaluator {
    fun evaluate(
        webView: WebView,
        script: String,
        onResult: (String?) -> Unit,
    )
}

internal object DefaultWebViewScriptEvaluator : WebViewScriptEvaluator {
    override fun evaluate(
        webView: WebView,
        script: String,
        onResult: (String?) -> Unit,
    ) {
        webView.evaluateJavascript(script, ValueCallback { result -> onResult(result) })
    }
}
