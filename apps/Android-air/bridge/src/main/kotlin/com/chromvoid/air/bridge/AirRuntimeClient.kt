package com.chromvoid.air.bridge

import android.content.Context
import com.chromvoid.air.bridge.wire.CatalogFileReplaceResponse
import com.chromvoid.air.bridge.wire.PassmanagerRootImportRequest
import com.chromvoid.air.ffi.AirDerivative
import com.chromvoid.air.ffi.AirEventBatch
import com.chromvoid.air.ffi.AirExecution
import com.chromvoid.air.ffi.AirExport
import com.chromvoid.air.ffi.AirFileLimits
import com.chromvoid.air.ffi.AirFileWriteTarget
import com.chromvoid.air.ffi.AirHostInterface
import com.chromvoid.air.ffi.AirImportLimits
import com.chromvoid.air.ffi.AirImportMode
import com.chromvoid.air.ffi.AirNative
import com.chromvoid.air.ffi.AirPhase
import com.chromvoid.air.ffi.AirReply
import com.chromvoid.air.ffi.AirRestoreLimits
import com.chromvoid.air.ffi.AirRuntime
import com.chromvoid.air.ffi.AirSnapshot
import com.chromvoid.air.ffi.BridgeException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.DeserializationStrategy
import kotlinx.serialization.SerializationStrategy
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.serializer

/**
 * What the application is allowed to ask of the native runtime.
 *
 * The seam exists so presentation can be tested without a device or a native
 * library. It is not a second contract: the only production implementation is
 * [AirRuntimeClient], and a fake may not answer anything Rust would refuse.
 */
public interface AirSessionRuntime {
    public fun snapshot(): AirSnapshot

    public fun activate(): AirSnapshot

    public fun deactivate(): AirSnapshot

    public fun lock(): AirSnapshot

    public fun shutdown(): AirSnapshot

    public fun recordUserActivity(generation: ULong)

    /** The inactivity lock's length for the whole runtime; zero turns it off. */
    public fun setAutoLockTimeout(generation: ULong, seconds: ULong)

    public suspend fun events(afterSequence: ULong): AirEventBatch

    /**
     * The runtime's one host controller, created without starting anything.
     * It serves this device's vault to trusted computers; Rust owns its
     * trust, protocol and lifetime, and a deactivation pauses it.
     */
    public fun host(): AirHostInterface = throw BridgeException.HostUnavailable()

    public suspend fun setupAdministrator(password: String)

    public suspend fun unlock(password: String)

    /**
     * Run one command with a typed request and decode its typed result.
     *
     * Throws [CoreRefusal] when Core refuses, [WireContractViolation] when the
     * reply does not match the generated contract, and a [BridgeException]
     * when the session moved on while the command was in flight.
     */
    public suspend fun <Request, Response> perform(
        command: String,
        request: Request,
        requestSerializer: SerializationStrategy<Request>,
        responseSerializer: DeserializationStrategy<Response>,
        phase: AirPhase,
        generation: ULong? = null,
    ): Response

    /** How large one credential import may be, and the chunk size Rust accepts. */
    public fun credentialImportLimits(): AirImportLimits

    /** Opens a Rust-owned import buffer of exactly [byteCount] bytes. */
    /**
     * Prepares a backup of the whole storage. It is admitted while the vault
     * is locked as well as open: a backup is device administration, and the
     * administrative password is what authorizes it.
     */
    public suspend fun prepareStorageBackup(masterPassword: String, generation: ULong): StorageBackupTransfer

    public fun beginCredentialImport(
        byteCount: ULong,
        mode: AirImportMode,
        generation: ULong,
    ): CredentialImportTransfer

    /** The files a backup consists of, in the order Core takes them, and the chunk size it accepts. */
    public fun storageRestoreLimits(): AirRestoreLimits

    /**
     * Begins restoring a backup into empty storage. Like a backup it is
     * device administration: admitted locked, open or before the first setup.
     */
    public fun beginStorageRestore(generation: ULong): StorageRestoreTransfer

    /**
     * Begins deleting all local data: review first, then a commit the
     * administrative password confirms. Admitted locked or open.
     */
    public fun beginStorageErase(generation: ULong): StorageEraseTransfer

    /** The credential export document, read in full under one generation. */
    public suspend fun exportCredentialDocument(generation: ULong): ByteArray

    /** Chunk sizes for file reads and writes, and the largest document the editor takes. */
    public fun fileTransferLimits(): AirFileLimits

    /**
     * Opens the create-only writer for one new catalog file. A destination is
     * a catalog folder and a name, never a device path; Core refuses a taken name.
     */
    public fun beginFileWrite(target: AirFileWriteTarget, generation: ULong): FileWriteTransfer

    /** Opens a reader of one catalog file, pinned to its current revision. */
    public fun beginFileRead(nodeId: Long, generation: ULong): FileReadTransfer

    /**
     * Replaces a document's text, naming the revision it was read at; Core
     * refuses with `ERR_STALE_SOURCE` when the file changed since.
     */
    public suspend fun saveDocument(
        nodeId: Long,
        sourceRevision: Long,
        bytes: ByteArray,
        generation: ULong,
    ): CatalogFileReplaceResponse

    /** The largest derivative Core returns. */
    public fun derivativeLimitBytes(): Long

    /** A stored image derivative of [tier] (`preview` or `thumbnail`); [ensure] makes a missing one first. */
    public suspend fun derivative(
        nodeId: Long,
        sourceRevision: Long,
        tier: String,
        ensure: Boolean,
        generation: ULong,
    ): ByteArray

    /** Replaces the credentials with nothing; an explicit, confirmed destruction. */
    public suspend fun clearCredentials(generation: ULong)
}

/**
 * The phase device administration runs in: locked or open, as Core admits it.
 * Anything else is a session that has gone.
 */
public fun AirSessionRuntime.administrationPhase(): AirPhase {
    val phase = snapshot().phase
    if (phase != AirPhase.LOCKED && phase != AirPhase.UNLOCKED) throw BridgeException.SessionRevoked()
    return phase
}

/** [AirSessionRuntime.perform] with the serializers taken from the types. */
public suspend inline fun <reified Request, reified Response> AirSessionRuntime.perform(
    command: String,
    request: Request,
    phase: AirPhase,
    generation: ULong? = null,
): Response = perform(command, request, serializer<Request>(), serializer<Response>(), phase, generation)

/**
 * The one client over the native runtime.
 *
 * Rust owns the session, the storage and every domain rule; this class owns
 * request ordering, the dispatcher the blocking calls run on, and the mapping
 * from coroutine cancellation to the runtime's explicit cancellation. It holds
 * no vault state of its own, so nothing here can outlive a lock.
 */
public class AirRuntimeClient internal constructor(
    private val runtime: AirRuntime,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : AirSessionRuntime, AutoCloseable {
    private val requestIds = Mutex()
    private var nextRequestId: ULong = 0uL

    override fun snapshot(): AirSnapshot = runtime.snapshot()

    override fun activate(): AirSnapshot = runtime.activate()

    override fun deactivate(): AirSnapshot = runtime.deactivate()

    override fun lock(): AirSnapshot = runtime.lock()

    override fun shutdown(): AirSnapshot = runtime.shutdown()

    /**
     * Shuts the session down and frees the native runtime, which releases the
     * process's single runtime slot. Rust counts a runtime, an export or an
     * import as live for as long as Kotlin holds its handle, and a Kotlin handle
     * is otherwise freed only when the garbage collector gets to it; Swift's
     * reference counting frees them at once, Kotlin has to say so.
     */
    override fun close() {
        runCatching { runtime.shutdown() }
        runtime.close()
    }

    override fun recordUserActivity(generation: ULong): Unit = runtime.recordUserActivity(generation)

    override fun host(): AirHostInterface = runtime.host()

    override fun setAutoLockTimeout(generation: ULong, seconds: ULong): Unit =
        runtime.setAutoLockTimeout(generation, seconds)

    override suspend fun events(afterSequence: ULong): AirEventBatch =
        withContext(dispatcher) { runtime.events(afterSequence) }

    // Neither command has a generated request type; iOS sends the same fields.
    override suspend fun setupAdministrator(password: String) {
        perform<JsonObject, JsonElement>("master:setup", fields("master_password" to password), AirPhase.LOCKED)
    }

    override suspend fun unlock(password: String) {
        perform<JsonObject, JsonElement>("vault:unlock", fields("password" to password), AirPhase.LOCKED)
    }

    /**
     * The phase and generation are checked before the request is admitted and
     * again after the reply arrives: a lock that happens mid-flight revokes the
     * answer instead of delivering it into a locked session.
     */
    override suspend fun <Request, Response> perform(
        command: String,
        request: Request,
        requestSerializer: SerializationStrategy<Request>,
        responseSerializer: DeserializationStrategy<Response>,
        phase: AirPhase,
        generation: ULong?,
    ): Response {
        val body = WireEnvelope.encode(command, request, requestSerializer)
        val payload = execute(phase, generation) { requestId, admitted ->
            runtime.beginExecute(requestId, admitted, body)
        }
        return WireEnvelope.decode(command, payload, responseSerializer)
    }

    /** How much a credential import may carry, and in what chunk size. */
    override fun credentialImportLimits(): AirImportLimits = runtime.credentialImportLimits()

    /**
     * Opens a Rust-owned import buffer of exactly [byteCount] bytes. The
     * document is never modelled here: bytes go in, a Core preview comes out.
     */
    override suspend fun prepareStorageBackup(masterPassword: String, generation: ULong): StorageBackupTransfer {
        val phase = administrationPhase()
        val handle = runtime.beginStorageBackup(generation)
        try {
            step("storage:backup:prepare", phase, generation) { requestId, _ ->
                handle.beginPrepare(requestId, masterPassword)
            }
        } catch (error: Throwable) {
            withContext(NonCancellable) { runCatching { handle.cancelAndWait() } }
            handle.close()
            throw error
        }
        return StorageBackupTransfer(this, handle, generation, phase)
    }

    override fun storageRestoreLimits(): AirRestoreLimits = runtime.storageRestoreLimits()

    override fun beginStorageRestore(generation: ULong): StorageRestoreTransfer {
        administrationPhase()
        return StorageRestoreTransfer(this, runtime.beginStorageRestore(generation), generation)
    }

    override fun beginStorageErase(generation: ULong): StorageEraseTransfer {
        administrationPhase()
        return StorageEraseTransfer(this, runtime.beginStorageErase(generation), generation)
    }

    override fun fileTransferLimits(): AirFileLimits = runtime.fileTransferLimits()

    override fun beginFileWrite(target: AirFileWriteTarget, generation: ULong): FileWriteTransfer =
        FileWriteTransfer(this, runtime.beginFileWriter(generation, target), generation)

    override fun beginFileRead(nodeId: Long, generation: ULong): FileReadTransfer =
        FileReadTransfer(
            this,
            runtime.beginFileReader(generation, nodeId.toULong()),
            generation,
            runtime.fileTransferLimits().readChunkBytes.toLong(),
        )

    override fun beginCredentialImport(
        byteCount: ULong,
        mode: AirImportMode,
        generation: ULong,
    ): CredentialImportTransfer =
        CredentialImportTransfer(this, runtime.beginRootImport(generation, byteCount, mode), generation)

    /**
     * The credential export document, read in full under one generation. A
     * lock or a generation change while reading revokes it rather than
     * returning a copy made across two sessions.
     */
    override suspend fun exportCredentialDocument(generation: ULong): ByteArray =
        runtime.beginRootExport(generation).use { handle ->
            try {
                step("passmanager:root:export", AirPhase.UNLOCKED, generation) { requestId, _ ->
                    handle.beginPrepare(requestId)
                }
                val bytes = withContext(dispatcher) { readAll(handle) }
                val latest = runtime.snapshot()
                if (latest.generation != generation || latest.phase != AirPhase.UNLOCKED || latest.cleanupPending) {
                    throw BridgeException.SessionRevoked()
                }
                bytes
            } finally {
                withContext(NonCancellable) { runCatching { handle.cancel() } }
            }
        }

    /**
     * Clears every credential, and nothing else in storage. Core does it as a
     * destructive replace with an empty document, which is how iOS does it.
     */
    override suspend fun clearCredentials(generation: ULong) {
        val empty = JsonArray(emptyList())
        perform<PassmanagerRootImportRequest, JsonElement>(
            "passmanager:root:import",
            PassmanagerRootImportRequest(allowDestructive = true, entries = empty, folders = empty, mode = "replace"),
            AirPhase.UNLOCKED,
            generation,
        )
    }

    private suspend fun readAll(handle: AirExport): ByteArray {
        val expected = handle.byteCount()
        if (expected > Int.MAX_VALUE.toULong()) throw BridgeException.InvalidExportState()
        val out = java.io.ByteArrayOutputStream(expected.toInt())
        while (true) {
            currentCoroutineContext().ensureActive()
            val chunk = handle.readChunk()
            if (chunk.isEmpty()) break
            out.write(chunk)
        }
        if (out.size().toULong() != expected) throw BridgeException.InvalidExportState()
        return out.toByteArray()
    }

    /**
     * Admits one execution and returns its payload. [begin] receives the
     * reserved request id and the generation the request is admitted under;
     * ordinary commands, import review and commit, and export preparation all
     * pass through here so they share one request sequence and one set of
     * revocation rules.
     */
    /**
     * One step of a transfer handle - prepare, read, append, review, commit -
     * with Core's answer read like any command's: a refusal such as a wrong
     * administrative password is thrown as [CoreRefusal], so a step never
     * passes as done merely because a reply arrived. [name] identifies the
     * step in errors.
     */
    internal suspend fun step(
        name: String,
        phase: AirPhase,
        generation: ULong?,
        begin: (requestId: ULong, generation: ULong) -> AirExecution,
    ): JsonElement = WireEnvelope.decode(name, execute(phase, generation, begin), JsonElement.serializer())

    internal suspend fun execute(
        phase: AirPhase,
        generation: ULong?,
        begin: (requestId: ULong, generation: ULong) -> AirExecution,
    ): ByteArray {
        var execution: AirExecution? = null
        try {
            return admitted(phase, generation, { requestId, admitted ->
                begin(requestId, admitted).also { execution = it }
            }) { it.finish() }.second
        } finally {
            execution?.close()
        }
    }

    override fun derivativeLimitBytes(): Long = runtime.derivativeLimitBytes().toLong()

    override suspend fun saveDocument(
        nodeId: Long,
        sourceRevision: Long,
        bytes: ByteArray,
        generation: ULong,
    ): CatalogFileReplaceResponse {
        val payload = execute(AirPhase.UNLOCKED, generation) { requestId, admitted ->
            runtime.beginDocumentSave(requestId, admitted, nodeId.toULong(), sourceRevision.toULong(), bytes)
        }
        return WireEnvelope.decode(DOCUMENT_SAVE, payload, CatalogFileReplaceResponse.serializer())
    }

    /**
     * A stored image derivative: Core's metadata comes back in the reply and
     * the bytes wait in the handle, taken once. With [ensure] Core converts and
     * stores a missing one first; without it a missing one is Core's refusal.
     */
    override suspend fun derivative(
        nodeId: Long,
        sourceRevision: Long,
        tier: String,
        ensure: Boolean,
        generation: ULong,
    ): ByteArray {
        var handle: AirDerivative? = null
        try {
            val (derivative, payload) = admitted(AirPhase.UNLOCKED, generation, { requestId, admitted ->
                runtime.beginDerivative(requestId, admitted, nodeId.toULong(), sourceRevision.toULong(), tier, ensure)
                    .also { handle = it }
            }) { it.finish() }
            WireEnvelope.decode(DERIVATIVE, payload, JsonElement.serializer())
            // take_bytes checks Rust's authority again; nothing suspends between the two.
            return derivative.takeBytes()
        } finally {
            handle?.close()
        }
    }

    /**
     * Admits one request, waits for its reply and checks the session did not
     * move on meanwhile. [begin] receives the reserved request id and the
     * generation the request is admitted under; the handle it returns stays
     * the caller's to close.
     */
    private suspend fun <H> admitted(
        phase: AirPhase,
        generation: ULong?,
        begin: (requestId: ULong, generation: ULong) -> H,
        finish: suspend (H) -> AirReply,
    ): Pair<H, ByteArray> = withContext(dispatcher) {
        val current = runtime.snapshot()
        if (current.phase != phase ||
            current.cleanupPending ||
            (generation != null && generation != current.generation)
        ) {
            throw BridgeException.SessionRevoked()
        }
        val (requestId, handle) = admit { requestId -> begin(requestId, current.generation) }
        val reply = try {
            finish(handle)
        } catch (cancellation: CancellationException) {
            // The runtime keeps the identifier until it is told to drop it, so
            // the cancellation has to reach Rust even while unwinding.
            withContext(NonCancellable) { runtime.cancel(requestId) }
            throw cancellation
        }
        val latest = runtime.snapshot()
        val stillAdmissible = reply.requestId == requestId &&
            reply.generation == current.generation &&
            latest.generation == current.generation &&
            (latest.phase == phase || (phase == AirPhase.LOCKED && latest.phase == AirPhase.UNLOCKED))
        if (!stillAdmissible) {
            throw BridgeException.SessionRevoked()
        }
        handle to reply.payload
    }

    /**
     * Rust admits a request only when its identifier is above every one it has
     * admitted, so an identifier is taken and handed to Rust under one lock:
     * reserved first and admitted later, a slower caller would arrive after a
     * faster one's higher identifier and be refused.
     */
    private suspend fun <T> admit(begin: (requestId: ULong) -> T): Pair<ULong, T> = requestIds.withLock {
        if (nextRequestId == ULong.MAX_VALUE) {
            runtime.shutdown()
            throw BridgeException.InvalidRequestId()
        }
        nextRequestId += 1uL
        nextRequestId to begin(nextRequestId)
    }

    public companion object {
        private const val DERIVATIVE = "catalog:derivative"
        private const val DOCUMENT_SAVE = "catalog:document:save"
        internal const val STORAGE_ROOT_NAME: String = "ChromVoidAir"

        /** Also works when construction refused to open Core during adoption. */
        public fun checkAppResetAllowed(context: Context) {
            AirNative.initialize(context)
            com.chromvoid.air.ffi.checkAppResetAllowed(
                BuildFingerprint.EXPECTED,
                context.filesDir.resolve(STORAGE_ROOT_NAME).absolutePath,
            )
        }

        /**
         * Opens the one runtime this process may own. The path is a
         * convenience: Rust re-derives what is permissible from the package
         * identity the kernel reports, so a wrong path is refused, not obeyed.
         */
        public suspend fun open(
            context: Context,
            dispatcher: CoroutineDispatcher = Dispatchers.IO,
        ): AirRuntimeClient = withContext(dispatcher) {
            AirNative.initialize(context)
            val root = context.filesDir.resolve(STORAGE_ROOT_NAME).absolutePath
            AirRuntimeClient(AirRuntime(BuildFingerprint.EXPECTED, root), dispatcher)
        }
    }
}
