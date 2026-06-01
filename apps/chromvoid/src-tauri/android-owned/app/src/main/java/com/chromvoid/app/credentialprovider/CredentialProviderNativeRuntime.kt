package com.chromvoid.app.credentialprovider

import com.chromvoid.app.nativebridge.CredentialProviderNativeShell

internal object CredentialProviderNativeRuntime : NativeCredentialProviderRuntime {
    override fun ensureRuntime(dataDir: String): Boolean =
        CredentialProviderNativeShell.ensureRuntime(dataDir)

    override fun runtimeReady(): Boolean =
        CredentialProviderNativeShell.runtimeReady()

    override fun currentApiLevel(): Int =
        CredentialProviderNativeShell.currentApiLevel()

    override fun providerStatus(): String =
        CredentialProviderNativeShell.providerStatus()

    override fun autofillList(origin: String, domain: String, includeDiagnostics: Boolean): String =
        CredentialProviderNativeShell.autofillList(origin, domain, includeDiagnostics)

    override fun autofillCloseSession(sessionId: String): String =
        CredentialProviderNativeShell.autofillCloseSession(sessionId)

    override fun autofillGetSecret(sessionId: String, credentialId: String, otpId: String): String =
        CredentialProviderNativeShell.autofillGetSecret(sessionId, credentialId, otpId)

    override fun passwordSaveStart(payloadJson: String): String =
        CredentialProviderNativeShell.passwordSaveStart(payloadJson)

    override fun passwordSaveRequest(token: String): String =
        CredentialProviderNativeShell.passwordSaveRequest(token)

    override fun passwordSaveMarkLaunched(token: String): String =
        CredentialProviderNativeShell.passwordSaveMarkLaunched(token)

    override fun passkeyPreflight(command: String, payloadJson: String): String =
        CredentialProviderNativeShell.passkeyPreflight(command, payloadJson)

    override fun passkeyQuery(payloadJson: String): String =
        CredentialProviderNativeShell.passkeyQuery(payloadJson)

    override fun passkeyCreate(payloadJson: String): String =
        CredentialProviderNativeShell.passkeyCreate(payloadJson)

    override fun passkeyGet(payloadJson: String): String =
        CredentialProviderNativeShell.passkeyGet(payloadJson)
}
