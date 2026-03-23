package com.chromvoid.app.security

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.io.File
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

internal interface PepperStore {
    fun loadPepper(): ByteArray?
    fun storePepper(pepper: ByteArray)
    fun deletePepper()
}

internal class SystemPepperStore(
    private val blobStore: EncryptedBlobStore,
) : PepperStore {
    constructor(appContext: Context) : this(createBlobStore(appContext.applicationContext))

    override fun loadPepper(): ByteArray? {
        return runCatching { blobStore.load() }.getOrElse {
            recoverCorruptedState()
            null
        }
    }

    override fun storePepper(pepper: ByteArray) {
        blobStore.persist(pepper)
    }

    override fun deletePepper() {
        blobStore.delete()
    }

    private fun recoverCorruptedState() {
        runCatching { blobStore.delete() }
    }

    private class PepperKeyProvider : KeystoreKeyProvider {
        override fun loadExisting(): SecretKey? {
            val entry = openKeyStore().getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry
            return entry?.secretKey
        }

        override fun getOrCreate(): SecretKey {
            loadExisting()?.let { return it }

            return try {
                generateSecretKey(strongBoxBacked = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P)
            } catch (error: Exception) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    generateSecretKey(strongBoxBacked = false)
                } else {
                    throw error
                }
            }
        }

        override fun delete() {
            val keyStore = openKeyStore()
            if (keyStore.containsAlias(KEY_ALIAS)) {
                keyStore.deleteEntry(KEY_ALIAS)
            }
        }

        private fun generateSecretKey(strongBoxBacked: Boolean): SecretKey {
            val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEY_STORE)
            val spec =
                KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
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
    }

    companion object {
        private const val ANDROID_KEY_STORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "chromvoid.storage_pepper.v1"
        private const val CIPHER_TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH_BITS = 128
        private const val BLOB_VERSION = 1
        private const val BLOB_FILE_NAME = "storage_pepper.enc"

        private fun openKeyStore(): KeyStore {
            return KeyStore.getInstance(ANDROID_KEY_STORE).apply { load(null) }
        }

        private fun createBlobStore(appContext: Context): EncryptedBlobStore {
            return EncryptedBlobStore(
                file = blobFile(appContext),
                keyProvider = PepperKeyProvider(),
                cipherTransformation = CIPHER_TRANSFORMATION,
                gcmTagLengthBits = GCM_TAG_LENGTH_BITS,
                version = BLOB_VERSION,
            )
        }

        private fun blobFile(appContext: Context): File {
            val dir = File(appContext.noBackupFilesDir, "chromvoid-keystore")
            if (!dir.exists() && !dir.mkdirs()) {
                throw IllegalStateException("Failed to create keystore storage directory")
            }
            return File(dir, BLOB_FILE_NAME)
        }
    }
}
