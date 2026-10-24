package com.chromvoid.air.session

import android.content.Context
import com.chromvoid.air.ui.credentials.OtpScanner
import com.chromvoid.app.nativebridge.OtpQrScannerNativeShell
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.CompletableDeferred

/**
 * The shared platform QR scanner, consumed in Kotlin. The scanner activity
 * owns the camera and its permission; this class starts it and waits for the
 * result it hands to the installed sink. Nothing here reads or keeps the text
 * beyond passing it to Core.
 */
internal class PlatformOtpScanner(private val context: Context) : OtpScanner {
    private val pending = ConcurrentHashMap<String, CompletableDeferred<OtpScanner.Result>>()

    init {
        OtpQrScannerNativeShell.installResultSink { scanId, status, value, _ ->
            pending.remove(scanId)?.complete(result(status, value)) ?: false
        }
    }

    override suspend fun scan(): OtpScanner.Result {
        val scanId = UUID.randomUUID().toString()
        val deferred = CompletableDeferred<OtpScanner.Result>()
        pending[scanId] = deferred
        val started = OtpQrScannerNativeShell.startScan(context.applicationContext, scanId)
        if (started != OtpQrScannerNativeShell.START_OK) {
            pending.remove(scanId)
            return OtpScanner.Result.Unavailable
        }
        return try {
            deferred.await()
        } finally {
            // Leaving the screen cancels the scan; the activity is told to close.
            if (pending.remove(scanId) != null) OtpQrScannerNativeShell.cancelScan(scanId)
        }
    }

    private fun result(status: String, value: String): OtpScanner.Result = when (status) {
        OtpQrScannerNativeShell.RESULT_SUCCESS -> OtpScanner.Result.Scanned(value)
        OtpQrScannerNativeShell.RESULT_CANCELLED -> OtpScanner.Result.Cancelled
        OtpQrScannerNativeShell.RESULT_PERMISSION_DENIED -> OtpScanner.Result.PermissionDenied
        else -> OtpScanner.Result.Unavailable
    }
}
