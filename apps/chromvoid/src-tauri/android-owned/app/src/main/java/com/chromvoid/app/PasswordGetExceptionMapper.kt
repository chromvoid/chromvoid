package com.chromvoid.app

import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialInterruptedException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.exceptions.NoCredentialException
import com.chromvoid.app.credentialprovider.BridgeError

internal object PasswordGetExceptionMapper {
    fun fromBridgeError(
        error: BridgeError,
        fallbackMessage: String,
    ): GetCredentialException {
        val code = error.code.ifBlank { "INTERNAL" }
        val message = error.message.ifBlank { fallbackMessage }
        return when (code) {
            "ACCESS_DENIED", "NO_MATCH" -> NoCredentialException(message)
            "PROVIDER_DISABLED", "VAULT_REQUIRED", "PROVIDER_UNAVAILABLE", "PROVIDER_SESSION_EXPIRED" ->
                GetCredentialInterruptedException(message)
            else -> GetCredentialUnknownException(message)
        }
    }
}
