package com.chromvoid.app.security

import android.content.Context
import com.chromvoid.app.PasskeyMetadata
import java.io.File

internal interface PasskeyMetadataStore {
    fun listForRpId(rpId: String, allowCredentialIds: Set<String>): List<PasskeyMetadata>
    fun findByCredentialId(credentialId: String): PasskeyMetadata?
    fun hasExcludedCredential(excludedCredentialIds: Set<String>): Boolean
    fun saveNew(metadata: PasskeyMetadata)
    fun updateUsage(credentialId: String, signCount: Long, lastUsedEpochMs: Long)
    fun clearTransientState(passkeyRequestRegistry: com.chromvoid.app.passkey.PasskeyRequestRegistry)
}

internal class SystemPasskeyMetadataStore(
    private val blobStore: EncryptedBlobStore,
) : PasskeyMetadataStore {
    constructor(appContext: Context) : this(createBlobStore(appContext.applicationContext))

    @Synchronized
    override fun listForRpId(rpId: String, allowCredentialIds: Set<String>): List<PasskeyMetadata> {
        return loadAll()
            .asSequence()
            .filter { it.rpId == rpId }
            .filter { allowCredentialIds.isEmpty() || allowCredentialIds.contains(it.credentialIdB64Url) }
            .sortedWith(compareByDescending<PasskeyMetadata> { it.lastUsedEpochMs }.thenByDescending { it.createdAtEpochMs })
            .toList()
    }

    @Synchronized
    override fun findByCredentialId(credentialId: String): PasskeyMetadata? {
        return loadAll().firstOrNull { it.credentialIdB64Url == credentialId }
    }

    @Synchronized
    override fun hasExcludedCredential(excludedCredentialIds: Set<String>): Boolean {
        if (excludedCredentialIds.isEmpty()) {
            return false
        }
        return loadAll().any { excludedCredentialIds.contains(it.credentialIdB64Url) }
    }

    @Synchronized
    override fun saveNew(metadata: PasskeyMetadata) {
        val current = loadAll().filterNot { it.credentialIdB64Url == metadata.credentialIdB64Url }
        persist(current + metadata)
    }

    @Synchronized
    override fun updateUsage(credentialId: String, signCount: Long, lastUsedEpochMs: Long) {
        val updated = loadAll().map { metadata ->
            if (metadata.credentialIdB64Url == credentialId) {
                metadata.copy(signCount = signCount, lastUsedEpochMs = lastUsedEpochMs)
            } else {
                metadata
            }
        }
        persist(updated)
    }

    override fun clearTransientState(passkeyRequestRegistry: com.chromvoid.app.passkey.PasskeyRequestRegistry) {
        passkeyRequestRegistry.clear()
    }

    @Synchronized
    fun clearForTests() {
        blobStore.delete()
    }

    private fun loadAll(): List<PasskeyMetadata> {
        val plaintext =
            runCatching { blobStore.load() }.getOrElse {
                recoverCorruptedState()
                return emptyList()
            }?.toString(Charsets.UTF_8) ?: return emptyList()
        return runCatching { PasskeyMetadataJsonCodec.decodeAll(plaintext) }.getOrElse {
            recoverCorruptedState()
            emptyList()
        }
    }

    private fun persist(values: List<PasskeyMetadata>) {
        blobStore.persist(PasskeyMetadataJsonCodec.encodeAll(values))
    }

    private fun recoverCorruptedState() {
        runCatching { blobStore.delete() }
    }

    companion object {
        private const val METADATA_KEY_ALIAS = "chromvoid.passkeys.metadata.v1"
        private const val METADATA_DIR_NAME = "chromvoid-passkeys"
        private const val METADATA_FILE_NAME = "passkeys.enc"
        private const val CIPHER_TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH_BITS = 128
        private const val BLOB_VERSION = 1

        private fun createBlobStore(appContext: Context): EncryptedBlobStore {
            return EncryptedBlobStore(
                file = metadataFile(appContext),
                keyProvider = PasskeyMetadataKeyProvider(METADATA_KEY_ALIAS),
                cipherTransformation = CIPHER_TRANSFORMATION,
                gcmTagLengthBits = GCM_TAG_LENGTH_BITS,
                version = BLOB_VERSION,
            )
        }

        private fun metadataFile(appContext: Context): File {
            val dir = File(appContext.noBackupFilesDir, METADATA_DIR_NAME)
            if (!dir.exists() && !dir.mkdirs()) {
                throw IllegalStateException("Failed to create passkey metadata directory")
            }
            return File(dir, METADATA_FILE_NAME)
        }
    }
}
