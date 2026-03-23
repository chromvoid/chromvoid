package com.chromvoid.app

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.annotation.RequiresApi
import androidx.credentials.exceptions.CreateCredentialException
import androidx.fragment.app.FragmentActivity
import com.chromvoid.app.passkey.BiometricPromptRunnerAdapter
import com.chromvoid.app.passkey.PasskeyCreateCoordinator

@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class ChromVoidPasskeyCreateActivity : FragmentActivity() {
    private var finished = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val graph = applicationContext.androidAppGraph()
        val coordinator =
            PasskeyCreateCoordinator(
                bridgeGateway = graph.bridgeGateway,
                requestRegistry = graph.passkeyRequestRegistry,
                passkeyStore = graph.passkeyMetadataStore,
            )
        coordinator.execute(
            activity = this,
            intent = intent,
            biometric = BiometricPromptRunnerAdapter(graph.biometricPromptRunner),
            onSuccess = ::finishSuccess,
            onFailure = ::finishWithException,
        )
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

    private fun finishWithException(requestId: String, exception: CreateCredentialException) {
        if (finished) {
            return
        }
        finished = true
        if (requestId.isNotBlank()) {
            applicationContext.androidAppGraph().passkeyRequestRegistry.remove(requestId)
        }
        val resultIntent = Intent()
        androidx.credentials.provider.PendingIntentHandler.setCreateCredentialException(resultIntent, exception)
        setResult(Activity.RESULT_OK, resultIntent)
        finish()
    }
}
