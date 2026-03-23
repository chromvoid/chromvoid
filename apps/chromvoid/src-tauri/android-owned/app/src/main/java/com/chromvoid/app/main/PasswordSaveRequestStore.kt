package com.chromvoid.app.main

import android.content.Context
import com.chromvoid.app.shared.AndroidClock
import com.chromvoid.app.shared.AtomicFilePendingRequestPersistence
import com.chromvoid.app.shared.PendingRequestCodec
import com.chromvoid.app.shared.PendingRequestPersistence
import com.chromvoid.app.shared.PendingRequestRecord
import com.chromvoid.app.shared.PersistentPendingRequestStore
import java.io.DataInputStream
import java.io.DataOutputStream
import java.io.File

internal data class PendingPasswordSaveRequest(
    val token: String,
    override val createdAtEpochMs: Long,
) : PendingRequestRecord {
    override val requestId: String
        get() = token
}

internal interface PasswordSaveRequestStore {
    fun stage(token: String)
    fun current(): PendingPasswordSaveRequest?
    fun remove(token: String): PendingPasswordSaveRequest?
    fun clear()
}

internal class DefaultPasswordSaveRequestStore(
    context: Context,
    clock: AndroidClock,
    expiryMs: Long = DEFAULT_EXPIRY_MS,
) : PasswordSaveRequestStore {
    private val store =
        PersistentPendingRequestStore(
            clock = clock,
            expiryMs = expiryMs,
            persistence =
                AtomicFilePendingRequestPersistence(
                    file = requestFile(context.applicationContext),
                    version = STORE_VERSION,
                    codec = PendingPasswordSaveRequestCodec,
                ),
        )
    private val requestClock = clock

    override fun stage(token: String) {
        if (token.isBlank()) {
            return
        }
        store.put(PendingPasswordSaveRequest(token = token, createdAtEpochMs = requestClock.now()))
    }

    override fun current(): PendingPasswordSaveRequest? {
        return store.values().maxByOrNull { it.createdAtEpochMs }
    }

    override fun remove(token: String): PendingPasswordSaveRequest? = store.remove(token)

    override fun clear() {
        store.clear()
    }

    companion object {
        private const val STORE_VERSION = 1
        private const val DEFAULT_EXPIRY_MS: Long = 10 * 60 * 1000
        private const val STORE_DIR = "chromvoid-pending"
        private const val STORE_FILE = "password-save-handoff.bin"

        private fun requestFile(context: Context): File {
            val dir = File(context.noBackupFilesDir, STORE_DIR)
            return File(dir, STORE_FILE)
        }
    }
}

internal object PendingPasswordSaveRequestCodec : PendingRequestCodec<PendingPasswordSaveRequest> {
    override fun write(
        output: DataOutputStream,
        value: PendingPasswordSaveRequest,
    ) {
        output.writeUTF(value.token)
        output.writeLong(value.createdAtEpochMs)
    }

    override fun read(input: DataInputStream): PendingPasswordSaveRequest {
        return PendingPasswordSaveRequest(
            token = input.readUTF(),
            createdAtEpochMs = input.readLong(),
        )
    }
}
