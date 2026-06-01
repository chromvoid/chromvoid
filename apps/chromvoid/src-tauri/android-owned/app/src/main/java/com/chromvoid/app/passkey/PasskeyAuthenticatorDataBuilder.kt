package com.chromvoid.app.passkey

import java.security.MessageDigest

internal object PasskeyAuthenticatorDataBuilder {
    private const val FLAG_USER_PRESENT = 0x01
    private const val FLAG_USER_VERIFIED = 0x04
    private const val FLAG_ATTESTED_CREDENTIAL_DATA = 0x40

    fun assertion(
        rpId: String,
        signCount: Long,
        userVerified: Boolean = true,
    ): ByteArray {
        val flags = FLAG_USER_PRESENT or (if (userVerified) FLAG_USER_VERIFIED else 0)
        return build(
            rpId = rpId,
            flags = flags,
            signCount = signCount,
            attestedCredentialData = null,
        )
    }

    fun registration(
        rpId: String,
        credentialId: ByteArray,
        cosePublicKey: ByteArray,
        signCount: Long = 0,
        userVerified: Boolean = true,
    ): ByteArray {
        val flags =
            FLAG_USER_PRESENT or
                FLAG_ATTESTED_CREDENTIAL_DATA or
                (if (userVerified) FLAG_USER_VERIFIED else 0)
        val aaguid = ByteArray(16)
        val length = byteArrayOf(
            ((credentialId.size shr 8) and 0xff).toByte(),
            (credentialId.size and 0xff).toByte(),
        )
        val attestedCredentialData = aaguid + length + credentialId + cosePublicKey
        return build(rpId, flags, signCount, attestedCredentialData)
    }

    private fun build(
        rpId: String,
        flags: Int,
        signCount: Long,
        attestedCredentialData: ByteArray?,
    ): ByteArray {
        val rpIdHash = MessageDigest.getInstance("SHA-256").digest(rpId.toByteArray(Charsets.UTF_8))
        val signCountBytes = byteArrayOf(
            ((signCount shr 24) and 0xff).toByte(),
            ((signCount shr 16) and 0xff).toByte(),
            ((signCount shr 8) and 0xff).toByte(),
            (signCount and 0xff).toByte(),
        )
        return if (attestedCredentialData == null) {
            rpIdHash + byteArrayOf(flags.toByte()) + signCountBytes
        } else {
            rpIdHash + byteArrayOf(flags.toByte()) + signCountBytes + attestedCredentialData
        }
    }
}
