package com.chromvoid.app.passkey

import org.json.JSONObject

internal object PasskeyCredentialJsonEncoder {
    fun registrationResponse(
        credentialId: ByteArray,
        clientDataJson: ByteArray,
        attestationObject: ByteArray,
    ): String {
        val credentialIdB64Url = PasskeyEncoding.base64UrlEncode(credentialId)
        return PasskeyPublicKeyCredentialPayload(
            id = credentialIdB64Url,
            rawId = credentialIdB64Url,
            response =
                RegistrationCredentialResponsePayload(
                    clientDataJson = PasskeyEncoding.base64UrlEncode(clientDataJson),
                    attestationObject = PasskeyEncoding.base64UrlEncode(attestationObject),
                ),
        ).toJson()
            .toString()
    }

    fun assertionResponse(
        credentialId: ByteArray,
        userId: ByteArray,
        clientDataJson: ByteArray,
        authenticatorData: ByteArray,
        signature: ByteArray,
    ): String {
        val credentialIdB64Url = PasskeyEncoding.base64UrlEncode(credentialId)
        return PasskeyPublicKeyCredentialPayload(
            id = credentialIdB64Url,
            rawId = credentialIdB64Url,
            response =
                AssertionCredentialResponsePayload(
                    clientDataJson = PasskeyEncoding.base64UrlEncode(clientDataJson),
                    authenticatorData = PasskeyEncoding.base64UrlEncode(authenticatorData),
                    signature = PasskeyEncoding.base64UrlEncode(signature),
                    userHandle = PasskeyEncoding.base64UrlEncode(userId),
                ),
        ).toJson()
            .toString()
    }
}

private data class PasskeyPublicKeyCredentialPayload(
    val id: String,
    val rawId: String,
    val type: String = "public-key",
    val authenticatorAttachment: String = "platform",
    val response: PasskeyCredentialResponsePayload,
)

private sealed interface PasskeyCredentialResponsePayload

private data class RegistrationCredentialResponsePayload(
    val clientDataJson: String,
    val attestationObject: String,
) : PasskeyCredentialResponsePayload

private data class AssertionCredentialResponsePayload(
    val clientDataJson: String,
    val authenticatorData: String,
    val signature: String,
    val userHandle: String,
) : PasskeyCredentialResponsePayload

private fun PasskeyPublicKeyCredentialPayload.toJson(): JSONObject {
    return JSONObject()
        .put("id", id)
        .put("rawId", rawId)
        .put("type", type)
        .put("authenticatorAttachment", authenticatorAttachment)
        .put("response", response.toJson())
}

private fun PasskeyCredentialResponsePayload.toJson(): JSONObject {
    return when (this) {
        is RegistrationCredentialResponsePayload ->
            JSONObject()
                .put("clientDataJSON", clientDataJson)
                .put("attestationObject", attestationObject)
        is AssertionCredentialResponsePayload ->
            JSONObject()
                .put("clientDataJSON", clientDataJson)
                .put("authenticatorData", authenticatorData)
                .put("signature", signature)
                .put("userHandle", userHandle)
    }
}
