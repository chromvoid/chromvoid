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
import com.chromvoid.app.passkey.PasskeyTrace

@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class ChromVoidPasskeyCreateActivity : FragmentActivity() {
    private var finished = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        PasskeyTrace.important(
            "create_activity_on_create",
            "action" to intent.action,
            "extras" to intent.extras?.keySet()?.joinToString(","),
        )

        val graph = applicationContext.androidAppGraph()
        val coordinator =
            PasskeyCreateCoordinator(
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
    }

    private fun finishSuccess(requestId: String, resultIntent: Intent) {
        if (finished) {
            PasskeyTrace.diagnostic(
                "create_activity_finish_ignored",
                "requestId" to requestId,
                "reason" to "already_finished_success",
            )
            return
        }
        finished = true
        PasskeyTrace.diagnostic(
            "create_activity_finish_success",
            "requestId" to requestId,
        )
        applicationContext.androidAppGraph().passkeyRequestRegistry.remove(requestId)
        setResult(Activity.RESULT_OK, resultIntent)
        finish()
    }

    private fun finishWithException(requestId: String, exception: CreateCredentialException) {
        if (finished) {
            PasskeyTrace.diagnostic(
                "create_activity_finish_ignored",
                "requestId" to requestId,
                "reason" to "already_finished_error",
                "exception" to exception::class.java.simpleName,
                "message" to exception.message,
            )
            return
        }
        finished = true
        PasskeyTrace.diagnostic(
            "create_activity_finish_error",
            "requestId" to requestId,
            "exception" to exception::class.java.simpleName,
            "message" to exception.message,
        )
        if (requestId.isNotBlank()) {
            applicationContext.androidAppGraph().passkeyRequestRegistry.remove(requestId)
        }
        val resultIntent = Intent()
        androidx.credentials.provider.PendingIntentHandler.setCreateCredentialException(resultIntent, exception)
        setResult(Activity.RESULT_OK, resultIntent)
        finish()
    }
}
