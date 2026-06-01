package com.chromvoid.app

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import com.chromvoid.app.nativebridge.AndroidShareImportNativeShell

class ShareImportActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        consumeAndOpenMain("onCreate", intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        consumeAndOpenMain("onNewIntent", intent)
    }

    private fun consumeAndOpenMain(
        source: String,
        incomingIntent: Intent?,
    ) {
        val shareIntent = incomingIntent?.let(::Intent)
        AndroidShareImportDiagnostics.log(
            "share_proxy_received",
            "source=$source action=${shareIntent?.action.orEmpty()} ${AndroidShareImportDiagnostics.describeShareInputs(shareIntent)}",
        )
        val consumed = AndroidShareImportNativeShell.consumeIntent(applicationContext, shareIntent)
        AndroidShareImportDiagnostics.log(
            "share_proxy_consumed",
            "source=$source action=${shareIntent?.action.orEmpty()} consumed=$consumed",
        )
        openMainActivity()
        finish()
    }

    private fun openMainActivity() {
        AndroidShareImportDiagnostics.log("share_proxy_open_main")
        startActivity(
            Intent(this, MainActivity::class.java).apply {
                action = Intent.ACTION_MAIN
                addCategory(Intent.CATEGORY_LAUNCHER)
                addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
            },
        )
    }
}
