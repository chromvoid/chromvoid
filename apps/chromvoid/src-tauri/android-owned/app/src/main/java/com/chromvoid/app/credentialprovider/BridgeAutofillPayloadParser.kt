package com.chromvoid.app.credentialprovider

import org.json.JSONArray
import org.json.JSONObject

internal class BridgeAutofillPayloadParser(
    private val envelopeParser: BridgeEnvelopeParser,
) {
    fun parseList(response: JSONObject): BridgeResult<Pair<String, List<AutofillCandidate>>> {
        if (!response.optBoolean("ok")) {
            return BridgeResult.Failure(
                envelopeParser.parseError(response, "ChromVoid AutoFill is temporarily unavailable."),
            )
        }
        return BridgeResult.Success(
            response.optString("session_id") to parseAutofillCandidates(response.optJSONArray("candidates")),
        )
    }

    fun parseSecret(response: JSONObject): BridgeResult<AutofillSecret> {
        if (!response.optBoolean("ok")) {
            return BridgeResult.Failure(
                envelopeParser.parseError(response, "ChromVoid could not resolve the selected autofill secret."),
            )
        }
        val result = response.optJSONObject("result")
            ?: return BridgeResult.Failure(BridgeError("INTERNAL", "ChromVoid returned an empty autofill result."))
        return BridgeResult.Success(
            AutofillSecret(
                username = result.optString("username").trim(),
                password = result.optString("password").takeIf { result.has("password") && !result.isNull("password") },
                otp = result.optString("otp").takeIf { result.has("otp") && !result.isNull("otp") }?.trim(),
            ),
        )
    }

    private fun parseAutofillCandidates(array: JSONArray?): List<AutofillCandidate> {
        return buildList {
            for (index in 0 until (array?.length() ?: 0)) {
                val item = array?.optJSONObject(index) ?: continue
                val credentialId = item.optString("credential_id").trim()
                if (credentialId.isBlank()) {
                    continue
                }
                add(
                    AutofillCandidate(
                        credentialId = credentialId,
                        username = item.optString("username").trim(),
                        label = item.optString("label").trim(),
                        domain =
                            item.optString("domain")
                                .trim()
                                .ifBlank { null },
                        otpOptions = parseOtpOptions(item.optJSONArray("otp_options")),
                    ),
                )
            }
        }
    }

    private fun parseOtpOptions(array: JSONArray?): List<OtpOption> {
        return buildList {
            for (index in 0 until (array?.length() ?: 0)) {
                val item = array?.optJSONObject(index) ?: continue
                val id = item.optString("id").trim()
                if (id.isBlank()) {
                    continue
                }
                add(
                    OtpOption(
                        id = id,
                        label = item.optString("label").trim().ifBlank { null },
                        otpType =
                            item.optString("type")
                                .trim()
                                .ifEmpty { item.optString("otp_type").trim() }
                                .ifBlank { null }
                                ?.uppercase(),
                    ),
                )
            }
        }
    }
}
