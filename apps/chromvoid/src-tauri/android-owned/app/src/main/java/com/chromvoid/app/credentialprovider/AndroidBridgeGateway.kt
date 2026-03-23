package com.chromvoid.app.credentialprovider

import android.content.Context

internal class JniAndroidBridgeGateway(
    private val appContext: Context,
    private val runtime: NativeCredentialProviderRuntime,
    private val parser: BridgePayloadParser = BridgePayloadParser(),
) : AndroidBridgeGateway {
    override fun warmUp() {
        runtime.ensureRuntime(appContext.filesDir.absolutePath)
    }

    override fun runtimeReady(): Boolean {
        warmUp()
        return runtime.runtimeReady()
    }

    override fun currentApiLevel(): Int = runtime.currentApiLevel()

    override fun providerStatus(): BridgeResult<ProviderStatus> {
        warmUp()
        return parser.providerStatus(runtime.providerStatus(), ::currentApiLevel)
    }

    override fun autofillList(origin: String, domain: String): BridgeResult<Pair<String, List<AutofillCandidate>>> {
        warmUp()
        return parser.autofillList(runtime.autofillList(origin, domain))
    }

    override fun autofillGetSecret(
        sessionId: String,
        credentialId: String,
        otpId: String?,
    ): BridgeResult<AutofillSecret> {
        warmUp()
        return parser.autofillSecret(runtime.autofillGetSecret(sessionId, credentialId, otpId.orEmpty()))
    }

    override fun passwordList(origin: String, domain: String): BridgeResult<Pair<String, List<PasswordCandidate>>> {
        return when (val result = autofillList(origin, domain)) {
            is BridgeResult.Failure -> result
            is BridgeResult.Success -> {
                BridgeResult.Success(
                    result.value.first to result.value.second.map { candidate ->
                        PasswordCandidate(
                            credentialId = candidate.credentialId,
                            username = candidate.username,
                            label = candidate.label,
                            domain = candidate.domain,
                        )
                    },
                )
            }
        }
    }

    override fun passwordGetSecret(sessionId: String, credentialId: String): BridgeResult<PasswordSecret> {
        return when (val result = autofillGetSecret(sessionId, credentialId, null)) {
            is BridgeResult.Failure -> result
            is BridgeResult.Success -> {
                val password = result.value.password?.takeIf { it.isNotBlank() }
                    ?: return BridgeResult.Failure(BridgeError("INTERNAL", "ChromVoid password credential is incomplete."))
                BridgeResult.Success(
                    PasswordSecret(
                        username = result.value.username,
                        password = password,
                    ),
                )
            }
        }
    }

    override fun passwordSaveStart(payload: PasswordSaveReviewRequest): BridgeResult<String> {
        warmUp()
        return parser.passwordSaveToken(
            raw = runtime.passwordSaveStart(BridgePayloadJsonCodec.encodePasswordSaveStart(payload)),
            fallbackMessage = "ChromVoid could not prepare the password save flow.",
        )
    }

    override fun passwordSaveRequest(token: String): BridgeResult<PasswordSaveReviewRequest> {
        warmUp()
        return parser.passwordSaveRequest(runtime.passwordSaveRequest(token))
    }

    override fun passwordSaveMarkLaunched(token: String): BridgeResult<Boolean> {
        warmUp()
        return parser.marked(runtime.passwordSaveMarkLaunched(token))
    }

    override fun passkeyPreflight(
        command: String,
        payload: com.chromvoid.app.passkey.PasskeyPreflightPayload,
    ): BridgeResult<String> {
        warmUp()
        return parser.passkeyRequestId(
            runtime.passkeyPreflight(command, BridgePayloadJsonCodec.encodePasskeyPreflight(payload)),
        )
    }
}
