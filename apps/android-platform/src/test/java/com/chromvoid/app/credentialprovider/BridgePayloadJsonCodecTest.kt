package com.chromvoid.app.credentialprovider

import com.chromvoid.app.PasskeyCoreRequestPayload
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

    @Test
    fun encodePasskeyCoreRequest_includesTrustedContext() {
        val encoded =
            JSONObject(
                BridgePayloadJsonCodec.encodePasskeyCoreRequest(
                    PasskeyCoreRequestPayload(
                        requestJson = """{"challenge":"abc","rpId":"example.com"}""",
                        origin = "https://example.com",
                        clientDataHashB64Url = "hash-b64",
                        selectedCredentialId = "cred-1",
                        userVerified = true,
                    ),
                ),
            )

        val payload = encoded.getJSONObject(BridgeContractVersion.PAYLOAD_FIELD)
        assertEquals("https://example.com", payload.getString("origin"))
        assertEquals("hash-b64", payload.getString("client_data_hash"))
        assertEquals("cred-1", payload.getString("selected_credential_id"))
        assertEquals(true, payload.getBoolean("user_verified"))
    }
}
