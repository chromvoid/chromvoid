package com.chromvoid.app

import android.content.Intent
import android.util.Log

internal object AndroidShareImportDiagnostics {
    const val TAG = "ChromVoidShare"

    fun describeShareInputs(intent: Intent?): String =
        listOf(
            "hasStream=${intent?.hasExtra(Intent.EXTRA_STREAM) == true}",
            "hasData=${intent?.data != null}",
            "dataScheme=${intent?.data?.scheme.orEmpty()}",
            "clipItems=${intent?.clipData?.itemCount ?: 0}",
        ).joinToString(" ")

    fun log(
        event: String,
        details: String = "",
    ) {
        val suffix = if (details.isBlank()) "" else " $details"
        Log.i(TAG, "event=$event$suffix")
    }
}
