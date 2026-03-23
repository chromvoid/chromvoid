package com.chromvoid.app.credentialprovider

import com.chromvoid.app.passkey.CreatePasskeyPreflightPayload
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BridgePayloadJsonCodecTest {
    @Test
    fun encodePasswordSaveStart_wrapsPayloadWithContractVersion() {
        val encoded =
            JSONObject(
                BridgePayloadJsonCodec.encodePasswordSaveStart(
                    PasswordSaveReviewRequest(
                        title = "github.com",
                        username = "alice@example.com",
                        password = "pw-123",
                        urls = "https://github.com/login",
                    ),
                ),
            )

        assertEquals(BridgeContractVersion.CURRENT, encoded.getInt(BridgeContractVersion.VERSION_FIELD))
        assertEquals(
            "github.com",
            encoded.getJSONObject(BridgeContractVersion.PAYLOAD_FIELD).getString("title"),
        )
    }

    @Test
    fun encodePasskeyPreflight_wrapsPayloadWithContractVersion() {
        val encoded =
            JSONObject(
                BridgePayloadJsonCodec.encodePasskeyPreflight(
                    CreatePasskeyPreflightPayload(
                        requestJson = "{\"challenge\":\"abc\"}",
                        rpId = "example.com",
                        supportedAlgorithms = listOf(-7),
                        excludeCredentials = listOf("cred-1"),
                    ),
                ),
            )

        assertEquals(BridgeContractVersion.CURRENT, encoded.getInt(BridgeContractVersion.VERSION_FIELD))
        assertEquals(
            "example.com",
            encoded.getJSONObject(BridgeContractVersion.PAYLOAD_FIELD).getString("rp_id"),
        )
    }
}
