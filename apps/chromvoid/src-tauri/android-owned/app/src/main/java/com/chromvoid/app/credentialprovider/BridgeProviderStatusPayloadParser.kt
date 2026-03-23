package com.chromvoid.app.credentialprovider

import org.json.JSONObject

internal class BridgeProviderStatusPayloadParser(
    private val envelopeParser: BridgeEnvelopeParser,
) {
    fun parse(
        response: JSONObject,
        currentApiLevel: () -> Int,
    ): BridgeResult<ProviderStatus> {
        val result = response.optJSONObject("result")
        if (!response.optBoolean("ok") || result == null) {
            return BridgeResult.Failure(envelopeParser.parseError(response, "Provider status unavailable."))
        }
        return BridgeResult.Success(
            ProviderStatus(
                runtimeReady = result.optBoolean("runtime_ready"),
                enabled = result.optBoolean("enabled"),
                vaultOpen = result.optBoolean("vault_open"),
                apiLevel = result.optInt("api_level", currentApiLevel()),
                passwordProviderState = result.optString("password_provider").ifBlank { null },
                passkeysLiteState = result.optString("passkeys_lite").ifBlank { null },
                autofillFallbackState = result.optString("autofill_fallback").ifBlank { null },
                unsupportedReason = result.optString("unsupported_reason").ifBlank { null },
            ),
        )
    }
}
