package com.chromvoid.air.session

import com.chromvoid.air.bridge.AirSessionRuntime
import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.CredentialImportTransfer
import com.chromvoid.air.bridge.FileReadTransfer
import com.chromvoid.air.bridge.FileWriteTransfer
import com.chromvoid.air.bridge.StorageBackupTransfer
import com.chromvoid.air.bridge.StorageEraseTransfer
import com.chromvoid.air.bridge.StorageRestoreTransfer
import com.chromvoid.air.ffi.AirFileLimits
import com.chromvoid.air.ffi.AirFileWriteTarget
import com.chromvoid.air.ffi.AirRestoreLimits
import com.chromvoid.air.ffi.AirImportLimits
import com.chromvoid.air.ffi.AirImportMode
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ffi.AirEvent
import com.chromvoid.air.ffi.AirEventBatch
import com.chromvoid.air.ffi.AirEventKind
import com.chromvoid.air.ffi.AirPhase
import com.chromvoid.air.ffi.AirSnapshot
import kotlinx.coroutines.channels.Channel
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.SerializationStrategy

/**
 * A runtime that answers only what Rust could answer. It refuses on demand so
 * a test can exercise the refusal path, and it never invents a phase the real
 * state machine would not produce.
 */
internal class FakeSessionRuntime(
    masterConfigured: Boolean = true,
    private val unlockRefusal: String? = null,
) : AirSessionRuntime {
    var current: AirSnapshot = AirSnapshot(
        generation = 1uL,
        sequence = 0uL,
        phase = AirPhase.LOCKED,
        cleanupPending = false,
        masterConfigured = masterConfigured,
    )
        private set

    var lockCount: Int = 0
        private set
    var deactivateCount: Int = 0
        private set
    var setupCalls: Int = 0
        private set

    override fun snapshot(): AirSnapshot = current

    override fun activate(): AirSnapshot = current

    override fun deactivate(): AirSnapshot {
        deactivateCount += 1
        current = current.copy(phase = AirPhase.DEACTIVATING)
        return current
    }

    override fun lock(): AirSnapshot {
        lockCount += 1
        current = current.copy(phase = AirPhase.LOCKED, generation = current.generation + 1uL)
        return current
    }

    override fun shutdown(): AirSnapshot {
        current = current.copy(phase = AirPhase.CLOSED)
        return current
    }

    override fun recordUserActivity(generation: ULong) = Unit

    /** Every inactivity length the runtime was given, as (generation, seconds). */
    val autoLockCalls: MutableList<Pair<ULong, ULong>> = mutableListOf()

    override fun setAutoLockTimeout(generation: ULong, seconds: ULong) {
        if (generation != current.generation) throw BridgeException.SessionRevoked()
        autoLockCalls += generation to seconds
    }

    private val pushed = Channel<AirSnapshot>(Channel.UNLIMITED)

    /** Rust changes the session without being asked, as an inactivity lock would. */
    fun lockFromRust() {
        current = current.copy(
            phase = AirPhase.LOCKED,
            generation = current.generation + 1uL,
            sequence = current.sequence + 1uL,
        )
        pushed.trySend(current)
    }

    // Like the real runtime, this waits until something happens.
    override suspend fun events(afterSequence: ULong): AirEventBatch {
        val snapshot = pushed.receive()
        return AirEventBatch(snapshot, listOf(AirEvent(snapshot, AirEventKind.LIFECYCLE)), gap = false)
    }

    override suspend fun setupAdministrator(password: String) {
        setupCalls += 1
        current = current.copy(masterConfigured = true)
    }

    override suspend fun unlock(password: String) {
        unlockRefusal?.let { throw CoreRefusal(it, "vault:unlock") }
        current = current.copy(phase = AirPhase.UNLOCKED)
    }

    // No session test sends a vault command. Answering with an empty success
    // would let a test pass on data Core never produced, so it refuses.
    override suspend fun <Request, Response> perform(
        command: String,
        request: Request,
        requestSerializer: SerializationStrategy<Request>,
        responseSerializer: DeserializationStrategy<Response>,
        phase: AirPhase,
        generation: ULong?,
    ): Response = throw UnsupportedOperationException("FakeSessionRuntime does not answer $command")

    override fun credentialImportLimits(): AirImportLimits =
        AirImportLimits(totalBytes = 16uL shl 20, chunkBytes = 64uL shl 10)

    override suspend fun prepareStorageBackup(masterPassword: String, generation: ULong): StorageBackupTransfer =
        throw BridgeException.InvalidBackupState()

    override fun storageRestoreLimits(): AirRestoreLimits = AirRestoreLimits(chunkBytes = 1uL, artifacts = emptyList())

    override fun beginStorageRestore(generation: ULong): StorageRestoreTransfer =
        throw BridgeException.InvalidRestoreState()

    override fun beginStorageErase(generation: ULong): StorageEraseTransfer =
        throw BridgeException.InvalidEraseState()

    override fun beginCredentialImport(
        byteCount: ULong,
        mode: AirImportMode,
        generation: ULong,
    ): CredentialImportTransfer = throw BridgeException.InvalidImportState()

    override suspend fun exportCredentialDocument(generation: ULong): ByteArray =
        throw CoreRefusal("VAULT_REQUIRED", "passmanager:root:export")

    override fun fileTransferLimits(): AirFileLimits = error("not used")

    override fun beginFileWrite(target: AirFileWriteTarget, generation: ULong): FileWriteTransfer = error("not used")

    override fun beginFileRead(nodeId: Long, generation: ULong): FileReadTransfer = error("not used")

    override fun derivativeLimitBytes(): Long = error("not used")

    override suspend fun saveDocument(
        nodeId: Long,
        sourceRevision: Long,
        bytes: ByteArray,
        generation: ULong,
    ): com.chromvoid.air.bridge.wire.CatalogFileReplaceResponse = error("not used")

    override suspend fun derivative(
        nodeId: Long,
        sourceRevision: Long,
        tier: String,
        ensure: Boolean,
        generation: ULong,
    ): ByteArray = error("not used")

    override suspend fun clearCredentials(generation: ULong): Unit =
        throw CoreRefusal("VAULT_REQUIRED", "passmanager:root:import")
}
