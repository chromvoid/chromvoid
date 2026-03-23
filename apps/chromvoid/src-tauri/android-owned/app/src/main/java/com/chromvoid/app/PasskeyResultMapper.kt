package com.chromvoid.app

import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialInterruptedException
import androidx.credentials.exceptions.CreateCredentialNoCreateOptionException
import androidx.credentials.exceptions.CreateCredentialUnknownException
import androidx.credentials.exceptions.CreateCredentialUnsupportedException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialInterruptedException
import androidx.credentials.exceptions.GetCredentialUnknownException
import androidx.credentials.exceptions.NoCredentialException
import com.chromvoid.app.credentialprovider.BridgeError

internal object PasskeyResultMapper {
    fun getException(error: BridgeError): GetCredentialException {
        val message = error.message
        return when (error.code) {
            "UNSUPPORTED" -> NoCredentialException(message)
            "POLICY_DENIED", "PROVIDER_UNAVAILABLE", "VAULT_REQUIRED", "PROVIDER_DISABLED" ->
                GetCredentialInterruptedException(message)
            "USER_CANCELLED" -> GetCredentialCancellationException(message)
            else -> GetCredentialUnknownException(message.ifBlank { "ChromVoid passkey retrieval failed." })
        }
    }

    fun createException(error: BridgeError): CreateCredentialException {
        val message = error.message
        return when (error.code) {
            "UNSUPPORTED" -> CreateCredentialUnsupportedException(message)
            "NO_CREATE_OPTIONS" -> CreateCredentialNoCreateOptionException(message)
            "POLICY_DENIED", "PROVIDER_UNAVAILABLE", "VAULT_REQUIRED", "PROVIDER_DISABLED" ->
                CreateCredentialInterruptedException(message)
            else -> CreateCredentialUnknownException(message.ifBlank { "ChromVoid passkey creation failed." })
        }
    }
}
