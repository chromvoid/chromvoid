package com.chromvoid.app.passkey

import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import com.chromvoid.app.CreatePasskeyRequestData
import com.chromvoid.app.GetPasskeyRequestData
import org.json.JSONObject

internal object PasskeyRequestParser {
    fun parseGetRequest(option: GetPublicKeyCredentialOption): GetPasskeyRequestData? {
        return parseGetRequestJson(option.requestJson)
    }

    fun parseCreateRequest(request: CreatePublicKeyCredentialRequest): CreatePasskeyRequestData? {
        return parseCreateRequestJson(request.requestJson)
    }

    fun parseGetRequestJson(requestJson: String): GetPasskeyRequestData? {
        val json = runCatching { JSONObject(requestJson) }.getOrNull() ?: return null
        val rpId = json.optString("rpId").ifBlank { return null }
        val challengeB64Url = json.optString("challenge").ifBlank { return null }
        val allowCredentials = mutableSetOf<String>()
        val array = json.optJSONArray("allowCredentials")
        for (index in 0 until (array?.length() ?: 0)) {
            val item = array?.optJSONObject(index) ?: continue
            val id = item.optString("id")
            if (id.isNotBlank()) {
                allowCredentials += id
            }
        }
        return GetPasskeyRequestData(
            rpId = rpId,
            challengeB64Url = challengeB64Url,
            allowCredentialIds = allowCredentials,
        )
    }

    fun parseCreateRequestJson(requestJson: String): CreatePasskeyRequestData? {
        val json = runCatching { JSONObject(requestJson) }.getOrNull() ?: return null
        val rp = json.optJSONObject("rp") ?: return null
        val user = json.optJSONObject("user") ?: return null
        val rpId = rp.optString("id").ifBlank { return null }
        val challengeB64Url = json.optString("challenge").ifBlank { return null }
        val supportedAlgorithms = mutableSetOf<Int>()
        val params = json.optJSONArray("pubKeyCredParams")
        for (index in 0 until (params?.length() ?: 0)) {
            val item = params?.optJSONObject(index) ?: continue
            if (item.optString("type") == "public-key") {
                supportedAlgorithms += item.optInt("alg")
            }
        }
        val excludeCredentialIds = mutableSetOf<String>()
        val exclude = json.optJSONArray("excludeCredentials")
        for (index in 0 until (exclude?.length() ?: 0)) {
            val item = exclude?.optJSONObject(index) ?: continue
            val id = item.optString("id")
            if (id.isNotBlank()) {
                excludeCredentialIds += id
            }
        }
        return CreatePasskeyRequestData(
            rpId = rpId,
            rpName = rp.optString("name"),
            userIdB64Url = user.optString("id").ifBlank { return null },
            userName = user.optString("name").ifBlank { return null },
            userDisplayName = user.optString("displayName").ifBlank { user.optString("name") },
            challengeB64Url = challengeB64Url,
            supportedAlgorithms = supportedAlgorithms,
            excludeCredentialIds = excludeCredentialIds,
            attestationPreference = json.optString("attestation").ifBlank { "none" },
        )
    }
}
