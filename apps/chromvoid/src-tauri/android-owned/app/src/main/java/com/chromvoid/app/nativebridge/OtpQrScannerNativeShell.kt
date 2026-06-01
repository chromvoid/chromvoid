package com.chromvoid.app.nativebridge

import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.annotation.VisibleForTesting
import com.chromvoid.app.BuildConfig
import com.chromvoid.app.OtpQrScannerActivity
import com.chromvoid.app.shared.NativeRuntimeLoader
import com.chromvoid.app.shared.TracePrivacy
import java.lang.ref.WeakReference

internal object OtpQrScannerNativeShell {
    const val RESULT_SUCCESS = "success"
    const val RESULT_CANCELLED = "cancelled"
    const val RESULT_PERMISSION_DENIED = "permission_denied"
    const val RESULT_UNAVAILABLE = "unavailable"
    const val RESULT_INVALID = "invalid"

    const val START_OK = 0
    const val START_INVALID_SCAN_ID = 1
    const val START_DUPLICATE = 2
    const val START_FAILED = 3

    private const val TAG = "ChromVoid/OtpQrScanner"

    @Volatile private var activeScanId: String? = null
    @Volatile private var activeActivityRef: WeakReference<OtpQrScannerActivity>? = null

    @VisibleForTesting
    internal var resultHandlerForTests: ((String, String, String, String) -> Boolean)? = null

    @JvmStatic
    fun startScan(
        context: Context,
        scanId: String,
    ): Int {
        if (scanId.isBlank()) return START_INVALID_SCAN_ID

        synchronized(this) {
            val active = activeScanId
            if (active != null) return START_DUPLICATE
            activeScanId = scanId
        }

        val intent =
            Intent(context, OtpQrScannerActivity::class.java)
                .putExtra(OtpQrScannerActivity.EXTRA_SCAN_ID, scanId)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)

        return runCatching {
            startIntentForExternalAction(context, intent)
            trace("start_intent_sent", "scanId" to redactIdentifier(scanId))
            START_OK
        }.getOrElse { error ->
            Log.w(TAG, "Failed to start OTP QR scanner", error)
            synchronized(this) {
                if (activeScanId == scanId) activeScanId = null
            }
            START_FAILED
        }
    }

    @JvmStatic
    fun cancelScan(scanId: String): Boolean {
        if (scanId.isBlank() || activeScanId != scanId) return false

        val activity = activeActivityRef?.get()
        if (activity != null && !activity.isFinishing && !activity.isDestroyed) {
            activity.runOnUiThread {
                activity.finishCancelledFromNative()
            }
            return true
        }

        return handleActivityResult(scanId, RESULT_CANCELLED)
    }

    internal fun bindActivity(
        activity: OtpQrScannerActivity,
        scanId: String,
    ): Boolean {
        if (scanId.isBlank()) return false
        synchronized(this) {
            if (activeScanId != scanId) return false
            activeActivityRef = WeakReference(activity)
        }
        return true
    }

    internal fun releaseActivity(
        activity: OtpQrScannerActivity,
        scanId: String,
    ) {
        synchronized(this) {
            if (activeScanId == scanId && activeActivityRef?.get() === activity) {
                activeActivityRef = null
            }
        }
    }

    internal fun handleActivityResult(
        scanId: String,
        status: String,
        value: String = "",
        message: String = "",
    ): Boolean {
        if (scanId.isBlank()) return false

        synchronized(this) {
            if (activeScanId != scanId) return false
            activeScanId = null
            activeActivityRef = null
        }

        val safeStatus =
            when (status) {
                RESULT_SUCCESS,
                RESULT_CANCELLED,
                RESULT_PERMISSION_DENIED,
                RESULT_UNAVAILABLE,
                RESULT_INVALID,
                -> status
                else -> RESULT_INVALID
            }

        trace(
            "scan_result",
            "scanId" to redactIdentifier(scanId),
            "status" to safeStatus,
            "hasValue" to value.isNotBlank(),
            "message" to message,
        )

        resultHandlerForTests?.let { handler ->
            return handler(scanId, safeStatus, sanitizeResultValue(value), sanitizeResultValue(message))
        }
        return NativeRuntimeLoader.callWhenLoaded(TAG, false) {
            nativeOnOtpQrScanResult(
                scanId,
                safeStatus,
                sanitizeResultValue(value),
                sanitizeResultValue(message),
            )
        }
    }

    @VisibleForTesting
    internal fun activeScanIdForTests(): String? = activeScanId

    @VisibleForTesting
    internal fun sanitizeResultValue(value: String?): String = value?.replace('\u0000', ' ')?.trim().orEmpty()

    @VisibleForTesting
    internal fun resetForTests() {
        activeScanId = null
        activeActivityRef = null
        resultHandlerForTests = null
    }

    @JvmStatic
    private external fun nativeOnOtpQrScanResult(
        scanId: String,
        status: String,
        value: String,
        message: String,
    ): Boolean

    private fun trace(event: String, vararg fields: Pair<String, Any?>) {
        if (!BuildConfig.DEBUG) return

        val suffix =
            fields.joinToString(" ") { (key, value) ->
                "$key=${TracePrivacy.traceValue(value)}"
            }
        Log.i(TAG, "event=$event $suffix")
    }

    private fun redactIdentifier(value: String?): String? = TracePrivacy.redactIdentifier(value)
}
