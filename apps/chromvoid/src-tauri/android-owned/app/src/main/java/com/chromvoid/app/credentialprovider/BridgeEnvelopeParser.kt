package com.chromvoid.app.credentialprovider

import org.json.JSONObject

internal class BridgeEnvelopeParser {
    fun parse(
        raw: String,
        fallbackMessage: String,
    ): BridgeResult<JSONObject> {
        val envelope =
            runCatching { JSONObject(raw) }.getOrElse {
                return BridgeResult.Failure(BridgeError("INTERNAL", fallbackMessage))
            }
        val contractVersion = envelope.optInt(BridgeContractVersion.VERSION_FIELD, -1)
        if (contractVersion != BridgeContractVersion.CURRENT) {
            return BridgeResult.Failure(
                BridgeError(
                    BridgeContractVersion.MISMATCH_ERROR_CODE,
                    "Unsupported Android bridge contract version: $contractVersion",
                ),
            )
        }
        val payload = envelope.optJSONObject(BridgeContractVersion.PAYLOAD_FIELD)
            ?: return BridgeResult.Failure(BridgeError("INTERNAL", "ChromVoid returned an empty bridge payload."))
        return BridgeResult.Success(payload)
    }

    fun parseError(
        response: JSONObject,
        fallbackMessage: String,
    ): BridgeError {
        val degraded = response.optJSONObject("degraded")
        val code =
            degraded?.optString("code")?.takeIf { it.isNotBlank() }
                ?: response.optString("code").takeIf { it.isNotBlank() }
                ?: "INTERNAL"
        val message =
            degraded?.optString("message")?.takeIf { it.isNotBlank() }
                ?: response.optString("message").takeIf { it.isNotBlank() }
                ?: fallbackMessage
        return BridgeError(code = code, message = message)
    }
}
