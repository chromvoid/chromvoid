package com.chromvoid.app.passkey

import android.content.Intent
import androidx.credentials.CreateCredentialResponse
import androidx.credentials.GetCredentialResponse
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.provider.PendingIntentHandler
import com.chromvoid.app.PasskeyActivityResponseWriterRuntime

internal object AndroidPasskeyResponseWriter : PasskeyActivityResponseWriterRuntime {
    override fun setGetSuccess(intent: Intent, response: GetCredentialResponse) {
        PendingIntentHandler.setGetCredentialResponse(intent, response)
    }

    override fun setGetFailure(intent: Intent, exception: GetCredentialException) {
        PendingIntentHandler.setGetCredentialException(intent, exception)
    }

    override fun setCreateSuccess(intent: Intent, response: CreateCredentialResponse) {
        PendingIntentHandler.setCreateCredentialResponse(intent, response)
    }

    override fun setCreateFailure(intent: Intent, exception: CreateCredentialException) {
        PendingIntentHandler.setCreateCredentialException(intent, exception)
    }
}
