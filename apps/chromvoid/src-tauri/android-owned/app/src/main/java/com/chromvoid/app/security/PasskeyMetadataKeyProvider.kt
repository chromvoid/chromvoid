package com.chromvoid.app.security

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

internal class PasskeyMetadataKeyProvider(
    private val keyAlias: String,
) : KeystoreKeyProvider {
    override fun loadExisting(): SecretKey? {
        val entry = openKeyStore().getEntry(keyAlias, null) as? KeyStore.SecretKeyEntry
        return entry?.secretKey
    }

    override fun getOrCreate(): SecretKey {
        loadExisting()?.let { return it }
        return try {
            generateKey(strongBoxBacked = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P)
        } catch (_error: Exception) {
            generateKey(strongBoxBacked = false)
        }
    }

    override fun delete() {
        val keyStore = openKeyStore()
        if (keyStore.containsAlias(keyAlias)) {
            keyStore.deleteEntry(keyAlias)
        }
    }

    private fun generateKey(strongBoxBacked: Boolean): SecretKey {
        val keyGenerator =
            KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE)
        val spec =
            KeyGenParameterSpec.Builder(
                keyAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setKeySize(256)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .apply {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        setIsStrongBoxBacked(strongBoxBacked)
                    }
                }
                .build()
        keyGenerator.init(spec)
        return keyGenerator.generateKey()
    }

    companion object {
        private const val ANDROID_KEY_STORE = "AndroidKeyStore"

        private fun openKeyStore(): KeyStore {
            return KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }
        }
    }
}
