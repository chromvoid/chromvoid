package com.chromvoid.app.nativebridge

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.ByteArrayOutputStream

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class HeifPreviewNativeShellTest {
    private companion object {
        const val TIER_THUMBNAIL = 0
        const val TIER_PREVIEW = 1
    }

    @Test
    fun decodePreview_usesPngFallbackOnApi29() {
        assertEquals(Build.VERSION_CODES.Q, Build.VERSION.SDK_INT)
        val sourceBytes = encodePng(
            Bitmap.createBitmap(4, 4, Bitmap.Config.ARGB_8888).apply {
                setPixel(0, 0, 0x66010203)
                setPixel(1, 0, 0xFF102030.toInt())
            },
        )

        val result = HeifPreviewNativeShell.decodePreview(sourceBytes, 4, TIER_PREVIEW)

        assertNotNull(result)
        assertEquals(null, HeifPreviewNativeShell.getLastDecodeFailure())
        assertEquals("image/png", result?.mimeType)
        assertEquals("png", result?.fileExtension)
        assertTrue(result!!.bytes.isNotEmpty())

        val decoded = BitmapFactory.decodeByteArray(result.bytes, 0, result.bytes.size)
        assertNotNull(decoded)
        assertEquals(4, decoded.width)
        assertEquals(4, decoded.height)
        decoded.recycle()
    }

    @Test
    @Config(sdk = [Build.VERSION_CODES.R])
    fun decodePreview_usesPngForThumbnailTierOnApi30() {
        val sourceBytes = encodePng(Bitmap.createBitmap(8, 4, Bitmap.Config.ARGB_8888))

        val result = HeifPreviewNativeShell.decodePreview(sourceBytes, 4, TIER_THUMBNAIL)

        assertNotNull(result)
        assertEquals(null, HeifPreviewNativeShell.getLastDecodeFailure())
        assertEquals("image/png", result?.mimeType)
        assertEquals("png", result?.fileExtension)

        val decoded = BitmapFactory.decodeByteArray(result!!.bytes, 0, result.bytes.size)
        assertNotNull(decoded)
        assertEquals(4, decoded.width)
        assertEquals(2, decoded.height)
        decoded.recycle()
    }

    @Test
    fun decodePreview_rejectsInvalidRequestedEdge() {
        val sourceBytes = encodePng(Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888))

        val result = HeifPreviewNativeShell.decodePreview(sourceBytes, 0, TIER_PREVIEW)

        assertEquals(null, result)
        assertTrue(
            HeifPreviewNativeShell.getLastDecodeFailure()
                ?.contains("Image derivative max edge exceeds policy") == true,
        )
    }

    private fun encodePng(bitmap: Bitmap): ByteArray =
        try {
            ByteArrayOutputStream().use { output ->
                assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, output))
                output.toByteArray()
            }
        } finally {
            bitmap.recycle()
        }
}
