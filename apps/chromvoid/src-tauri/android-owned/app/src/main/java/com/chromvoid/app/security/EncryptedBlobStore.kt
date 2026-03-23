package com.chromvoid.app.security

import android.util.AtomicFile
import java.io.ByteArrayInputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.IOException
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
    data class EncryptedBlob(
        val iv: ByteArray,
        val ciphertext: ByteArray,
    )

    fun load(): ByteArray? {
        if (!file.isFile) {
            return null
        }

        val key = keyProvider.loadExisting()
            ?: throw IllegalStateException("Android keystore key is missing for encrypted blob")
        val blob = readBlob()
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
        if (file.exists() && !file.delete()) {
            throw IOException("Failed to delete encrypted blob")
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

    private fun readBlob(): EncryptedBlob {
        val bytes = AtomicFile(file).readFully()
        DataInputStream(ByteArrayInputStream(bytes)).use { input ->
            val blobVersion = input.readUnsignedByte()
            if (blobVersion != version) {
                throw IOException("Unsupported encrypted blob version: $blobVersion")
            }

            val ivLength = input.readUnsignedByte()
            val iv = ByteArray(ivLength)
            input.readFully(iv)

            val ciphertextLength = input.readInt()
            if (ciphertextLength <= 0) {
                throw IOException("Invalid encrypted blob ciphertext length: $ciphertextLength")
            }

            val ciphertext = ByteArray(ciphertextLength)
            input.readFully(ciphertext)
            return EncryptedBlob(iv = iv, ciphertext = ciphertext)
        }
    }
}
