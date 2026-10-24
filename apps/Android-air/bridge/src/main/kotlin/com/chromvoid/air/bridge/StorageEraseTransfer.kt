package com.chromvoid.air.bridge

import com.chromvoid.air.ffi.AirEraseReceipt
import com.chromvoid.air.ffi.AirStorageErase
import com.chromvoid.air.ffi.BridgeException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext

/** The erase ran, but neither its reply nor Rust's worker could say how it ended. */
public class StorageEraseUnconfirmed : Exception("The deletion result could not be confirmed")

/**
 * Deleting all local data. Core reviews what would be deleted, then deletes
 * it once the administrative password confirms. The confirmation token never
 * leaves Rust, and the outcome comes from Rust's receipt: an erase replaces the
 * session under it, so its reply may never arrive even when it completed.
 */
public class StorageEraseTransfer internal constructor(
    private val client: AirRuntimeClient,
    private val handle: AirStorageErase,
    public val generation: ULong,
) {
    @Volatile
    private var committing = false

    /** Core's review; nothing is deleted by it. */
    public suspend fun review() {
        try {
            client.step("admin:erase:review", client.administrationPhase(), generation) { requestId, _ ->
                handle.beginReview(requestId)
            }
        } catch (error: Throwable) {
            cancel()
            throw error
        }
    }

    /**
     * Deletes everything and returns Rust's receipt. A wrong password is the
     * only refusal that leaves the review usable for another attempt; any
     * other failure asks Rust how the erase ended, and when it cannot say,
     * [StorageEraseUnconfirmed] - never a retry.
     */
    public suspend fun commit(masterPassword: String): AirEraseReceipt {
        // A second caller must not cancel the first one's admitted erase.
        if (committing) throw BridgeException.InvalidEraseState()
        committing = true
        try {
            client.step("admin:erase", client.administrationPhase(), generation) { requestId, _ ->
                handle.beginCommit(requestId, masterPassword)
            }
            return handle.receipt() ?: throw BridgeException.InvalidEraseState()
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (error: Exception) {
            if ((error as? CoreRefusal)?.code == INVALID_MASTER_PASSWORD) throw error
            runCatching { handle.receipt() }.getOrNull()?.let { return it }
            val settled = withContext(NonCancellable) {
                runCatching { handle.cancelAndWait() }
            }
            settled.getOrNull()?.let { return it }
            if (settled.isFailure) {
                // Stopping the worker may come after the deletion; its receipt still stands.
                runCatching { handle.receipt() }.getOrNull()?.let { return it }
                throw StorageEraseUnconfirmed()
            }
            // A worker that stopped without a receipt never began deleting.
            throw error
        } finally {
            committing = false
        }
    }

    /** Drops the review; a receipt already published stays readable. */
    public fun cancel() {
        runCatching { handle.cancel() }
    }

    private companion object {
        const val INVALID_MASTER_PASSWORD = "INVALID_MASTER_PASSWORD"
    }
}
