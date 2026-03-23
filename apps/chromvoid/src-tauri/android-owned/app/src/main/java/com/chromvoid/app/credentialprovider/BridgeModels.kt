package com.chromvoid.app.credentialprovider

import com.chromvoid.app.passkey.EmptyPasskeyPreflightPayload
import com.chromvoid.app.passkey.PasskeyPreflightPayload

internal data class ProviderStatus(
    val runtimeReady: Boolean,
    val enabled: Boolean,
    val vaultOpen: Boolean,
    val apiLevel: Int,
    val passwordProviderState: String?,
    val passkeysLiteState: String?,
    val autofillFallbackState: String?,
    val unsupportedReason: String?,
)

internal data class OtpOption(
    val id: String,
    val label: String?,
    val otpType: String?,
)

internal data class PasswordCandidate(
    val credentialId: String,
    val username: String,
    val label: String,
    val domain: String?,
)

internal data class AutofillCandidate(
    val credentialId: String,
    val username: String,
    val label: String,
    val domain: String?,
    val otpOptions: List<OtpOption>,
)

internal data class PasswordSecret(
    val username: String,
    val password: String,
)

internal data class AutofillSecret(
    val username: String,
    val password: String?,
    val otp: String?,
)

internal data class PasswordSaveReviewRequest(
    val title: String,
    val username: String,
    val password: String,
    val urls: String,
)

internal data class BridgeError(
    val code: String,
    val message: String,
)

internal sealed interface BridgeResult<out T> {
    data class Success<T>(
        val value: T,
    ) : BridgeResult<T>

    data class Failure(
        val error: BridgeError,
    ) : BridgeResult<Nothing>
}

internal interface NativeCredentialProviderRuntime {
    fun ensureRuntime(dataDir: String): Boolean
    fun runtimeReady(): Boolean
    fun currentApiLevel(): Int
    fun providerStatus(): String
    fun autofillList(origin: String, domain: String): String
    fun autofillGetSecret(sessionId: String, credentialId: String, otpId: String): String
    fun passwordSaveStart(payloadJson: String): String
    fun passwordSaveRequest(token: String): String
    fun passwordSaveMarkLaunched(token: String): String
    fun passkeyPreflight(command: String, payloadJson: String): String
}

internal interface AndroidBridgeGateway {
    fun warmUp()
    fun runtimeReady(): Boolean
    fun currentApiLevel(): Int
    fun providerStatus(): BridgeResult<ProviderStatus>
    fun autofillList(origin: String, domain: String): BridgeResult<Pair<String, List<AutofillCandidate>>>
    fun autofillGetSecret(
        sessionId: String,
        credentialId: String,
        otpId: String? = null,
    ): BridgeResult<AutofillSecret>

    fun passwordList(origin: String, domain: String): BridgeResult<Pair<String, List<PasswordCandidate>>>
    fun passwordGetSecret(sessionId: String, credentialId: String): BridgeResult<PasswordSecret>
    fun passwordSaveStart(payload: PasswordSaveReviewRequest): BridgeResult<String>
    fun passwordSaveRequest(token: String): BridgeResult<PasswordSaveReviewRequest>
    fun passwordSaveMarkLaunched(token: String): BridgeResult<Boolean>
    fun passkeyPreflight(
        command: String,
        payload: PasskeyPreflightPayload = EmptyPasskeyPreflightPayload,
    ): BridgeResult<String>
}
