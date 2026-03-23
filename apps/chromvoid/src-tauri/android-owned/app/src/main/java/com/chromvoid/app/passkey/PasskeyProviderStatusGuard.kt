package com.chromvoid.app.passkey

import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialInterruptedException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.GetCredentialInterruptedException
import com.chromvoid.app.credentialprovider.AndroidBridgeGateway
import com.chromvoid.app.credentialprovider.BridgeResult

internal object PasskeyProviderStatusGuard {
    fun getFailure(bridgeGateway: AndroidBridgeGateway): GetCredentialException? {
        val status = bridgeGateway.providerStatus()
        if (status is BridgeResult.Failure) {
            return GetCredentialInterruptedException(status.error.message)
        }
        if (status is BridgeResult.Success) {
            return if (!status.value.runtimeReady || !status.value.enabled || !status.value.vaultOpen) {
                GetCredentialInterruptedException("Unlock ChromVoid before using Android passkeys.")
            } else {
                null
            }
        }
        return GetCredentialInterruptedException("ChromVoid passkey provider status is unavailable.")
    }

    fun createFailure(bridgeGateway: AndroidBridgeGateway): CreateCredentialException? {
        val status = bridgeGateway.providerStatus()
        if (status is BridgeResult.Failure) {
            return CreateCredentialInterruptedException(status.error.message)
        }
        if (status is BridgeResult.Success) {
            return if (!status.value.runtimeReady || !status.value.enabled || !status.value.vaultOpen) {
                CreateCredentialInterruptedException("Unlock ChromVoid before creating Android passkeys.")
            } else {
                null
            }
        }
        return CreateCredentialInterruptedException("ChromVoid passkey provider status is unavailable.")
    }
}
