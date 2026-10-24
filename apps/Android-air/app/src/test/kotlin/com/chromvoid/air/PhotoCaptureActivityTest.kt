package com.chromvoid.air

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import java.io.ByteArrayOutputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
public class PhotoCaptureActivityTest {
    @Test
    public fun `a photo the camera did not turn is turned upright and the original cleared`() {
        val landscape = ByteArrayOutputStream().use { out ->
            Bitmap.createBitmap(40, 20, Bitmap.Config.ARGB_8888).compress(Bitmap.CompressFormat.JPEG, 90, out)
            out.toByteArray()
        }

        val upright = PhotoCaptureActivity.turned(landscape, 90)

        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(upright, 0, upright.size, bounds)
        assertEquals(20 to 40, bounds.outWidth to bounds.outHeight)
        assertTrue("the camera's own bytes are cleared", landscape.all { it == 0.toByte() })
    }
}
