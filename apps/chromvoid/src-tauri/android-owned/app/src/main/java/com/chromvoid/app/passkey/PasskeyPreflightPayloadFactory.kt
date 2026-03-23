package com.chromvoid.app.passkey

import androidx.credentials.provider.BeginCreatePublicKeyCredentialRequest
import androidx.credentials.provider.BeginGetPublicKeyCredentialOption
import org.json.JSONArray
import org.json.JSONObject

internal sealed interface PasskeyPreflightPayload

internal data class GetPasskeyPreflightPayload(
    val requestJson: String,
    val clientDataHashB64Url: String?,
    val rpId: String,
    val allowCredentials: List<String>,
    val optionId: String,
) : PasskeyPreflightPayload

internal data class CreatePasskeyPreflightPayload(
    val requestJson: String,
    val rpId: String,
    val supportedAlgorithms: List<Int>,
    val excludeCredentials: List<String>,
) : PasskeyPreflightPayload

internal object EmptyPasskeyPreflightPayload : PasskeyPreflightPayload

internal object PasskeyPreflightPayloadFactory {
    fun buildGet(option: BeginGetPublicKeyCredentialOption): GetPasskeyPreflightPayload {
        val parsed = PasskeyRequestParser.parseGetRequestJson(option.requestJson)
        return GetPasskeyPreflightPayload(
            requestJson = option.requestJson,
            clientDataHashB64Url = option.clientDataHash?.let(PasskeyEncoding::base64UrlEncode),
            rpId = parsed?.rpId.orEmpty(),
            allowCredentials = parsed?.allowCredentialIds?.toList().orEmpty(),
            optionId = option.id,
        )
    }

    fun buildCreate(request: BeginCreatePublicKeyCredentialRequest): CreatePasskeyPreflightPayload {
        val parsed = PasskeyRequestParser.parseCreateRequestJson(request.requestJson)
        return CreatePasskeyPreflightPayload(
            requestJson = request.requestJson,
            rpId = parsed?.rpId.orEmpty(),
            supportedAlgorithms = parsed?.supportedAlgorithms?.toList().orEmpty(),
            excludeCredentials = parsed?.excludeCredentialIds?.toList().orEmpty(),
        )
    }
}

internal object PasskeyPreflightPayloadJsonEncoder {
    fun encode(payload: PasskeyPreflightPayload): String {
        return when (payload) {
            EmptyPasskeyPreflightPayload -> JSONObject().toString()
            is GetPasskeyPreflightPayload ->
                JSONObject()
                    .put("request_json", payload.requestJson)
                    .put("client_data_hash", payload.clientDataHashB64Url)
                    .put("rp_id", payload.rpId)
                    .put("allow_credentials", JSONArray(payload.allowCredentials))
                    .put("option_id", payload.optionId)
                    .toString()
            is CreatePasskeyPreflightPayload ->
                JSONObject()
                    .put("request_json", payload.requestJson)
                    .put("rp_id", payload.rpId)
                    .put("supported_algorithms", JSONArray(payload.supportedAlgorithms))
                    .put("exclude_credentials", JSONArray(payload.excludeCredentials))
                    .toString()
        }
    }
}
