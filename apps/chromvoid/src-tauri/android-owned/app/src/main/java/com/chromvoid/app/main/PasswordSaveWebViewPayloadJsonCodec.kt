package com.chromvoid.app.main

import org.json.JSONObject

internal data class PasswordSaveWebViewPayload(
    val token: String,
    val title: String,
    val username: String,
    val password: String,
    val urls: String,
)

internal object PasswordSaveWebViewPayloadJsonCodec {
    fun encode(payload: PasswordSaveWebViewPayload): String {
        return JSONObject()
            .put("token", payload.token)
            .put("title", payload.title)
            .put("username", payload.username)
            .put("password", payload.password)
            .put("urls", payload.urls)
            .toString()
    }

    fun encodeJsStringLiteral(payload: PasswordSaveWebViewPayload): String {
        return JSONObject.quote(encode(payload))
    }
}
