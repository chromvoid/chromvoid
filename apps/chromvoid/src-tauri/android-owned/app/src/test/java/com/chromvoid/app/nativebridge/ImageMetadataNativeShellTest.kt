package com.chromvoid.app.nativebridge

import android.graphics.Bitmap
import android.media.ExifInterface
import android.os.Build
import java.io.File
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.ByteArrayOutputStream

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class ImageMetadataNativeShellTest {
    @Test
    fun extractMetadata_reportsPngDimensions() {
        val sourceBytes = encodePng(Bitmap.createBitmap(12, 7, Bitmap.Config.ARGB_8888))

        val result = ImageMetadataNativeShell.extractMetadata(sourceBytes)

        val payload = JSONObject(result!!)
        assertEquals(12, payload.getInt("width"))
        assertEquals(7, payload.getInt("height"))
        assertTrue(payload.length() >= 2)
    }

    @Test
    fun extractMetadata_returnsNullForEmptyPayload() {
        val result = ImageMetadataNativeShell.extractMetadata(ByteArray(0))

        assertNull(result)
    }

    @Test
    fun extractMetadata_reportsJpegGps() {
        val sourceBytes = encodeJpegWithGps()

        val result = ImageMetadataNativeShell.extractMetadata(sourceBytes)

        val payload = JSONObject(result!!)
        val gps = payload.getJSONObject("gps")
        val gpsProbe = payload.getJSONObject("gpsProbe")
        assertEquals(55.75833333333333, gps.getDouble("latitude"), 0.00001)
        assertEquals(37.617222222222225, gps.getDouble("longitude"), 0.00001)
        assertEquals(156.4, gps.getDouble("altitudeMeters"), 0.000001)
        assertTrue(gpsProbe.getBoolean("api") || gpsProbe.getBoolean("fallback"))
        assertEquals("ok", gpsProbe.getString("selectedStatus"))
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

    private fun encodeJpegWithGps(): ByteArray {
        val file = File.createTempFile("chromvoid-image-metadata", ".jpg")
        return try {
            val bitmap = Bitmap.createBitmap(8, 6, Bitmap.Config.ARGB_8888)
            try {
                file.outputStream().use { output ->
                    assertTrue(bitmap.compress(Bitmap.CompressFormat.JPEG, 95, output))
                }
            } finally {
                bitmap.recycle()
            }

            ExifInterface(file.absolutePath).run {
                setAttribute(ExifInterface.TAG_GPS_LATITUDE, "55/1,45/1,30/1")
                setAttribute(ExifInterface.TAG_GPS_LATITUDE_REF, "N")
                setAttribute(ExifInterface.TAG_GPS_LONGITUDE, "37/1,37/1,2/1")
                setAttribute(ExifInterface.TAG_GPS_LONGITUDE_REF, "E")
                setAttribute(ExifInterface.TAG_GPS_ALTITUDE, "1564/10")
                setAttribute(ExifInterface.TAG_GPS_ALTITUDE_REF, "0")
                saveAttributes()
            }

            file.readBytes()
        } finally {
            file.delete()
        }
    }
}
