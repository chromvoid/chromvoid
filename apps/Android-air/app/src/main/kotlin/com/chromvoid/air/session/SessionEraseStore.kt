package com.chromvoid.air.session

import com.chromvoid.air.bridge.AirSessionRuntime
import com.chromvoid.air.bridge.StorageEraseTransfer
import com.chromvoid.air.bridge.StorageEraseUnconfirmed
import com.chromvoid.air.ffi.AirEraseReceipt
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.maintenance.EraseOutcome
import com.chromvoid.air.ui.maintenance.EraseReview
import com.chromvoid.air.ui.maintenance.EraseStore
import com.chromvoid.air.ui.maintenance.EraseUnconfirmed

/** Deleting the local data of whatever session is current, as the screens see it. */
internal class SessionEraseStore(private val runtime: () -> AirSessionRuntime?) : EraseStore {
    override suspend fun reviewErase(generation: ULong): EraseReview {
        val session = runtime() ?: throw BridgeException.SessionRevoked()
        val transfer = session.beginStorageErase(generation)
        transfer.review()
        return Review(transfer)
    }

    private class Review(private val transfer: StorageEraseTransfer) : EraseReview {
        override suspend fun commit(masterPassword: String): EraseOutcome = try {
            when (transfer.commit(masterPassword)) {
                is AirEraseReceipt.Completed -> EraseOutcome.COMPLETED
                is AirEraseReceipt.Incomplete -> EraseOutcome.INCOMPLETE
            }
        } catch (unconfirmed: StorageEraseUnconfirmed) {
            throw EraseUnconfirmed()
        }

        override fun cancel(): Unit = transfer.cancel()
    }
}
