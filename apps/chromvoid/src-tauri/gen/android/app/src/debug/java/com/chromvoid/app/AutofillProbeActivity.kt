package com.chromvoid.app

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class AutofillProbeActivity : AppCompatActivity() {
    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WebView.setWebContentsDebuggingEnabled(true)

        val webView =
            WebView(this).apply {
                layoutParams =
                    ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                settings.javaScriptEnabled = true
                settings.domStorageEnabled = true
                importantForAutofill = WebView.IMPORTANT_FOR_AUTOFILL_YES
                webViewClient = WebViewClient()
            }

        setContentView(webView)
        val assetName =
            if (intent.getStringExtra(EXTRA_PROBE_MODE) == MODE_OTP) {
                "autofill_probe_otp.html"
            } else {
                "autofill_probe_login.html"
            }
        val html =
            assets.open(assetName).bufferedReader().use { it.readText() }
        webView.loadDataWithBaseURL(
            if (assetName == "autofill_probe_otp.html") OTP_PROBE_URL else PROBE_URL,
            html,
            "text/html",
            "utf-8",
            null,
        )
    }

    companion object {
        const val EXTRA_PROBE_MODE = "probe_mode"
        const val MODE_OTP = "otp"
        const val PROBE_URL = "https://autofill.chromvoid.test/login"
        const val OTP_PROBE_URL = "https://autofill.chromvoid.test/otp"
    }
}
