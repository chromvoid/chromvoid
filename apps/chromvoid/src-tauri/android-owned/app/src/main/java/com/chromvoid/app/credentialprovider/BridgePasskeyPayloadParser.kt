package com.chromvoid.app.credentialprovider

import org.json.JSONObject

internal class BridgePasskeyPayloadParser(
    private val envelopeParser: BridgeEnvelopeParser,
) {
    fun parseRequestId(response: JSONObject): BridgeResult<String> {
        if (!response.optBoolean("ok")) {
            return BridgeResult.Failure(envelopeParser.parseError(response, "ChromVoid passkey preflight failed."))
        }
        val requestId = response.optString("request_id")
        return if (requestId.isBlank()) {
            BridgeResult.Failure(BridgeError("INTERNAL", "ChromVoid did not receive a passkey request handle."))
        } else {
            BridgeResult.Success(requestId)
        }
    }
}
