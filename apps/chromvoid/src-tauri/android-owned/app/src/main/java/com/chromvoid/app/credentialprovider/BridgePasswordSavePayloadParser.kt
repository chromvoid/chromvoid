package com.chromvoid.app.credentialprovider

import org.json.JSONObject

internal class BridgePasswordSavePayloadParser(
    private val envelopeParser: BridgeEnvelopeParser,
) {
    fun parseToken(
        response: JSONObject,
        fallbackMessage: String,
    ): BridgeResult<String> {
        if (!response.optBoolean("ok")) {
            return BridgeResult.Failure(envelopeParser.parseError(response, fallbackMessage))
        }
        val token = response.optString("token")
        return if (token.isBlank()) {
            BridgeResult.Failure(BridgeError("INTERNAL", "ChromVoid did not return a password save token."))
        } else {
            BridgeResult.Success(token)
        }
    }

    fun parseRequest(response: JSONObject): BridgeResult<PasswordSaveReviewRequest> {
        if (!response.optBoolean("ok")) {
            return BridgeResult.Failure(
                envelopeParser.parseError(response, "ChromVoid could not resolve the password save request."),
            )
        }
        val result = response.optJSONObject("result")
            ?: return BridgeResult.Failure(BridgeError("INTERNAL", "ChromVoid returned an empty password save payload."))
        return BridgeResult.Success(
            PasswordSaveReviewRequest(
                title = result.optString("title"),
                username = result.optString("username"),
                password = result.optString("password"),
                urls = result.optString("urls"),
            ),
        )
    }

    fun parseMarked(response: JSONObject): BridgeResult<Boolean> {
        if (!response.optBoolean("ok")) {
            return BridgeResult.Failure(
                envelopeParser.parseError(response, "ChromVoid could not mark the password save flow as launched."),
            )
        }
        return BridgeResult.Success(response.optBoolean("marked"))
    }
}
