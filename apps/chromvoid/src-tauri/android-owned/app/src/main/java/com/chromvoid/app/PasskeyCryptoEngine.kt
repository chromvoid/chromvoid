package com.chromvoid.app

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.chromvoid.app.passkey.PasskeyEncoding
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.SecureRandom
import java.security.PrivateKey
import java.security.Signature
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec

object PasskeyCryptoEngine {
    private const val ANDROID_KEY_STORE = "AndroidKeyStore"
    private const val KEY_PREFIX = "chromvoid.passkey."

    fun createCredential(
        request: CreatePasskeyRequestData,
    ): CreatedPasskeyMaterial {
        val credentialId = randomCredentialId()
        val credentialIdB64Url = PasskeyEncoding.base64UrlEncode(credentialId)
        val keyAlias = "$KEY_PREFIX$credentialIdB64Url"
        val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, ANDROID_KEY_STORE)
        val spec = KeyGenParameterSpec.Builder(
            keyAlias,
            KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
        )
            .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
            .setDigests(KeyProperties.DIGEST_SHA256)
            .setUserAuthenticationRequired(false)
            .build()
        generator.initialize(spec)
        val keyPair = generator.generateKeyPair()
        val publicKey = keyPair.public as ECPublicKey
        val cosePublicKey = coseEncode(publicKey)
        val now = System.currentTimeMillis()
        return CreatedPasskeyMaterial(
            metadata = PasskeyMetadata(
                credentialIdB64Url = credentialIdB64Url,
                rpId = request.rpId,
                userIdB64Url = request.userIdB64Url,
                userName = request.userName,
                userDisplayName = request.userDisplayName,
                keyAlias = keyAlias,
                signCount = 0,
                createdAtEpochMs = now,
                lastUsedEpochMs = now,
            ),
            credentialId = credentialId,
            cosePublicKey = cosePublicKey,
        )
    }

    fun beginAssertionSignature(metadata: PasskeyMetadata): Signature {
        val signature = Signature.getInstance("SHA256withECDSA")
        signature.initSign(privateKey(metadata.keyAlias))
        return signature
    }

    fun signAssertion(
        signature: Signature,
        authenticatorData: ByteArray,
        clientDataHash: ByteArray,
    ): ByteArray {
        signature.update(authenticatorData)
        signature.update(clientDataHash)
        return signature.sign()
    }

    fun credentialIdBytes(metadata: PasskeyMetadata): ByteArray {
        return PasskeyEncoding.base64UrlDecode(metadata.credentialIdB64Url)
    }

    fun userIdBytes(metadata: PasskeyMetadata): ByteArray {
        return PasskeyEncoding.base64UrlDecode(metadata.userIdB64Url)
    }

    private fun coseEncode(publicKey: ECPublicKey): ByteArray {
        val fieldSize = 32
        val x = publicKey.w.affineX.toUnsignedFixed(fieldSize)
        val y = publicKey.w.affineY.toUnsignedFixed(fieldSize)
        return PasskeyCbor.encode(
            linkedMapOf<Any, Any>(
                1 to 2,
                3 to -7,
                -1 to 1,
                -2 to x,
                -3 to y,
            ),
        )
    }

    private fun privateKey(alias: String): PrivateKey {
        val entry = openKeyStore().getEntry(alias, null) as? KeyStore.PrivateKeyEntry
        return entry?.privateKey ?: error("Android keystore key is missing for alias $alias")
    }

    private fun openKeyStore(): KeyStore {
        return KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }
    }

    private fun randomCredentialId(): ByteArray {
        return ByteArray(32).also { SecureRandom().nextBytes(it) }
    }

    private fun java.math.BigInteger.toUnsignedFixed(size: Int): ByteArray {
        val source = toByteArray()
        return when {
            source.size == size -> source
            source.size < size -> ByteArray(size - source.size) + source
            else -> source.copyOfRange(source.size - size, source.size)
        }
    }
}
