package com.chromvoid.app.credentialprovider

import com.chromvoid.app.AndroidPasskeySummary
import com.chromvoid.app.PasskeyCoreOperationResult
import com.chromvoid.app.PasskeyCoreQueryResult
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

    fun parseQuery(response: JSONObject): BridgeResult<PasskeyCoreQueryResult> {
        if (!response.optBoolean("ok")) {
            return BridgeResult.Failure(envelopeParser.parseError(response, "ChromVoid passkey query failed."))
        }
        val requestId = response.optString("request_id")
        if (requestId.isBlank()) {
            return BridgeResult.Failure(BridgeError("INTERNAL", "ChromVoid did not receive a passkey request handle."))
        }
        val passkeys = mutableListOf<AndroidPasskeySummary>()
        val array = response.optJSONArray("passkeys")
        for (index in 0 until (array?.length() ?: 0)) {
            val item = array?.optJSONObject(index) ?: continue
            val credentialId = item.optString("credentialIdB64Url")
            val rpId = item.optString("rpId")
            if (credentialId.isBlank() || rpId.isBlank()) {
                continue
            }
            passkeys += AndroidPasskeySummary(
                credentialIdB64Url = credentialId,
                rpId = rpId,
                userName = item.optString("userName"),
                userDisplayName = item.optString("userDisplayName"),
                signCount = item.optLong("signCount", 0L),
                createdAtEpochMs = item.optLong("createdAtEpochMs", 0L),
                lastUsedEpochMs = item.optLong("lastUsedEpochMs", 0L),
            )
        }
        return BridgeResult.Success(PasskeyCoreQueryResult(requestId, passkeys))
    }

    fun parseOperation(response: JSONObject, fallbackMessage: String): BridgeResult<PasskeyCoreOperationResult> {
        if (!response.optBoolean("ok")) {
            return BridgeResult.Failure(envelopeParser.parseError(response, fallbackMessage))
        }
        val responseJson = response.optString("response_json")
        if (responseJson.isBlank()) {
            return BridgeResult.Failure(BridgeError("INTERNAL", fallbackMessage))
        }
        return BridgeResult.Success(
            PasskeyCoreOperationResult(
                credentialIdB64Url = response.optString("credential_id"),
                responseJson = responseJson,
            ),
        )
    }
}
