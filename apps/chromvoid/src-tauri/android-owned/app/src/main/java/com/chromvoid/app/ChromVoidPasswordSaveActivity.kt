package com.chromvoid.app

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import com.chromvoid.app.credentialprovider.BridgeResult

class ChromVoidPasswordSaveActivity : Activity() {
    internal var currentReviewToken: String? = null

    private var requestToken: String = ""
    private var launchedMain = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        requestToken = intent.getStringExtra(EXTRA_REQUEST_TOKEN).orEmpty()
        currentReviewToken = requestToken
        if (requestToken.isBlank()) {
            finishCancelled("missing_token")
            return
        }

        val bridgeGateway = applicationContext.androidAppGraph().bridgeGateway
        when (bridgeGateway.passwordSaveRequest(requestToken)) {
            is BridgeResult.Failure -> {
                finishCancelled("invalid_token")
                return
            }
            is BridgeResult.Success -> Unit
        }

        startActivity(
            Intent(this, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra(EXTRA_TRIGGER_SOURCE, "android_password_save")
                putExtra(EXTRA_REQUEST_TOKEN, requestToken)
            },
        )
        launchedMain = true
    }

    override fun onResume() {
        super.onResume()
        if (!launchedMain) {
            return
        }

        when (applicationContext.androidAppGraph().bridgeGateway.passwordSaveRequest(requestToken)) {
            is BridgeResult.Failure -> finishCancelled("stale_or_expired")
            is BridgeResult.Success -> Unit
        }
    }

    override fun onDestroy() {
        currentReviewToken = null
        super.onDestroy()
    }

    companion object {
        const val EXTRA_TRIGGER_SOURCE = "com.chromvoid.app.EXTRA_TRIGGER_SOURCE"
        const val EXTRA_REQUEST_TOKEN = "com.chromvoid.app.EXTRA_PASSWORD_SAVE_REQUEST_TOKEN"
    }

    private fun finishCancelled(reason: String) {
        setResult(
            RESULT_CANCELED,
            Intent()
                .putExtra("token", requestToken)
                .putExtra("outcome", "dismissed")
                .putExtra("reason", reason),
        )
        finish()
    }
}
