package com.chromvoid.app

import android.content.pm.SigningInfo
import android.os.Bundle
import androidx.credentials.provider.BeginCreatePublicKeyCredentialRequest
import androidx.credentials.provider.BeginGetPublicKeyCredentialOption
import androidx.credentials.provider.CallingAppInfo
import com.chromvoid.app.passkey.PasskeyOriginResolver
import com.chromvoid.app.passkey.PasskeyPreflightPayloadFactory
import com.chromvoid.app.passkey.PasskeyPreflightPayloadJsonEncoder
import com.chromvoid.app.passkey.PasskeyRequestParser
import com.chromvoid.app.passkey.PasskeyResponseAssembler
import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PasskeyComponentsTest {
    @Test
    fun buildGetPreflightPayload_keepsQueryStageFields() {
        val option =
            BeginGetPublicKeyCredentialOption(
                Bundle(),
                "option-1",
                GET_REQUEST_JSON,
                byteArrayOf(0x01, 0x02, 0x03),
            )

        val payload =
            JSONObject(
                PasskeyPreflightPayloadJsonEncoder.encode(
                    PasskeyPreflightPayloadFactory.buildGet(option),
                ),
            )

        assertEquals(GET_REQUEST_JSON, payload.getString("request_json"))
        assertEquals("AQID", payload.getString("client_data_hash"))
        assertEquals("example.com", payload.getString("rp_id"))
        assertEquals("option-1", payload.getString("option_id"))
        val allowCredentials = payload.getJSONArray("allow_credentials")
        assertEquals(2, allowCredentials.length())
        assertEquals("cred-a", allowCredentials.getString(0))
        assertEquals("cred-b", allowCredentials.getString(1))
    }

    @Test
    fun buildCreatePreflightPayload_keepsAlgorithmsAndExcludeList() {
        val request =
            BeginCreatePublicKeyCredentialRequest(
                CREATE_REQUEST_JSON,
                callingAppInfo(origin = "https://app.example"),
                Bundle(),
                byteArrayOf(0x0A, 0x0B),
            )

        val payload =
            JSONObject(
                PasskeyPreflightPayloadJsonEncoder.encode(
                    PasskeyPreflightPayloadFactory.buildCreate(request),
                ),
            )

        assertEquals(CREATE_REQUEST_JSON, payload.getString("request_json"))
        assertEquals("example.com", payload.getString("rp_id"))
        val algorithms = payload.getJSONArray("supported_algorithms")
        assertEquals(2, algorithms.length())
        assertEquals(-7, algorithms.getInt(0))
        assertEquals(-257, algorithms.getInt(1))
        val excluded = payload.getJSONArray("exclude_credentials")
        assertEquals(1, excluded.length())
        assertEquals("cred-x", excluded.getString(0))
    }

    @Test
    fun originForCallingApp_prefersPopulatedOrigin() {
        val origin = PasskeyOriginResolver.originForCallingApp(callingAppInfo(origin = "https://app.example"))

        assertEquals("https://app.example", origin)
    }

    @Test
    fun originForCallingApp_fallsBackToApkKeyHashWhenOriginMissing() {
        val origin = PasskeyOriginResolver.originForCallingApp(callingAppInfo(origin = null))

        assertEquals("android:apk-key-hash:unknown", origin)
    }

    @Test
    fun clientDataHash_usesProvidedHashWhenPresent() {
        val clientDataJson = PasskeyResponseAssembler.clientDataJson("webauthn.get", "challenge-b64", "https://app.example")
        val provided = byteArrayOf(0x09, 0x08, 0x07)

        val actual = PasskeyResponseAssembler.clientDataHash(clientDataJson, provided)

        assertArrayEquals(provided, actual)
    }

    @Test
    fun clientDataHash_hashesClientDataWhenHashMissing() {
        val clientDataJson = PasskeyResponseAssembler.clientDataJson("webauthn.get", "challenge-b64", "https://app.example")

        val actual = PasskeyResponseAssembler.clientDataHash(clientDataJson, null)

        assertEquals(32, actual.size)
    }

    @Test
    fun parseGetRequestJson_returnsNullWhenRequiredFieldsMissing() {
        assertNull(PasskeyRequestParser.parseGetRequestJson("""{"challenge":"challenge-b64"}"""))
        assertNull(PasskeyRequestParser.parseGetRequestJson("""{"rpId":"example.com"}"""))
    }

    @Test
    fun parseCreateRequestJson_returnsNullWhenRequiredFieldsMissing() {
        assertNull(PasskeyRequestParser.parseCreateRequestJson("""{"challenge":"challenge-b64"}"""))
        assertNull(
            PasskeyRequestParser.parseCreateRequestJson(
                """{"challenge":"challenge-b64","rp":{"id":"example.com"},"user":{"name":"alice","displayName":"Alice"},"pubKeyCredParams":[{"type":"public-key","alg":-7}]}""",
            ),
        )
    }

    @Test
    fun supportsEs256_requiresMinus7Algorithm() {
        val supported =
            PasskeyRequestParser.parseCreateRequestJson(CREATE_REQUEST_JSON)
                ?: error("valid create request must parse")
        val unsupported =
            PasskeyRequestParser.parseCreateRequestJson(
                """{"challenge":"challenge-b64","rp":{"id":"example.com","name":"Example"},"user":{"id":"user-b64","name":"alice","displayName":"Alice"},"pubKeyCredParams":[{"type":"public-key","alg":-257}],"excludeCredentials":[],"attestation":"none"}""",
            ) ?: error("valid create request must parse")

        assertTrue(PasskeyResponseAssembler.supportsEs256(supported))
        assertFalse(PasskeyResponseAssembler.supportsEs256(unsupported))
    }

    @Test
    fun supportsAttestationNone_rejectsEnterprisePreference() {
        val supported =
            PasskeyRequestParser.parseCreateRequestJson(CREATE_REQUEST_JSON)
                ?: error("valid create request must parse")
        val unsupported =
            PasskeyRequestParser.parseCreateRequestJson(
                """{"challenge":"challenge-b64","rp":{"id":"example.com","name":"Example"},"user":{"id":"user-b64","name":"alice","displayName":"Alice"},"pubKeyCredParams":[{"type":"public-key","alg":-7}],"excludeCredentials":[],"attestation":"enterprise"}""",
            ) ?: error("valid create request must parse")

        assertTrue(PasskeyResponseAssembler.supportsAttestationNone(supported))
        assertFalse(PasskeyResponseAssembler.supportsAttestationNone(unsupported))
    }

    @Test
    fun assertionResponseJson_keepsCredentialAndSignatureFields() {
        val response =
            JSONObject(
                PasskeyResponseAssembler.assertionResponseJson(
                    credentialId = byteArrayOf(0x01, 0x02),
                    userId = byteArrayOf(0x03, 0x04),
                    clientDataJson = byteArrayOf(0x05),
                    authenticatorData = byteArrayOf(0x06),
                    signature = byteArrayOf(0x07),
                ),
            )

        assertEquals("AQI", response.getString("id"))
        assertEquals("public-key", response.getString("type"))
        assertTrue(response.getJSONObject("response").has("signature"))
        assertTrue(response.getJSONObject("response").has("userHandle"))
    }

    private fun callingAppInfo(origin: String?): CallingAppInfo {
        val signingInfo = SigningInfo()
        return if (origin == null) {
            CallingAppInfo("com.chromvoid.test", signingInfo)
        } else {
            CallingAppInfo("com.chromvoid.test", signingInfo, origin)
        }
    }

    companion object {
        private const val GET_REQUEST_JSON =
            """{"challenge":"challenge-b64","rpId":"example.com","allowCredentials":[{"id":"cred-a"},{"id":"cred-b"}]}"""
        private const val CREATE_REQUEST_JSON =
            """{"challenge":"challenge-b64","rp":{"id":"example.com","name":"Example"},"user":{"id":"user-b64","name":"alice","displayName":"Alice"},"pubKeyCredParams":[{"type":"public-key","alg":-7},{"type":"public-key","alg":-257}],"excludeCredentials":[{"id":"cred-x"}],"attestation":"none"}"""
    }
}
