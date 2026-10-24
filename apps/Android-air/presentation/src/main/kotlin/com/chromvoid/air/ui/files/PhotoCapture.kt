package com.chromvoid.air.ui.files

import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The device's camera, taking one photo for Files as iOS takes one: the photo stays in memory
 * and goes straight into the vault, never through a file on the device.
 */
public interface PhotoCapture {
    public sealed interface Result {
        /** An upright JPEG and when it was taken; whoever takes it clears it. */
        public class Taken(public val jpeg: ByteArray, public val takenAt: Long) : Result

        public data object Cancelled : Result

        public data object PermissionDenied : Result

        public data object Unavailable : Result
    }

    /** Whether this device has a camera to offer at all. */
    public val available: Boolean

    public suspend fun capture(): Result
}

/** A photo's name as iOS gives it: "Photo 2026-09-27 14.05.33.jpg", in the device's time zone. */
public fun photoName(takenAt: Long): String =
    "Photo ${SimpleDateFormat("yyyy-MM-dd HH.mm.ss", Locale.ROOT).format(Date(takenAt))}.jpg"

/** A photo held in memory, read like a picked document; closing it clears the bytes. */
internal class PhotoSource(private val name: String, private val jpeg: ByteArray) : FileSource {
    private var offset = 0

    override val label: String get() = name

    override suspend fun open(): FileSourceInfo = FileSourceInfo(name, jpeg.size.toLong(), "image/jpeg")

    override suspend fun read(maximum: Int): ByteArray {
        val count = minOf(maximum, jpeg.size - offset)
        if (count <= 0) return ByteArray(0)
        return jpeg.copyOfRange(offset, offset + count).also { offset += count }
    }

    override suspend fun close() {
        jpeg.fill(0)
        offset = jpeg.size
    }
}
