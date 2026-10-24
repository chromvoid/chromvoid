package com.chromvoid.app.security

import android.util.AtomicFile
import java.io.ByteArrayInputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.IOException
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.NoSuchFileException
import java.nio.file.attribute.BasicFileAttributes
import javax.crypto.Cipher
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal interface KeystoreKeyProvider {
    fun loadExisting(): SecretKey?
    fun getOrCreate(): SecretKey
    fun delete()
}

internal class EncryptedBlobStore(
    private val file: File,
    private val keyProvider: KeystoreKeyProvider,
    private val cipherTransformation: String,
    private val gcmTagLengthBits: Int,
    private val version: Int,
) {
    data class BlobStamp(
        val exists: Boolean,
        val length: Long,
        val lastModified: Long,
    )

    data class EncryptedBlob(
        val iv: ByteArray,
        val ciphertext: ByteArray,
    )

    fun stamp(): BlobStamp {
        val exists = file.isFile
        return BlobStamp(
            exists = exists,
            length = if (exists) file.length() else 0L,
            lastModified = if (exists) file.lastModified() else 0L,
        )
    }

    fun load(): ByteArray? {
        val key = keyProvider.loadExisting()
        // AtomicFile.openRead/readFully repairs backups by deleting/renaming
        // files. Reads must preserve the on-disk evidence, even after a crash.
        val backup = File(file.path + ".bak")
        val blobFile = if (regularFileExists(backup)) backup else file
        if (!regularFileExists(blobFile)) {
            if (key != null || regularFileExists(File(file.path + ".new"))) {
                throw IllegalStateException("Encrypted blob is missing for Android keystore key")
            }
            return null
        }

        if (key == null) {
            throw IllegalStateException("Android keystore key is missing for encrypted blob")
        }
        val blob = readBlob(blobFile)
        val cipher = Cipher.getInstance(cipherTransformation).apply {
            init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(gcmTagLengthBits, blob.iv))
        }
        return cipher.doFinal(blob.ciphertext)
    }

    fun persist(plaintext: ByteArray) {
        val key = keyProvider.getOrCreate()
        val cipher = Cipher.getInstance(cipherTransformation).apply {
            init(Cipher.ENCRYPT_MODE, key)
        }
        writeBlob(
            EncryptedBlob(
                iv = cipher.iv,
                ciphertext = cipher.doFinal(plaintext),
            ),
        )
    }

    fun delete() {
        for (candidate in listOf(file, File(file.path + ".bak"), File(file.path + ".new"))) {
            if (candidate.exists() && !candidate.delete()) {
                throw IOException("Failed to delete encrypted blob")
            }
        }
        keyProvider.delete()
    }

    private fun writeBlob(blob: EncryptedBlob) {
        val parent = file.parentFile ?: throw IOException("Encrypted blob path has no parent")
        if (!parent.exists() && !parent.mkdirs()) {
            throw IOException("Failed to create encrypted blob directory")
        }

        val atomicFile = AtomicFile(file)
        val output = atomicFile.startWrite()
        try {
            DataOutputStream(output).use { out ->
                out.writeByte(version)
                out.writeByte(blob.iv.size)
                out.write(blob.iv)
                out.writeInt(blob.ciphertext.size)
                out.write(blob.ciphertext)
            }
            atomicFile.finishWrite(output)
        } catch (error: IOException) {
            atomicFile.failWrite(output)
            throw error
        }
    }

    private fun regularFileExists(candidate: File): Boolean {
        val attributes = try {
            Files.readAttributes(candidate.toPath(), BasicFileAttributes::class.java, LinkOption.NOFOLLOW_LINKS)
        } catch (_: NoSuchFileException) {
            return false
        }
        if (!attributes.isRegularFile) {
            throw IOException("Encrypted blob path is not a regular file")
        }
        return true
    }

    private fun readBlob(blobFile: File): EncryptedBlob {
        val bytes = blobFile.readBytes()
        DataInputStream(ByteArrayInputStream(bytes)).use { input ->
            val blobVersion = input.readUnsignedByte()
            if (blobVersion != version) {
                throw IOException("Unsupported encrypted blob version: $blobVersion")
            }

            val ivLength = input.readUnsignedByte()
            val iv = ByteArray(ivLength)
            input.readFully(iv)

            val ciphertextLength = input.readInt()
            if (ciphertextLength <= 0 || ciphertextLength > input.available()) {
                throw IOException("Invalid encrypted blob ciphertext length: $ciphertextLength")
            }

            val ciphertext = ByteArray(ciphertextLength)
            input.readFully(ciphertext)
            return EncryptedBlob(iv = iv, ciphertext = ciphertext)
        }
    }
}
