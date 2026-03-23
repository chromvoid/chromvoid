package com.chromvoid.app

import android.util.Log
import android.view.autofill.AutofillId
import com.chromvoid.app.autofill.AutofillFocusedFieldCandidate
import com.chromvoid.app.autofill.AutofillOtpCandidate
import com.chromvoid.app.shared.AndroidRuntimeAccess
import java.io.File

internal object AutofillTrace {
    const val TAG = "ChromVoidAutofill"
    private const val TRACE_FILE_NAME = "autofill-trace.log"
    private const val MAX_TRACE_FILE_BYTES = 256 * 1024L
    private const val MAX_SUMMARY_ITEMS = 12
    private const val MAX_SUMMARY_TEXT_LENGTH = 96

    fun event(name: String, vararg fields: Pair<String, Any?>) {
        log(name = name, force = false, level = "I", fields = fields)
    }

    fun important(name: String, vararg fields: Pair<String, Any?>) {
        log(name = name, force = true, level = "W", fields = fields)
    }

    private fun log(
        name: String,
        force: Boolean,
        level: String,
        fields: Array<out Pair<String, Any?>>,
    ) {
        if (!BuildConfig.DEBUG) {
            return
        }
        if (!force) {
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
        when (level) {
            "W" -> Log.w(TAG, message)
            "E" -> Log.e(TAG, message)
            else -> Log.i(TAG, message)
        }
        appendToTraceFile(level = level, message = message)
    }

    fun id(autofillId: AutofillId?): String? = autofillId?.toString()

    fun ids(ids: List<AutofillId>): String = ids.joinToString(prefix = "[", postfix = "]") { it.toString() }

    fun otpCandidates(candidates: List<AutofillOtpCandidate>): String =
        summarizeStrings(
            candidates.map { candidate ->
                buildString {
                    append(candidate.autofillId)
                    append("|p=")
                    append(candidate.parentPath)
                    append("|o=")
                    append(candidate.order)
                    append("|v=")
                    append(candidate.visible)
                    append("|f=")
                    append(candidate.fillable)
                    append("|x=")
                    append(candidate.focused)
                }
            },
        )

    fun focusedCandidates(candidates: List<AutofillFocusedFieldCandidate>): String =
        summarizeStrings(
            candidates.map { candidate ->
                buildString {
                    append(candidate.autofillId)
                    append("|p=")
                    append(candidate.parentPath)
                    append("|o=")
                    append(candidate.order)
                    append("|v=")
                    append(candidate.visible)
                    append("|f=")
                    append(candidate.fillable)
                    append("|x=")
                    append(candidate.focused)
                }
            },
        )

    fun pageHints(hints: List<String>): String =
        summarizeStrings(
            hints.map { hint ->
                hint
                    .replace('\n', ' ')
                    .trim()
                    .take(MAX_SUMMARY_TEXT_LENGTH)
            },
        )

    @Synchronized
    private fun appendToTraceFile(
        level: String,
        message: String,
    ) {
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
                    append(" level=")
                    append(level)
                    append(' ')
                    append(message)
                    append('\n')
                },
            )
        }
    }

    private fun summarizeStrings(items: List<String>): String {
        if (items.isEmpty()) {
            return "[]"
        }
        val displayItems = items.take(MAX_SUMMARY_ITEMS)
        return buildString {
            append('[')
            append(
                displayItems.joinToString(", ") { item ->
                    if (item.length <= MAX_SUMMARY_TEXT_LENGTH) {
                        item
                    } else {
                        item.take(MAX_SUMMARY_TEXT_LENGTH) + "..."
                    }
                },
            )
            if (items.size > displayItems.size) {
                append(", ...+")
                append(items.size - displayItems.size)
            }
            append(']')
        }
    }
}
