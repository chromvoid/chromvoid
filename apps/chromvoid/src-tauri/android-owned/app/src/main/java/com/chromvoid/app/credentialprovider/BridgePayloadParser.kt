package com.chromvoid.app.credentialprovider

internal class BridgePayloadParser(
    private val envelopeParser: BridgeEnvelopeParser = BridgeEnvelopeParser(),
    private val providerStatusParser: BridgeProviderStatusPayloadParser = BridgeProviderStatusPayloadParser(envelopeParser),
    private val autofillPayloadParser: BridgeAutofillPayloadParser = BridgeAutofillPayloadParser(envelopeParser),
    private val passwordSavePayloadParser: BridgePasswordSavePayloadParser = BridgePasswordSavePayloadParser(envelopeParser),
    private val passkeyPayloadParser: BridgePasskeyPayloadParser = BridgePasskeyPayloadParser(envelopeParser),
) {
    fun providerStatus(
        raw: String,
        currentApiLevel: () -> Int,
    ): BridgeResult<ProviderStatus> {
        val response = when (val envelope = envelopeParser.parse(raw, "Provider status unavailable.")) {
            is BridgeResult.Failure -> return envelope
            is BridgeResult.Success -> envelope.value
        }
        return providerStatusParser.parse(response, currentApiLevel)
    }

    fun autofillList(raw: String): BridgeResult<Pair<String, List<AutofillCandidate>>> {
        val response = when (val envelope = envelopeParser.parse(raw, "ChromVoid AutoFill is temporarily unavailable.")) {
            is BridgeResult.Failure -> return envelope
            is BridgeResult.Success -> envelope.value
        }
        return autofillPayloadParser.parseList(response)
    }

    fun autofillSecret(raw: String): BridgeResult<AutofillSecret> {
        val response = when (val envelope = envelopeParser.parse(raw, "ChromVoid could not resolve the selected autofill secret.")) {
            is BridgeResult.Failure -> return envelope
            is BridgeResult.Success -> envelope.value
        }
        return autofillPayloadParser.parseSecret(response)
    }

    fun passwordSaveToken(
        raw: String,
        fallbackMessage: String,
    ): BridgeResult<String> {
        val response = when (val envelope = envelopeParser.parse(raw, fallbackMessage)) {
            is BridgeResult.Failure -> return envelope
            is BridgeResult.Success -> envelope.value
        }
        return passwordSavePayloadParser.parseToken(response, fallbackMessage)
    }

    fun passwordSaveRequest(raw: String): BridgeResult<PasswordSaveReviewRequest> {
        val response = when (val envelope = envelopeParser.parse(raw, "ChromVoid could not resolve the password save request.")) {
            is BridgeResult.Failure -> return envelope
            is BridgeResult.Success -> envelope.value
        }
        return passwordSavePayloadParser.parseRequest(response)
    }

    fun marked(raw: String): BridgeResult<Boolean> {
        val response = when (val envelope = envelopeParser.parse(raw, "ChromVoid could not mark the password save flow as launched.")) {
            is BridgeResult.Failure -> return envelope
            is BridgeResult.Success -> envelope.value
        }
        return passwordSavePayloadParser.parseMarked(response)
    }

    fun passkeyRequestId(raw: String): BridgeResult<String> {
        val response = when (val envelope = envelopeParser.parse(raw, "ChromVoid passkey preflight failed.")) {
            is BridgeResult.Failure -> return envelope
            is BridgeResult.Success -> envelope.value
        }
        return passkeyPayloadParser.parseRequestId(response)
    }
}
