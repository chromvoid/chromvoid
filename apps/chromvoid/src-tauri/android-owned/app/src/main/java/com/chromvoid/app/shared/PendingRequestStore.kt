package com.chromvoid.app.shared

import android.util.AtomicFile
import java.io.ByteArrayInputStream
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.io.IOException

internal interface PendingRequestRecord {
    val requestId: String
    val createdAtEpochMs: Long
}

internal interface PendingRequestStore<T : PendingRequestRecord> {
    fun put(request: T)
    fun get(requestId: String): T?
    fun remove(requestId: String): T?
    fun values(): List<T>
    fun clear()
}

internal interface PendingRequestPersistence<T : PendingRequestRecord> {
    fun loadAll(): List<T>
    fun persistAll(values: Collection<T>)
    fun clear()
}

internal interface PendingRequestCodec<T : PendingRequestRecord> {
    fun write(
        output: DataOutputStream,
        value: T,
    )

    fun read(input: DataInputStream): T
}

internal class AtomicFilePendingRequestPersistence<T : PendingRequestRecord>(
    private val file: File,
    private val version: Int,
    private val codec: PendingRequestCodec<T>,
) : PendingRequestPersistence<T> {
    override fun loadAll(): List<T> {
        if (!file.isFile) {
            return emptyList()
        }

        val bytes = AtomicFile(file).readFully()
        DataInputStream(ByteArrayInputStream(bytes)).use { input ->
            val fileVersion = input.readUnsignedByte()
            if (fileVersion != version) {
                throw IOException("Unsupported pending request store version: $fileVersion")
            }

            val count = input.readInt()
            if (count < 0) {
                throw IOException("Invalid pending request count: $count")
            }

            return buildList(count) {
                repeat(count) {
                    add(codec.read(input))
                }
            }
        }
    }

    override fun persistAll(values: Collection<T>) {
        val parent = file.parentFile ?: throw IOException("Pending request store path has no parent")
        if (!parent.exists() && !parent.mkdirs()) {
            throw IOException("Failed to create pending request store directory")
        }

        val atomicFile = AtomicFile(file)
        val output = atomicFile.startWrite()
        try {
            DataOutputStream(output).use { stream ->
                stream.writeByte(version)
                stream.writeInt(values.size)
                values.forEach { value ->
                    codec.write(stream, value)
                }
            }
            atomicFile.finishWrite(output)
        } catch (error: IOException) {
            atomicFile.failWrite(output)
            throw error
        }
    }

    override fun clear() {
        if (file.exists() && !file.delete()) {
            throw IOException("Failed to delete pending request store")
        }
    }
}

internal class PersistentPendingRequestStore<T : PendingRequestRecord>(
    private val clock: AndroidClock,
    private val expiryMs: Long,
    private val persistence: PendingRequestPersistence<T>,
) : PendingRequestStore<T> {
    private val lock = Any()

    override fun put(request: T) {
        synchronized(lock) {
            val current = loadActiveLocked().associateByTo(linkedMapOf()) { it.requestId }
            current[request.requestId] = request
            persistence.persistAll(current.values)
        }
    }

    override fun get(requestId: String): T? {
        synchronized(lock) {
            return loadActiveLocked().firstOrNull { it.requestId == requestId }
        }
    }

    override fun remove(requestId: String): T? {
        synchronized(lock) {
            val current = loadActiveLocked().associateByTo(linkedMapOf()) { it.requestId }
            val removed = current.remove(requestId)
            if (removed != null) {
                persistence.persistAll(current.values)
            }
            return removed
        }
    }

    override fun values(): List<T> {
        synchronized(lock) {
            return loadActiveLocked()
        }
    }

    override fun clear() {
        synchronized(lock) {
            persistence.clear()
        }
    }

    private fun loadActiveLocked(): List<T> {
        val loaded =
            runCatching { persistence.loadAll() }.getOrElse {
                persistence.clear()
                return emptyList()
            }

        val now = clock.now()
        val active = loaded.filter { now - it.createdAtEpochMs <= expiryMs }
        if (active.size != loaded.size) {
            persistence.persistAll(active)
        }
        return active
    }
}
