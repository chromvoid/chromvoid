package com.chromvoid.app.nativebridge

import android.app.Application
import android.os.Build
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.OtpQrScannerActivity
import com.chromvoid.app.shared.NativeRuntimeLoader
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.UPSIDE_DOWN_CAKE])
class OtpQrScannerNativeShellTest {
    @After
    fun tearDown() {
        OtpQrScannerNativeShell.resetForTests()
        NativeRuntimeLoader.resetForTests()
    }

    @Test
    fun startScan_launchesScannerActivity() {
        val context = ApplicationProvider.getApplicationContext<Application>()

        val result = OtpQrScannerNativeShell.startScan(context, "scan-1")

        val intent = shadowOf(context).nextStartedActivity
        assertEquals(OtpQrScannerNativeShell.START_OK, result)
        assertEquals(OtpQrScannerActivity::class.java.name, intent.component?.className)
        assertEquals("scan-1", intent.getStringExtra(OtpQrScannerActivity.EXTRA_SCAN_ID))
        assertEquals("scan-1", OtpQrScannerNativeShell.activeScanIdForTests())
    }

    @Test
    fun startScan_rejectsBlankAndDuplicateScanIds() {
        val context = ApplicationProvider.getApplicationContext<Application>()

        assertEquals(
            OtpQrScannerNativeShell.START_INVALID_SCAN_ID,
            OtpQrScannerNativeShell.startScan(context, " "),
        )
        assertEquals(OtpQrScannerNativeShell.START_OK, OtpQrScannerNativeShell.startScan(context, "scan-1"))
        assertEquals(
            OtpQrScannerNativeShell.START_DUPLICATE,
            OtpQrScannerNativeShell.startScan(context, "scan-1"),
        )
        assertEquals(
            OtpQrScannerNativeShell.START_DUPLICATE,
            OtpQrScannerNativeShell.startScan(context, "scan-2"),
        )
    }

    @Test
    fun cancelScan_emitsCancelledAndClearsActiveScan() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val captured = mutableListOf<List<String>>()
        OtpQrScannerNativeShell.resultHandlerForTests = { scanId, status, value, message ->
            captured.add(listOf(scanId, status, value, message))
            true
        }

        OtpQrScannerNativeShell.startScan(context, "scan-1")
        val cancelled = OtpQrScannerNativeShell.cancelScan("scan-1")

        assertTrue(cancelled)
        assertNull(OtpQrScannerNativeShell.activeScanIdForTests())
        assertEquals(listOf(listOf("scan-1", OtpQrScannerNativeShell.RESULT_CANCELLED, "", "")), captured)
    }

    @Test
    fun cancelScan_ignoresUnknownScanIds() {
        assertFalse(OtpQrScannerNativeShell.cancelScan("missing"))
    }

    @Test
    fun handleActivityResult_sanitizesPayloadAndEmitsOnlyForActiveScan() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val captured = mutableListOf<List<String>>()
        OtpQrScannerNativeShell.resultHandlerForTests = { scanId, status, value, message ->
            captured.add(listOf(scanId, status, value, message))
            true
        }
        OtpQrScannerNativeShell.startScan(context, "scan-1")

        val emitted =
            OtpQrScannerNativeShell.handleActivityResult(
                scanId = "scan-1",
                status = OtpQrScannerNativeShell.RESULT_SUCCESS,
                value = "  otpauth://totp/Test?secret=ABC\u0000DEF  ",
                message = " done ",
            )

        assertTrue(emitted)
        assertEquals(
            listOf(
                listOf(
                    "scan-1",
                    OtpQrScannerNativeShell.RESULT_SUCCESS,
                    "otpauth://totp/Test?secret=ABC DEF",
                    "done",
                ),
            ),
            captured,
        )
        assertNull(OtpQrScannerNativeShell.activeScanIdForTests())
        assertFalse(
            OtpQrScannerNativeShell.handleActivityResult(
                "scan-1",
                OtpQrScannerNativeShell.RESULT_SUCCESS,
            ),
        )
    }

    @Test
    fun handleActivityResult_mapsUnknownStatusToInvalid() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val captured = mutableListOf<List<String>>()
        OtpQrScannerNativeShell.resultHandlerForTests = { scanId, status, value, message ->
            captured.add(listOf(scanId, status, value, message))
            true
        }
        OtpQrScannerNativeShell.startScan(context, "scan-1")

        OtpQrScannerNativeShell.handleActivityResult("scan-1", "unexpected")

        assertEquals(listOf(listOf("scan-1", OtpQrScannerNativeShell.RESULT_INVALID, "", "")), captured)
    }

    @Test
    fun handleActivityResultWithoutTestHandlerReturnsFalseWhenNativeRuntimeUnavailable() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        NativeRuntimeLoader.setLoadLibraryForTests {
            throw UnsatisfiedLinkError("missing")
        }
        OtpQrScannerNativeShell.startScan(context, "scan-1")

        val emitted =
            OtpQrScannerNativeShell.handleActivityResult(
                scanId = "scan-1",
                status = OtpQrScannerNativeShell.RESULT_SUCCESS,
                value = "otpauth://totp/Test?secret=ABC",
            )

        assertFalse(emitted)
        assertNull(OtpQrScannerNativeShell.activeScanIdForTests())
    }
}
