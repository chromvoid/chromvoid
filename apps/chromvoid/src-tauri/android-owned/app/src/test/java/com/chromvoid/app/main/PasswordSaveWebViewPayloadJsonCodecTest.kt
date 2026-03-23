package com.chromvoid.app.main

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PasswordSaveWebViewPayloadJsonCodecTest {
    @Test
    fun encode_keepsExpectedFields() {
        val encoded =
            PasswordSaveWebViewPayloadJsonCodec.encode(
                PasswordSaveWebViewPayload(
                    token = "token-1",
                    title = "github.com",
                    username = "alice@example.com",
                    password = "pw-123",
                    urls = "https://github.com/login",
                ),
            )

        val payload = JSONObject(encoded)
        assertEquals("token-1", payload.getString("token"))
        assertEquals("github.com", payload.getString("title"))
        assertEquals("alice@example.com", payload.getString("username"))
        assertEquals("pw-123", payload.getString("password"))
        assertEquals("https://github.com/login", payload.getString("urls"))
    }
}
