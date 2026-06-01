package com.chromvoid.app

internal object OtpQrBarcodeResultExtractor {
    fun firstNonBlankRawValue(rawValues: Iterable<String?>): String? {
        return rawValues.firstNotNullOfOrNull { rawValue ->
            rawValue?.trim()?.takeIf { it.isNotEmpty() }
        }
    }
}
