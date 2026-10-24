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
import java.nio.ByteBuffer

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class ImageDerivativeNativeShellTest {
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

        val result = ImageDerivativeNativeShell.decodePreview(buffer(sourceBytes), 4, TIER_PREVIEW)

        assertEquals(null, result.failure)
        assertEquals("image/png", result.mimeType)
        val bytes = checkNotNull(result.bytes)
        assertTrue(bytes.isNotEmpty())

        val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        assertNotNull(decoded)
        assertEquals(4, decoded.width)
        assertEquals(4, decoded.height)
        decoded.recycle()
    }

    @Test
    @Config(sdk = [Build.VERSION_CODES.R])
    fun decodePreview_usesPngForThumbnailTierOnApi30() {
        val sourceBytes = encodePng(Bitmap.createBitmap(8, 4, Bitmap.Config.ARGB_8888))

        val result = ImageDerivativeNativeShell.decodePreview(buffer(sourceBytes), 4, TIER_THUMBNAIL)

        assertEquals(null, result.failure)
        assertEquals("image/png", result.mimeType)
        val bytes = checkNotNull(result.bytes)

        val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        assertNotNull(decoded)
        assertEquals(4, decoded.width)
        assertEquals(2, decoded.height)
        decoded.recycle()
    }

    @Test
    fun decodePreview_rejectsInvalidRequestedEdge() {
        val sourceBytes = encodePng(Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888))

        val result = ImageDerivativeNativeShell.decodePreview(buffer(sourceBytes), 0, TIER_PREVIEW)

        assertEquals(null, result.bytes)
        assertTrue(result.failure?.contains("Image derivative max edge exceeds policy") == true)
    }

    /**
     * The source as a buffer. Rust hands a direct one, which Robolectric's image decoder cannot read;
     * the device test covers that path.
     */
    private fun buffer(bytes: ByteArray): ByteBuffer = ByteBuffer.wrap(bytes)

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
