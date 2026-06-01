package com.chromvoid.app.passkey

import android.util.Log
import com.chromvoid.app.BuildConfig
import com.chromvoid.app.shared.AndroidRuntimeAccess
import java.io.File

internal object PasskeyTrace {
    private const val TAG = "ChromVoidPasskey"
    private const val TRACE_FILE_NAME = "passkey-trace.log"
    private const val MAX_TRACE_FILE_BYTES = 256 * 1024L

    fun important(name: String, vararg fields: Pair<String, Any?>) {
        log(name = name, fields = fields, logcat = true)
    }

    fun diagnostic(name: String, vararg fields: Pair<String, Any?>) {
        log(name = name, fields = fields, logcat = true, force = true)
    }

    fun file(name: String, vararg fields: Pair<String, Any?>) {
        log(name = name, fields = fields, logcat = false)
    }

    private fun log(
        name: String,
        fields: Array<out Pair<String, Any?>>,
        logcat: Boolean,
        force: Boolean = false,
    ) {
        if (!BuildConfig.DEBUG && !force) {
            return
        }

        val suffix =
            fields.joinToString(" ") { (key, value) ->
                "$key=${value?.toString()?.replace('\n', ' ') ?: "null"}"
            }
        val message =
            if (suffix.isBlank()) {
                "event=$name"
            } else {
                "event=$name $suffix"
            }

        if (logcat) {
            Log.w(TAG, message)
        }
        appendToTraceFile(message)
    }

    @Synchronized
    private fun appendToTraceFile(message: String) {
        val context = AndroidRuntimeAccess.applicationContextOrNull() ?: return
        runCatching {
            val traceFile = File(context.filesDir, TRACE_FILE_NAME)
            if (traceFile.exists() && traceFile.length() > MAX_TRACE_FILE_BYTES) {
                traceFile.writeText("")
            }
            traceFile.appendText(
                buildString {
                    append("ts=")
                    append(System.currentTimeMillis())
                    append(' ')
                    append(message)
                    append('\n')
                },
            )
        }
    }
}
