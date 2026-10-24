package com.chromvoid.app

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.RequiresApi
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialUnknownException
import androidx.fragment.app.FragmentActivity
import com.chromvoid.app.passkey.BiometricPromptRunnerAdapter
import com.chromvoid.app.passkey.PasskeyCreateCoordinator
import com.chromvoid.app.passkey.PasskeyTrace
import com.chromvoid.app.shared.PlatformHost
import com.chromvoid.app.shared.ProviderUnlock

/**
 * Creates the passkey Credential Manager's sheet was confirmed for. A vault still locked -
 * or not opened yet in this process - is opened first on the host's unlock screen, and the
 * creation goes on once it is open; leaving that screen creates nothing.
 */
@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class ChromVoidPasskeyCreateActivity : FragmentActivity() {
    private var finished = false
    private var unlocking = false

    private val unlock =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
            unlocking = false
            if (result.resultCode == Activity.RESULT_OK) {
                create()
            } else {
                finishWithException(requestId(), CreateCredentialCancellationException("ChromVoid stayed locked."))
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        PasskeyTrace.important(
            "create_activity_on_create",
            "action" to intent.action,
            "extras" to intent.extras?.keySet()?.joinToString(","),
        )
        // Recreated while the unlock screen is up: its result comes back to this instance.
        if (savedInstanceState?.getBoolean(UNLOCKING) == true) {
            unlocking = true
            return
        }
        val unlockIntent = PlatformHost.providerUnlockIntent(this)
        if (unlockIntent != null && !ProviderUnlock.vaultOpen(this)) {
            PasskeyTrace.important("create_activity_unlock", "requestId" to requestId())
            unlocking = true
            unlock.launch(unlockIntent)
            return
        }
        create()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        outState.putBoolean(UNLOCKING, unlocking)
    }

    private fun create() {
        runCatching {
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
        }.onFailure { error ->
            finishWithException("", CreateCredentialUnknownException(error.message ?: "ChromVoid passkey create failed."))
        }
    }

    private fun requestId(): String = intent.getStringExtra(ChromVoidCredentialProviderService.EXTRA_REQUEST_ID).orEmpty()

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

    private companion object {
        const val UNLOCKING = "com.chromvoid.app.passkey.UNLOCKING"
    }
}
