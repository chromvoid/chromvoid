package com.chromvoid.app

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.annotation.RequiresApi
import androidx.credentials.GetCredentialResponse
import androidx.credentials.PasswordCredential
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.provider.PendingIntentHandler
import com.chromvoid.app.credentialprovider.BridgeResult

@RequiresApi(Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
class ChromVoidPasswordGetActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val sessionId =
            intent.getStringExtra(ChromVoidCredentialProviderService.EXTRA_PASSWORD_SESSION_ID).orEmpty()
        val credentialId =
            intent.getStringExtra(ChromVoidCredentialProviderService.EXTRA_PASSWORD_CREDENTIAL_ID).orEmpty()
        if (sessionId.isBlank() || credentialId.isBlank()) {
            finishWithException(
                GetCredentialUnknownException("ChromVoid password request is missing required extras."),
            )
            return
        }

        val providerRequest = PendingIntentHandler.retrieveProviderGetCredentialRequest(intent)
        if (providerRequest == null ||
            providerRequest.credentialOptions.none { it is androidx.credentials.GetPasswordOption }
        ) {
            finishWithException(
                GetCredentialUnknownException("ChromVoid password request is no longer active."),
            )
            return
        }

        when (val response = applicationContext.androidAppGraph().bridgeGateway.passwordGetSecret(sessionId, credentialId)) {
            is BridgeResult.Failure -> {
                finishWithException(
                    PasswordGetExceptionMapper.fromBridgeError(
                        response.error,
                        "ChromVoid could not resolve the selected password credential.",
                    ),
                )
            }
            is BridgeResult.Success -> {
                if (response.value.username.isBlank() || response.value.password.isBlank()) {
                    finishWithException(
                        GetCredentialUnknownException("ChromVoid password credential is incomplete."),
                    )
                    return
                }

                val resultIntent = Intent()
                PendingIntentHandler.setGetCredentialResponse(
                    resultIntent,
                    GetCredentialResponse(
                        PasswordCredential(response.value.username, response.value.password),
                    ),
                )
                setResult(Activity.RESULT_OK, resultIntent)
                finish()
            }
        }
    }

    private fun finishWithException(exception: GetCredentialException) {
        val resultIntent = Intent()
        PendingIntentHandler.setGetCredentialException(resultIntent, exception)
        setResult(Activity.RESULT_OK, resultIntent)
        finish()
    }
}
