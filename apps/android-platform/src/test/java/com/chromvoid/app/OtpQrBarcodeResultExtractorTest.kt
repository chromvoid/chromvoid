package com.chromvoid.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class OtpQrBarcodeResultExtractorTest {
    @Test
    fun returnsNullWhenAllValuesAreMissingOrBlank() {
        val result = OtpQrBarcodeResultExtractor.firstNonBlankRawValue(listOf(null, "", "   "))

        assertNull(result)
    }

    @Test
    fun trimsAndReturnsFirstNonBlankValue() {
        val result =
            OtpQrBarcodeResultExtractor.firstNonBlankRawValue(
                listOf(null, "  otpauth://totp/Test?secret=ABC  ", "second"),
            )

        assertEquals("otpauth://totp/Test?secret=ABC", result)
    }

    @Test
    fun preservesFirstNonBlankValueWhenMultipleValuesExist() {
        val result = OtpQrBarcodeResultExtractor.firstNonBlankRawValue(listOf("first", "second"))

        assertEquals("first", result)
    }
}
