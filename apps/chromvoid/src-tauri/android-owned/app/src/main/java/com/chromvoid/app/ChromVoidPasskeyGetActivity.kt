package com.chromvoid.app

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.annotation.RequiresApi
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.fragment.app.FragmentActivity
import com.chromvoid.app.passkey.BiometricPromptRunnerAdapter
import com.chromvoid.app.passkey.PasskeyGetCoordinator

@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class ChromVoidPasskeyGetActivity : FragmentActivity() {
    private var finished = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        runCatching {
            val graph = applicationContext.androidAppGraph()
            val coordinator =
                PasskeyGetCoordinator(
                    bridgeGateway = graph.bridgeGateway,
                    requestRegistry = graph.passkeyRequestRegistry,
                )
            coordinator.execute(
                activity = this,
                intent = intent,
                biometric = BiometricPromptRunnerAdapter(graph.biometricPromptRunner),
                onSuccess = ::finishSuccess,
                onFailure = ::finishWithException,
            )
        }.onFailure { error ->
            finishWithException("", GetCredentialUnknownException(error.message ?: "ChromVoid passkey get failed."))
        }
    }

    private fun finishSuccess(requestId: String, resultIntent: Intent) {
        if (finished) {
            return
        }
        finished = true
        applicationContext.androidAppGraph().passkeyRequestRegistry.remove(requestId)
        setResult(Activity.RESULT_OK, resultIntent)
        finish()
    }

    private fun finishWithException(requestId: String, exception: GetCredentialException) {
        if (finished) {
            return
        }
        finished = true
        if (requestId.isNotBlank()) {
            applicationContext.androidAppGraph().passkeyRequestRegistry.remove(requestId)
        }
        val resultIntent = Intent()
        androidx.credentials.provider.PendingIntentHandler.setGetCredentialException(resultIntent, exception)
        setResult(Activity.RESULT_OK, resultIntent)
        finish()
    }
}
