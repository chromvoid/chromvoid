package com.chromvoid.app.credentialprovider

import com.chromvoid.app.passkey.PasskeyPreflightPayload
import com.chromvoid.app.passkey.PasskeyPreflightPayloadJsonEncoder
import org.json.JSONObject

internal object BridgePayloadJsonCodec {
    fun encodePasswordSaveStart(payload: PasswordSaveReviewRequest): String {
        return encodeEnvelope(
            JSONObject()
                .put("title", payload.title)
                .put("username", payload.username)
                .put("password", payload.password)
                .put("urls", payload.urls),
        )
    }

    fun encodePasskeyPreflight(payload: PasskeyPreflightPayload): String {
        return encodeEnvelope(JSONObject(PasskeyPreflightPayloadJsonEncoder.encode(payload)))
    }

    private fun encodeEnvelope(payload: JSONObject): String {
        return JSONObject()
            .put(BridgeContractVersion.VERSION_FIELD, BridgeContractVersion.CURRENT)
            .put(BridgeContractVersion.PAYLOAD_FIELD, payload)
            .toString()
    }
}
