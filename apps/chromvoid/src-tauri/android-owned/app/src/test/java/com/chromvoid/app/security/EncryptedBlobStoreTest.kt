package com.chromvoid.app.security

import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
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
        var loadExistingCalls = 0
            private set
        var getOrCreateCalls = 0
            private set
        var deleteCalls = 0
            private set
        var failGetOrCreate = false

        override fun loadExisting(): SecretKey? {
            loadExistingCalls += 1
            return key
        }

        override fun getOrCreate(): SecretKey {
            getOrCreateCalls += 1
            if (failGetOrCreate) {
                error("keystore unavailable")
            }
            return key ?: KeyGenerator.getInstance("AES").apply { init(256) }.generateKey().also {
                key = it
            }
        }

        override fun delete() {
            deleteCalls += 1
            key = null
        }

        fun resetCounts() {
            loadExistingCalls = 0
            getOrCreateCalls = 0
            deleteCalls = 0
        }
    }
}
