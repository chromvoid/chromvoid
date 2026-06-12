package com.chromvoid.app

import android.content.pm.SigningInfo
import android.os.Bundle
import androidx.credentials.provider.BeginCreatePublicKeyCredentialRequest
import androidx.credentials.provider.BeginGetPublicKeyCredentialOption
import androidx.credentials.provider.CallingAppInfo
import com.chromvoid.app.passkey.PasskeyAuthenticatorDataBuilder
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
    fun createRequestParser_defaultsMissingRpIdFromFallback() {
        val request =
            PasskeyRequestParser.parseCreateRequestJson(
                CREATE_REQUEST_JSON_WITHOUT_RP_ID,
                rpIdFallback = "app.example",
            ) ?: error("valid create request must parse with fallback rp id")

        assertEquals("app.example", request.rpId)
    }

    @Test
    fun defaultRpIdForCreate_returnsHostForTrustedWebOrigin() {
        val rpId =
            PasskeyOriginResolver.defaultRpIdForCreate(
                callingAppInfo(packageName = "com.android.chrome", origin = "https://App.Example:443/path"),
                privilegedOriginReader = { _, _ -> "https://App.Example:443/path" },
            )

        assertEquals("app.example", rpId)
    }

    @Test
    fun defaultRpIdForCreate_returnsNullForUnknownApkOrigin() {
        assertNull(PasskeyOriginResolver.defaultRpIdForCreate(callingAppInfo(origin = null)))
    }

    @Test
    fun originForCallingApp_returnsAllowlistedBrowserOrigin() {
        val origin =
            PasskeyOriginResolver.originForCallingApp(
                callingAppInfo(packageName = "com.android.chrome", origin = "https://app.example"),
                privilegedOriginReader = { _, allowlist ->
                    assertTrue(allowlist.contains("com.android.chrome"))
                    assertTrue(allowlist.contains("org.mozilla.firefox"))
                    "https://app.example"
                },
            )

        assertEquals("https://app.example", origin)
    }

    @Test
    fun originForCallingApp_normalizesAllowlistedBrowserOrigin() {
        val origin =
            PasskeyOriginResolver.originForCallingApp(
                callingAppInfo(packageName = "com.android.chrome", origin = "https://github.com/"),
                privilegedOriginReader = { _, _ -> "https://github.com/" },
            )

        assertEquals("https://github.com", origin)
    }

    @Test
    fun originForCallingApp_doesNotTrustBrowserOriginOutsideAllowlist() {
        val origin =
            PasskeyOriginResolver.originForCallingApp(
                callingAppInfo(packageName = "com.android.chrome", origin = "https://app.example"),
                privilegedOriginReader = { _, _ -> throw IllegalStateException("not allowlisted") },
            )

        assertTrue(origin.startsWith("android:apk-key-hash:"))
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
    fun responseClientDataJson_usesPlaceholderWhenHashProvided() {
        val actual =
            PasskeyResponseAssembler.responseClientDataJson(
                "webauthn.create",
                "challenge-b64",
                "https://app.example",
                byteArrayOf(0x01),
            )

        assertEquals("{}", actual.toString(Charsets.UTF_8))
    }

    @Test
    fun responseClientDataJson_assemblesJsonWhenHashMissing() {
        val actual =
            PasskeyResponseAssembler.responseClientDataJson(
                "webauthn.create",
                "challenge-b64",
                "https://app.example",
                null,
            )

        val json = JSONObject(actual.toString(Charsets.UTF_8))
        assertEquals("webauthn.create", json.getString("type"))
        assertEquals("challenge-b64", json.getString("challenge"))
        assertEquals("https://app.example", json.getString("origin"))
    }

    @Test
    fun parseGetRequestJson_returnsNullWhenRequiredFieldsMissing() {
        assertNull(PasskeyRequestParser.parseGetRequestJson("""{"challenge":"challenge-b64"}"""))
        assertNull(PasskeyRequestParser.parseGetRequestJson("""{"rpId":"example.com"}"""))
    }

    @Test
    fun parseCreateRequestJson_returnsNullWhenRequiredFieldsMissing() {
        assertNull(PasskeyRequestParser.parseCreateRequestJson("""{"challenge":"challenge-b64"}"""))
        assertNull(PasskeyRequestParser.parseCreateRequestJson(CREATE_REQUEST_JSON_WITHOUT_RP_ID))
        assertNull(
            PasskeyRequestParser.parseCreateRequestJson(
                """{"challenge":"challenge-b64","rp":{"id":"example.com"},"user":{"name":"alice","displayName":"Alice"},"pubKeyCredParams":[{"type":"public-key","alg":-7}]}""",
            ),
        )
    }

    @Test
    fun parseCreateRequestJson_keepsCredentialPropertiesExtension() {
        val request =
            PasskeyRequestParser.parseCreateRequestJson(
                """{"challenge":"challenge-b64","rp":{"id":"example.com","name":"Example"},"user":{"id":"user-b64","name":"alice","displayName":"Alice"},"pubKeyCredParams":[{"type":"public-key","alg":-7}],"excludeCredentials":[],"attestation":"none","authenticatorSelection":{"residentKey":"required","userVerification":"required"},"extensions":{"credProps":true}}""",
            ) ?: error("valid create request must parse")

        assertTrue(request.credPropsRequested)
        assertTrue(request.residentKeyRequired)
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
    fun authenticatorDataAssertionFlags_encodeUserPresenceAndVerification() {
        val verified = PasskeyAuthenticatorDataBuilder.assertion(
            rpId = "example.com",
            signCount = 1,
            userVerified = true,
        )
        val unverified = PasskeyAuthenticatorDataBuilder.assertion(
            rpId = "example.com",
            signCount = 1,
            userVerified = false,
        )

        assertEquals(0x05, verified[32].toInt() and 0xff)
        assertEquals(0x01, unverified[32].toInt() and 0xff)
    }

    @Test
    fun authenticatorDataRegistrationFlags_encodeAttestedCredentialData() {
        val verified = PasskeyAuthenticatorDataBuilder.registration(
            rpId = "example.com",
            credentialId = byteArrayOf(0x01),
            cosePublicKey = byteArrayOf(0x02),
            userVerified = true,
        )
        val unverified = PasskeyAuthenticatorDataBuilder.registration(
            rpId = "example.com",
            credentialId = byteArrayOf(0x01),
            cosePublicKey = byteArrayOf(0x02),
            userVerified = false,
        )

        assertEquals(0x45, verified[32].toInt() and 0xff)
        assertEquals(0x41, unverified[32].toInt() and 0xff)
    }

    @Test
    fun authenticatorDataRegistration_encodesAttestedCredentialShape() {
        val credentialId = byteArrayOf(0x10, 0x11, 0x12)
        val cosePublicKey = byteArrayOf(0xA1.toByte(), 0x01, 0x02)

        val authData = PasskeyAuthenticatorDataBuilder.registration(
            rpId = "example.com",
            credentialId = credentialId,
            cosePublicKey = cosePublicKey,
            signCount = 9,
            userVerified = true,
        )

        assertEquals(0x45, authData[32].toInt() and 0xff)
        assertArrayEquals(byteArrayOf(0x00, 0x00, 0x00, 0x09), authData.copyOfRange(33, 37))
        assertArrayEquals(ByteArray(16), authData.copyOfRange(37, 53))
        assertArrayEquals(byteArrayOf(0x00, 0x03), authData.copyOfRange(53, 55))
        assertArrayEquals(credentialId, authData.copyOfRange(55, 58))
        assertArrayEquals(cosePublicKey, authData.copyOfRange(58, authData.size))
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
        assertTrue(response.has("clientExtensionResults"))
    }

    @Test
    fun registrationResponseJson_includesWebAuthnLevelThreeFieldsAndCredProps() {
        val response =
            JSONObject(
                PasskeyResponseAssembler.registrationResponseJson(
                    credentialId = byteArrayOf(0x01, 0x02),
                    clientDataJson = byteArrayOf(0x03),
                    attestationObject = byteArrayOf(0x04),
                    authenticatorData = byteArrayOf(0x05),
                    publicKeyDer = byteArrayOf(0x06),
                    credPropsRk = true,
                ),
            )

        assertEquals("AQI", response.getString("id"))
        assertEquals("public-key", response.getString("type"))
        assertTrue(response.getJSONObject("clientExtensionResults").getJSONObject("credProps").getBoolean("rk"))
        val registrationResponse = response.getJSONObject("response")
        assertEquals("BQ", registrationResponse.getString("authenticatorData"))
        assertEquals("Bg", registrationResponse.getString("publicKey"))
        assertEquals(-7, registrationResponse.getInt("publicKeyAlgorithm"))
        assertEquals("internal", registrationResponse.getJSONArray("transports").getString(0))
        assertTrue(registrationResponse.has("attestationObject"))
    }

    private fun callingAppInfo(
        origin: String?,
        packageName: String = "com.chromvoid.test",
    ): CallingAppInfo {
        val signingInfo = SigningInfo()
        return if (origin == null) {
            CallingAppInfo(packageName, signingInfo)
        } else {
            CallingAppInfo(packageName, signingInfo, origin)
        }
    }

    companion object {
        private const val GET_REQUEST_JSON =
            """{"challenge":"challenge-b64","rpId":"example.com","allowCredentials":[{"id":"cred-a"},{"id":"cred-b"}]}"""
        private const val CREATE_REQUEST_JSON =
            """{"challenge":"challenge-b64","rp":{"id":"example.com","name":"Example"},"user":{"id":"user-b64","name":"alice","displayName":"Alice"},"pubKeyCredParams":[{"type":"public-key","alg":-7},{"type":"public-key","alg":-257}],"excludeCredentials":[{"id":"cred-x"}],"attestation":"none"}"""
        private const val CREATE_REQUEST_JSON_WITHOUT_RP_ID =
            """{"challenge":"challenge-b64","rp":{"name":"Example"},"user":{"id":"user-b64","name":"alice","displayName":"Alice"},"pubKeyCredParams":[{"type":"public-key","alg":-7},{"type":"public-key","alg":-257}],"excludeCredentials":[{"id":"cred-x"}],"attestation":"none"}"""
    }
}
