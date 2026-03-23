package com.chromvoid.app.credentialprovider

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BridgePayloadParserTest {
    private val parser = BridgePayloadParser()

    @Test
    fun passkeyRequestId_prefersDegradedErrorPayload() {
        val result =
            parser.passkeyRequestId(
                envelope(
                    """
                    {
                      "ok": false,
                      "degraded": {
                        "code": "VAULT_REQUIRED",
                        "message": "Unlock vault"
                      }
                    }
                    """.trimIndent(),
                ),
            )

        assertTrue(result is BridgeResult.Failure)
        val failure = result as BridgeResult.Failure
        assertEquals("VAULT_REQUIRED", failure.error.code)
        assertEquals("Unlock vault", failure.error.message)
    }

    @Test
    fun autofillList_parsesCandidatesAndOtpOptions() {
        val result =
            parser.autofillList(
                envelope(
                    """
                    {
                      "ok": true,
                      "session_id": "sess-1",
                      "candidates": [
                        {
                          "credential_id": "cred-1",
                          "username": "alice@example.com",
                          "label": "GitHub",
                          "domain": "github.com",
                          "otp_options": [
                            {"id": "otp-1", "label": "Main", "type": "totp"}
                          ]
                        }
                      ]
                    }
                    """.trimIndent(),
                ),
            )

        assertTrue(result is BridgeResult.Success)
        val success = result as BridgeResult.Success
        assertEquals("sess-1", success.value.first)
        assertEquals("cred-1", success.value.second.single().credentialId)
        assertEquals("TOTP", success.value.second.single().otpOptions.single().otpType)
    }

    @Test
    fun passwordSaveRequest_returnsTypedPayload() {
        val result =
            parser.passwordSaveRequest(
                envelope(
                    """
                    {
                      "ok": true,
                      "result": {
                        "title": "github.com",
                        "username": "alice@example.com",
                        "password": "pw-123",
                        "urls": "https://github.com/login"
                      }
                    }
                    """.trimIndent(),
                ),
            )

        assertTrue(result is BridgeResult.Success)
        val success = result as BridgeResult.Success
        assertEquals("github.com", success.value.title)
        assertEquals("alice@example.com", success.value.username)
        assertEquals("pw-123", success.value.password)
    }

    @Test
    fun providerStatus_rejectsUnsupportedContractVersion() {
        val result =
            parser.providerStatus(
                """
                {
                  "contract_version": 999,
                  "payload": {
                    "ok": true,
                    "result": {
                      "runtime_ready": true,
                      "enabled": true,
                      "vault_open": true
                    }
                  }
                }
                """.trimIndent(),
            ) { 34 }

        assertTrue(result is BridgeResult.Failure)
        val failure = result as BridgeResult.Failure
        assertEquals("CONTRACT_MISMATCH", failure.error.code)
    }

    private fun envelope(payload: String): String {
        return """
            {
              "contract_version": ${BridgeContractVersion.CURRENT},
              "payload": $payload
            }
        """.trimIndent()
    }
}
