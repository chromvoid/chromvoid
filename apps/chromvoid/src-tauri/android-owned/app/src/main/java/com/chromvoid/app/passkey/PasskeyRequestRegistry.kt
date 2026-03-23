package com.chromvoid.app.passkey

import android.content.Context
import com.chromvoid.app.PendingPasskeyRequest
import com.chromvoid.app.shared.AndroidClock
import com.chromvoid.app.shared.AtomicFilePendingRequestPersistence
import com.chromvoid.app.shared.PendingRequestCodec
import com.chromvoid.app.shared.PendingRequestStore
import com.chromvoid.app.shared.PersistentPendingRequestStore
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File
import java.util.concurrent.ConcurrentHashMap

internal interface PasskeyRequestRegistry : PendingRequestStore<PendingPasskeyRequest>

internal class InMemoryPasskeyRequestRegistry(
    private val clock: AndroidClock,
    private val expiryMs: Long = DEFAULT_EXPIRY_MS,
) : PasskeyRequestRegistry {
    private val requests = ConcurrentHashMap<String, PendingPasskeyRequest>()

    override fun put(request: PendingPasskeyRequest) {
        cleanupExpired()
        requests[request.requestId] = request
    }

    override fun get(requestId: String): PendingPasskeyRequest? {
        cleanupExpired()
        return requests[requestId]
    }

    override fun remove(requestId: String): PendingPasskeyRequest? = requests.remove(requestId)

    override fun values(): List<PendingPasskeyRequest> {
        cleanupExpired()
        return requests.values.toList()
    }

    override fun clear() {
        requests.clear()
    }

    private fun cleanupExpired() {
        val now = clock.now()
        requests.entries.removeIf { (_, value) ->
            now - value.createdAtEpochMs > expiryMs
        }
    }

    companion object {
        const val DEFAULT_EXPIRY_MS: Long = 5 * 60 * 1000
    }
}

internal class PersistentPasskeyRequestRegistry(
    context: Context,
    clock: AndroidClock,
    expiryMs: Long = InMemoryPasskeyRequestRegistry.DEFAULT_EXPIRY_MS,
) : PasskeyRequestRegistry {
    private val store =
        PersistentPendingRequestStore(
            clock = clock,
            expiryMs = expiryMs,
            persistence =
                AtomicFilePendingRequestPersistence(
                    file = requestFile(context.applicationContext),
                    version = STORE_VERSION,
                    codec = PendingPasskeyRequestCodec,
                ),
        )

    override fun put(request: PendingPasskeyRequest) {
        store.put(request)
    }

    override fun get(requestId: String): PendingPasskeyRequest? = store.get(requestId)

    override fun remove(requestId: String): PendingPasskeyRequest? = store.remove(requestId)

    override fun values(): List<PendingPasskeyRequest> = store.values()

    override fun clear() {
        store.clear()
    }

    companion object {
        private const val STORE_VERSION = 1
        private const val STORE_DIR = "chromvoid-pending"
        private const val STORE_FILE = "passkey-requests.bin"

        private fun requestFile(context: Context): File {
            val dir = File(context.noBackupFilesDir, STORE_DIR)
            return File(dir, STORE_FILE)
        }
    }
}

internal object PendingPasskeyRequestCodec : PendingRequestCodec<PendingPasskeyRequest> {
    override fun write(
        output: DataOutputStream,
        value: PendingPasskeyRequest,
    ) {
        output.writeUTF(value.requestId)
        output.writeUTF(value.command)
        output.writeUTF(value.rpId)
        output.writeLong(value.createdAtEpochMs)
    }

    override fun read(input: DataInputStream): PendingPasskeyRequest {
        return PendingPasskeyRequest(
            requestId = input.readUTF(),
            command = input.readUTF(),
            rpId = input.readUTF(),
            createdAtEpochMs = input.readLong(),
        )
    }
}
