package com.chromvoid.app.security

import com.chromvoid.app.PasskeyMetadata
import org.json.JSONArray
import org.json.JSONObject

internal object PasskeyMetadataJsonCodec {
    fun decodeAll(raw: String): List<PasskeyMetadata> {
        val array = JSONArray(raw)
        return buildList {
            for (index in 0 until array.length()) {
                val item = array.optJSONObject(index) ?: continue
                add(item.toRecord().toPasskeyMetadata())
            }
        }
    }

    fun encodeAll(values: List<PasskeyMetadata>): ByteArray {
        val array = JSONArray()
        values.forEach { array.put(it.toRecord().toJson()) }
        return array.toString().toByteArray(Charsets.UTF_8)
    }

    private fun PasskeyMetadata.toRecord(): PasskeyMetadataJsonRecord =
        PasskeyMetadataJsonRecord(
            credentialIdB64Url = credentialIdB64Url,
            rpId = rpId,
            userIdB64Url = userIdB64Url,
            userName = userName,
            userDisplayName = userDisplayName,
            keyAlias = keyAlias,
            signCount = signCount,
            createdAtEpochMs = createdAtEpochMs,
            lastUsedEpochMs = lastUsedEpochMs,
        )

    private fun JSONObject.toRecord(): PasskeyMetadataJsonRecord {
        return PasskeyMetadataJsonRecord(
            credentialIdB64Url = optString("credential_id_b64url"),
            rpId = optString("rp_id"),
            userIdB64Url = optString("user_id_b64url"),
            userName = optString("user_name"),
            userDisplayName = optString("user_display_name"),
            keyAlias = optString("key_alias"),
            signCount = optLong("sign_count"),
            createdAtEpochMs = optLong("created_at_epoch_ms"),
            lastUsedEpochMs = optLong("last_used_epoch_ms"),
        )
    }
}

private data class PasskeyMetadataJsonRecord(
    val credentialIdB64Url: String,
    val rpId: String,
    val userIdB64Url: String,
    val userName: String,
    val userDisplayName: String,
    val keyAlias: String,
    val signCount: Long,
    val createdAtEpochMs: Long,
    val lastUsedEpochMs: Long,
)

private fun PasskeyMetadataJsonRecord.toPasskeyMetadata(): PasskeyMetadata {
    return PasskeyMetadata(
        credentialIdB64Url = credentialIdB64Url,
        rpId = rpId,
        userIdB64Url = userIdB64Url,
        userName = userName,
        userDisplayName = userDisplayName,
        keyAlias = keyAlias,
        signCount = signCount,
        createdAtEpochMs = createdAtEpochMs,
        lastUsedEpochMs = lastUsedEpochMs,
    )
}

private fun PasskeyMetadataJsonRecord.toJson(): JSONObject {
    return JSONObject()
        .put("credential_id_b64url", credentialIdB64Url)
        .put("rp_id", rpId)
        .put("user_id_b64url", userIdB64Url)
        .put("user_name", userName)
        .put("user_display_name", userDisplayName)
        .put("key_alias", keyAlias)
        .put("sign_count", signCount)
        .put("created_at_epoch_ms", createdAtEpochMs)
        .put("last_used_epoch_ms", lastUsedEpochMs)
}
