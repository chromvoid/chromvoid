package com.chromvoid.app.passkey

import org.json.JSONObject
import java.security.MessageDigest

internal object PasskeyClientDataJsonEncoder {
    private val PLACEHOLDER_JSON = "{}".toByteArray(Charsets.UTF_8)

    fun encode(
        type: String,
        challengeB64Url: String,
        origin: String,
    ): ByteArray {
        return PasskeyClientDataPayload(
            type = type,
            challenge = challengeB64Url,
            origin = origin,
        ).toJson()
            .toString()
            .toByteArray(Charsets.UTF_8)
    }

    fun responseJson(
        type: String,
        challengeB64Url: String,
        origin: String,
        providedHash: ByteArray?,
    ): ByteArray {
        return if (providedHash != null) {
            PLACEHOLDER_JSON
        } else {
            encode(type, challengeB64Url, origin)
        }
    }

    fun hash(
        clientDataJson: ByteArray,
        providedHash: ByteArray?,
    ): ByteArray {
        return providedHash ?: MessageDigest.getInstance("SHA-256").digest(clientDataJson)
    }
}

private data class PasskeyClientDataPayload(
    val type: String,
    val challenge: String,
    val origin: String,
    val crossOrigin: Boolean = false,
)

private fun PasskeyClientDataPayload.toJson(): JSONObject {
    return JSONObject()
        .put("type", type)
        .put("challenge", challenge)
        .put("origin", origin)
        .put("crossOrigin", crossOrigin)
}
