package com.chromvoid.air.ui.media

import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.graphics.drawable.AnimatedImageDrawable
import android.graphics.drawable.BitmapDrawable
import android.media.ExifInterface
import java.io.ByteArrayInputStream
import java.nio.ByteBuffer
import java.text.SimpleDateFormat
import java.util.Locale
import kotlin.math.max
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** What the encoded image itself says: its pixel size and the camera's EXIF and GPS records. */
public data class ImageDetails(
    val pixelWidth: Int? = null,
    val pixelHeight: Int? = null,
    val cameraMake: String? = null,
    val cameraModel: String? = null,
    val lens: String? = null,
    val software: String? = null,
    /** `DateTimeOriginal`, in milliseconds, with the file's own offset when it carries one. */
    val taken: Long? = null,
    val exposureTime: Double? = null,
    val fNumber: Double? = null,
    val iso: Int? = null,
    val focalLength: Double? = null,
    val latitude: Double? = null,
    val longitude: Double? = null,
) {
    val hasCamera: Boolean
        get() = cameraMake != null || cameraModel != null || lens != null || exposureTime != null ||
            fNumber != null || iso != null || focalLength != null

    public companion object {
        /** The records a camera keeps in the file head; nothing is inferred or stored. */
        public fun read(bytes: ByteArray, width: Int? = null, height: Int? = null): ImageDetails {
            val exif = runCatching { ExifInterface(ByteArrayInputStream(bytes)) }.getOrNull()
                ?: return ImageDetails(width, height)
            val latLong = FloatArray(2).takeIf { exif.getLatLong(it) }
            return ImageDetails(
                pixelWidth = width ?: exif.getAttributeInt(ExifInterface.TAG_IMAGE_WIDTH, 0).takeIf { it > 0 },
                pixelHeight = height ?: exif.getAttributeInt(ExifInterface.TAG_IMAGE_LENGTH, 0).takeIf { it > 0 },
                cameraMake = exif.text(ExifInterface.TAG_MAKE),
                cameraModel = exif.text(ExifInterface.TAG_MODEL),
                lens = exif.text(LENS_MODEL),
                software = exif.text(ExifInterface.TAG_SOFTWARE),
                taken = taken(exif),
                exposureTime = exif.getAttributeDouble(ExifInterface.TAG_EXPOSURE_TIME, 0.0).takeIf { it > 0 },
                fNumber = exif.getAttributeDouble(ExifInterface.TAG_F_NUMBER, 0.0).takeIf { it > 0 },
                iso = exif.getAttributeInt(ExifInterface.TAG_ISO_SPEED_RATINGS, 0).takeIf { it > 0 },
                focalLength = exif.getAttributeDouble(ExifInterface.TAG_FOCAL_LENGTH, 0.0).takeIf { it > 0 },
                latitude = latLong?.get(0)?.toDouble(),
                longitude = latLong?.get(1)?.toDouble(),
            )
        }

        /** EXIF 2.3's lens name; the platform reads it but names no constant for it. */
        private const val LENS_MODEL = "LensModel"

        private fun ExifInterface.text(tag: String): String? = getAttribute(tag)?.trim()?.takeIf { it.isNotEmpty() }

        private fun taken(exif: ExifInterface): Long? {
            val value = exif.text(ExifInterface.TAG_DATETIME_ORIGINAL) ?: return null
            val offset = exif.text(ExifInterface.TAG_OFFSET_TIME_ORIGINAL)
            val pattern = if (offset != null) "yyyy:MM:dd HH:mm:ssXXX" else "yyyy:MM:dd HH:mm:ss"
            return runCatching {
                SimpleDateFormat(pattern, Locale.US).parse(value + offset.orEmpty())?.time
            }.getOrNull()
        }
    }
}

/** One decoded image for the screen: a bitmap, and the animation when the file has one. */
public class DecodedImage(
    public val bitmap: Bitmap,
    public val details: ImageDetails,
    /** Frames the animation plays on request, never on its own. */
    public val animation: AnimatedImageDrawable? = null,
)

public class ImageDecodeFailed(cause: Throwable) : Exception("The image could not be decoded", cause)

/**
 * The platform's decoders only; Core owns the file, its bytes and the session.
 * An image is sampled down to [MAXIMUM_PIXEL_SIZE] on its long edge and turned
 * the way the camera recorded it.
 */
public object ImageDecoding {
    public const val MAXIMUM_SOURCE_BYTES: Long = 32L * 1024 * 1024
    public const val MAXIMUM_PIXEL_SIZE: Int = 2048

    private val EXTENSIONS = setOf("jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "avif")

    /** Whether the viewer tries this file; a vector image is shown as information instead. */
    public fun supports(name: String, mimeType: String?): Boolean {
        val type = mimeType?.lowercase()
        if (type != null && type.startsWith("image/")) return !type.contains("svg")
        return name.substringAfterLast('.', "").lowercase() in EXTENSIONS
    }

    /** Animated formats keep their frames, and PNG may be animated: those always read the original. */
    public fun keepsFrames(name: String, mimeType: String?): Boolean {
        val type = mimeType?.lowercase().orEmpty()
        val extension = name.substringAfterLast('.', "").lowercase()
        return extension in setOf("gif", "png", "apng", "webp") || "gif" in type || "png" in type || "webp" in type
    }

    public suspend fun decode(bytes: ByteArray): DecodedImage = withContext(Dispatchers.Default) {
        var width = 0
        var height = 0
        try {
            val drawable = ImageDecoder.decodeDrawable(
                ImageDecoder.createSource(ByteBuffer.wrap(bytes)),
            ) { decoder, info, _ ->
                width = info.size.width
                height = info.size.height
                sample(decoder, width, height)
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
            val details = ImageDetails.read(bytes, width, height)
            when (drawable) {
                // The still is decoded apart from the animation, which keeps reading its own frames.
                is AnimatedImageDrawable -> DecodedImage(still(bytes), details, drawable)
                is BitmapDrawable -> DecodedImage(drawable.bitmap, details)
                else -> DecodedImage(still(bytes), details)
            }
        } catch (error: Exception) {
            throw ImageDecodeFailed(error)
        }
    }

    private fun still(bytes: ByteArray): Bitmap =
        ImageDecoder.decodeBitmap(ImageDecoder.createSource(ByteBuffer.wrap(bytes))) { decoder, info, _ ->
            sample(decoder, info.size.width, info.size.height)
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }

    /** The thumbnail a camera embedded in the file head, if any; never made from the pixels. */
    public fun embeddedThumbnail(head: ByteArray): Bitmap? =
        runCatching { ExifInterface(ByteArrayInputStream(head)).thumbnailBitmap }.getOrNull()

    private fun sample(decoder: ImageDecoder, width: Int, height: Int) {
        val longest = max(width, height)
        if (longest > MAXIMUM_PIXEL_SIZE) {
            val scale = MAXIMUM_PIXEL_SIZE.toFloat() / longest
            decoder.setTargetSize((width * scale).toInt().coerceAtLeast(1), (height * scale).toInt().coerceAtLeast(1))
        }
    }
}
