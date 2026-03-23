package com.chromvoid.app.security

import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.PasskeyMetadata
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class EncryptedBlobStoreTest {
    private val context = ApplicationProvider.getApplicationContext<android.content.Context>()

    @Test
    fun pepperStore_roundTripsEncryptedBlob() {
        val keyProvider = MutableKeyProvider()
        val file = tempFile("pepper-roundtrip")
        val store = SystemPepperStore(blobStore(file, keyProvider))

        store.storePepper(byteArrayOf(1, 2, 3))

        assertArrayEquals(byteArrayOf(1, 2, 3), store.loadPepper())
    }

    @Test
    fun pepperStore_recoversFromMissingKeyAndDeletesBlob() {
        val keyProvider = MutableKeyProvider()
        val file = tempFile("pepper-missing-key")
        val store = SystemPepperStore(blobStore(file, keyProvider))
        store.storePepper(byteArrayOf(4, 5, 6))

        keyProvider.delete()

        assertNull(store.loadPepper())
        assertFalse(file.exists())
    }

    @Test
    fun pepperStore_recoversFromUnsupportedVersion() {
        val keyProvider = MutableKeyProvider()
        val file = tempFile("pepper-version")
        val writer = EncryptedBlobStore(file, keyProvider, "AES/GCM/NoPadding", 128, 1)
        writer.persist(byteArrayOf(7, 8, 9))

        val store = SystemPepperStore(EncryptedBlobStore(file, keyProvider, "AES/GCM/NoPadding", 128, 2))

        assertNull(store.loadPepper())
        assertFalse(file.exists())
    }

    @Test
    fun passkeyMetadataStore_roundTripsAndRecoversCorruption() {
        val keyProvider = MutableKeyProvider()
        val file = tempFile("passkey-metadata")
        val store = SystemPasskeyMetadataStore(blobStore(file, keyProvider))
        val metadata =
            PasskeyMetadata(
                credentialIdB64Url = "cred-1",
                rpId = "example.com",
                userIdB64Url = "user-1",
                userName = "alice@example.com",
                userDisplayName = "Alice",
                keyAlias = "chromvoid.passkey.cred-1",
                signCount = 1,
                createdAtEpochMs = 10L,
                lastUsedEpochMs = 20L,
            )

        store.saveNew(metadata)
        assertEquals(metadata, store.findByCredentialId("cred-1"))

        file.writeBytes(byteArrayOf(0x01, 0x02, 0x03))
        assertNull(store.findByCredentialId("cred-1"))
        assertFalse(file.exists())
    }

    private fun blobStore(
        file: File,
        keyProvider: MutableKeyProvider,
        version: Int = 1,
    ): EncryptedBlobStore {
        return EncryptedBlobStore(
            file = file,
            keyProvider = keyProvider,
            cipherTransformation = "AES/GCM/NoPadding",
            gcmTagLengthBits = 128,
            version = version,
        )
    }

    private fun tempFile(name: String): File {
        val dir = File(context.cacheDir, "android-refactor-tests").apply { mkdirs() }
        return File(dir, "$name-${System.nanoTime()}.bin")
    }

    private class MutableKeyProvider : KeystoreKeyProvider {
        private var key: SecretKey? = null

        override fun loadExisting(): SecretKey? = key

        override fun getOrCreate(): SecretKey {
            return key ?: KeyGenerator.getInstance("AES").apply { init(256) }.generateKey().also {
                key = it
            }
        }

        override fun delete() {
            key = null
        }
    }
}
