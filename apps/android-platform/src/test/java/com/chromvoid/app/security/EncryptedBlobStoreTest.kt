package com.chromvoid.app.security

import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
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
    fun pepperStore_returnsAbsentOnlyWhenBlobAndKeyAreAbsent() {
        val keyProvider = MutableKeyProvider()
        val file = tempFile("pepper-absent")
        val store = SystemPepperStore(blobStore(file, keyProvider))

        assertNull(store.loadPepper())
        assertFalse(file.exists())
        assertEquals(0, keyProvider.getOrCreateCalls)
        assertEquals(0, keyProvider.deleteCalls)
    }

    @Test
    fun pepperStore_missingKeyPreservesBlobAndReportsUnavailable() {
        val keyProvider = MutableKeyProvider()
        val file = tempFile("pepper-missing-key")
        val store = SystemPepperStore(blobStore(file, keyProvider))
        store.storePepper(byteArrayOf(4, 5, 6))
        val encrypted = file.readBytes()

        keyProvider.delete()
        keyProvider.resetCounts()

        assertThrows(IllegalStateException::class.java) { store.loadPepper() }
        assertArrayEquals(encrypted, file.readBytes())
        assertEquals(0, keyProvider.getOrCreateCalls)
        assertEquals(0, keyProvider.deleteCalls)
    }

    @Test
    fun pepperStore_missingBlobPreservesKeyAndReportsUnavailable() {
        val keyProvider = MutableKeyProvider()
        val file = tempFile("pepper-missing-blob")
        val store = SystemPepperStore(blobStore(file, keyProvider))
        store.storePepper(byteArrayOf(4, 5, 6))
        val key = keyProvider.loadExisting()
        assertTrue(file.delete())
        keyProvider.resetCounts()

        assertThrows(IllegalStateException::class.java) { store.loadPepper() }
        assertSame(key, keyProvider.loadExisting())
        assertFalse(file.exists())
        assertEquals(0, keyProvider.getOrCreateCalls)
        assertEquals(0, keyProvider.deleteCalls)
    }

    @Test
    fun pepperStore_unsupportedVersionPreservesBlobAndKey() {
        val keyProvider = MutableKeyProvider()
        val file = tempFile("pepper-version")
        val writer = EncryptedBlobStore(file, keyProvider, "AES/GCM/NoPadding", 128, 1)
        writer.persist(byteArrayOf(7, 8, 9))
        val encrypted = file.readBytes()
        val key = keyProvider.loadExisting()
        keyProvider.resetCounts()

        val store = SystemPepperStore(EncryptedBlobStore(file, keyProvider, "AES/GCM/NoPadding", 128, 2))

        assertThrows(java.io.IOException::class.java) { store.loadPepper() }
        assertArrayEquals(encrypted, file.readBytes())
        assertSame(key, keyProvider.loadExisting())
        assertEquals(0, keyProvider.getOrCreateCalls)
        assertEquals(0, keyProvider.deleteCalls)
    }

    @Test
    fun pepperStore_temporaryKeystoreFailurePreservesBlobAndKeyForRetry() {
        val keyProvider = MutableKeyProvider()
        val file = tempFile("pepper-transient")
        val store = SystemPepperStore(blobStore(file, keyProvider))
        val pepper = byteArrayOf(10, 11, 12)
        store.storePepper(pepper)
        val encrypted = file.readBytes()
        val key = keyProvider.loadExisting()
        keyProvider.resetCounts()
        keyProvider.failLoad = true

        assertThrows(IllegalStateException::class.java) { store.loadPepper() }
        assertArrayEquals(encrypted, file.readBytes())
        assertEquals(0, keyProvider.getOrCreateCalls)
        assertEquals(0, keyProvider.deleteCalls)

        keyProvider.failLoad = false
        assertSame(key, keyProvider.loadExisting())
        assertArrayEquals(pepper, store.loadPepper())
    }

    @Test
    fun pepperStore_authenticationFailurePreservesBlobAndKey() {
        val keyProvider = MutableKeyProvider()
        val file = tempFile("pepper-corrupt")
        val store = SystemPepperStore(blobStore(file, keyProvider))
        store.storePepper(byteArrayOf(13, 14, 15))
        val key = keyProvider.loadExisting()
        val encrypted = file.readBytes().apply { this[lastIndex] = (this[lastIndex].toInt() xor 1).toByte() }
        file.writeBytes(encrypted)
        keyProvider.resetCounts()

        assertThrows(javax.crypto.AEADBadTagException::class.java) { store.loadPepper() }
        assertArrayEquals(encrypted, file.readBytes())
        assertSame(key, keyProvider.loadExisting())
        assertEquals(0, keyProvider.getOrCreateCalls)
        assertEquals(0, keyProvider.deleteCalls)
    }

    @Test
    fun pepperStore_readsLegacyBackupWithoutAtomicFileRepair() {
        val keyProvider = MutableKeyProvider()
        val file = tempFile("pepper-backup")
        val store = SystemPepperStore(blobStore(file, keyProvider))
        val pepper = byteArrayOf(16, 17, 18)
        store.storePepper(pepper)
        val backup = File(file.path + ".bak")
        val encrypted = file.readBytes()
        backup.writeBytes(encrypted)
        val incomplete = byteArrayOf(0, 1, 2)
        file.writeBytes(incomplete)
        keyProvider.resetCounts()

        assertArrayEquals(pepper, store.loadPepper())
        assertArrayEquals(incomplete, file.readBytes())
        assertArrayEquals(encrypted, backup.readBytes())
        assertEquals(0, keyProvider.getOrCreateCalls)
        assertEquals(0, keyProvider.deleteCalls)
    }

    @Test
    fun pepperStore_uncommittedBlobWithoutKeyReportsUnavailable() {
        val keyProvider = MutableKeyProvider()
        val file = tempFile("pepper-uncommitted")
        val incomplete = File(file.path + ".new")
        val encrypted = byteArrayOf(1, 2, 3)
        incomplete.writeBytes(encrypted)
        val store = SystemPepperStore(blobStore(file, keyProvider))

        assertThrows(IllegalStateException::class.java) { store.loadPepper() }
        assertArrayEquals(encrypted, incomplete.readBytes())
        assertFalse(file.exists())
        assertEquals(0, keyProvider.getOrCreateCalls)
        assertEquals(0, keyProvider.deleteCalls)
    }

    @Test
    fun pepperStore_explicitDeleteRemovesBlobAndKey() {
        val keyProvider = MutableKeyProvider()
        val file = tempFile("pepper-delete")
        val store = SystemPepperStore(blobStore(file, keyProvider))
        store.storePepper(byteArrayOf(19, 20, 21))
        val backup = File(file.path + ".bak").apply { writeBytes(file.readBytes()) }
        val incomplete = File(file.path + ".new").apply { writeBytes(byteArrayOf(1)) }
        keyProvider.resetCounts()

        store.deletePepper()

        assertFalse(file.exists())
        assertFalse(backup.exists())
        assertFalse(incomplete.exists())
        assertNull(keyProvider.loadExisting())
        assertEquals(1, keyProvider.deleteCalls)
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
        var getOrCreateCalls = 0
            private set
        var deleteCalls = 0
            private set
        var failLoad = false

        override fun loadExisting(): SecretKey? {
            check(!failLoad) { "temporary keystore failure" }
            return key
        }

        override fun getOrCreate(): SecretKey {
            getOrCreateCalls += 1
            return key ?: KeyGenerator.getInstance("AES").apply { init(256) }.generateKey().also {
                key = it
            }
        }

        override fun delete() {
            deleteCalls += 1
            key = null
        }

        fun resetCounts() {
            getOrCreateCalls = 0
            deleteCalls = 0
        }
    }
}
