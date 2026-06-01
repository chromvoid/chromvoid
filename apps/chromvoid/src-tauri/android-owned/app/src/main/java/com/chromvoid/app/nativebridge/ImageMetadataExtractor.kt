package com.chromvoid.app.nativebridge

import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.media.ExifInterface
import android.util.Log
import java.io.ByteArrayInputStream
import java.nio.ByteBuffer
import org.json.JSONObject

internal object ImageMetadataExtractor {
    private const val TAG = "ChromVoid/ImageMetadata"
    private const val EXIF_TAG_LENS_MODEL = "LensModel"
    private const val EXIF_TAG_PHOTOGRAPHIC_SENSITIVITY = "PhotographicSensitivity"
    private const val EXIF_TAG_ISO_SPEED_RATINGS = "ISOSpeedRatings"
    private const val GPS_COORDINATE_STATUS_NOT_PARSED = "not_parsed"
    private const val GPS_COORDINATE_STATUS_OK = "ok"
    private const val GPS_SOURCE_RAW_EXIF = "raw_exif"
    private const val MAX_FAILURE_MESSAGE_LENGTH = 240

    fun extract(bytes: ByteArray): JSONObject {
        val payload = JSONObject()
        fillDimensions(bytes, payload)
        fillExif(bytes, payload)
        return payload
    }

    private fun fillDimensions(
        bytes: ByteArray,
        payload: JSONObject,
    ) {
        if (fillDimensionsWithImageDecoder(bytes, payload)) return
        fillDimensionsWithBitmapFactory(bytes, payload)
    }

    private fun fillDimensionsWithImageDecoder(
        bytes: ByteArray,
        payload: JSONObject,
    ): Boolean =
        try {
            val source = ImageDecoder.createSource(ByteBuffer.wrap(bytes))
            val bitmap =
                ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
                    val width = info.size.width
                    val height = info.size.height
                    if (width > 0 && height > 0) {
                        payload.put("width", width)
                        payload.put("height", height)
                    }
                    decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                    decoder.setTargetSize(1, 1)
                }
            bitmap.recycle()
            payload.has("width") && payload.has("height")
        } catch (error: Throwable) {
            Log.d(TAG, "ImageDecoder metadata read failed: ${sanitizeFailureMessage(error.message ?: error.javaClass.simpleName)}")
            false
        }

    private fun fillDimensionsWithBitmapFactory(
        bytes: ByteArray,
        payload: JSONObject,
    ) {
        val options =
            BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)
        if (options.outWidth > 0 && options.outHeight > 0) {
            payload.put("width", options.outWidth)
            payload.put("height", options.outHeight)
        }
    }

    private fun fillExif(
        bytes: ByteArray,
        payload: JSONObject,
    ) {
        val exif =
            try {
                ExifInterface(ByteArrayInputStream(bytes))
            } catch (error: Throwable) {
                Log.d(TAG, "Exif metadata read failed: ${sanitizeFailureMessage(error.message ?: error.javaClass.simpleName)}")
                return
            }

        putString(payload, "dateTaken", normalizeExifDateTime(exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL)))
        putString(payload, "cameraMake", exif.getAttribute(ExifInterface.TAG_MAKE))
        putString(payload, "cameraModel", exif.getAttribute(ExifInterface.TAG_MODEL))
        putString(payload, "lensModel", getExifString(exif, EXIF_TAG_LENS_MODEL))
        putString(payload, "exposureTime", exif.getAttribute(ExifInterface.TAG_EXPOSURE_TIME))
        putString(payload, "aperture", exif.getAttribute(ExifInterface.TAG_F_NUMBER))
        putString(payload, "focalLength", exif.getAttribute(ExifInterface.TAG_FOCAL_LENGTH))
        putString(payload, "orientation", orientationLabel(exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_UNDEFINED)))

        val iso = getExifInt(exif, EXIF_TAG_PHOTOGRAPHIC_SENSITIVITY)
            ?: getExifInt(exif, EXIF_TAG_ISO_SPEED_RATINGS)
            ?: 0
        if (iso > 0) payload.put("iso", iso)

        val gps = gpsMetadata(exif, payload)
        if (gps != null) payload.put("gps", gps)
    }

    private data class GpsCoordinates(
        val latitude: Double,
        val longitude: Double,
        val source: String,
    )

    private data class GpsRawAttributes(
        val latitude: String?,
        val latitudeRef: String?,
        val longitude: String?,
        val longitudeRef: String?,
        val altitude: String?,
        val altitudeRef: String?,
    ) {
        val hasCoordinateTags: Boolean
            get() =
                !latitude.isNullOrBlank() ||
                    !latitudeRef.isNullOrBlank() ||
                    !longitude.isNullOrBlank() ||
                    !longitudeRef.isNullOrBlank()

        val hasAltitudeTags: Boolean
            get() = !altitude.isNullOrBlank() || !altitudeRef.isNullOrBlank()
    }

    private fun gpsMetadata(
        exif: ExifInterface,
        payload: JSONObject,
    ): JSONObject? {
        val raw = gpsRawAttributes(exif)
        val apiCoordinates = gpsCoordinatesFromAndroidApi(exif)
        val rawCoordinates = gpsCoordinatesFromRawAttributes(raw)
        val apiStatus = gpsCoordinateStatus(apiCoordinates)
        val rawStatus = gpsCoordinateStatus(rawCoordinates)
        val coordinates =
            when {
                apiStatus == GPS_COORDINATE_STATUS_OK -> apiCoordinates
                rawStatus == GPS_COORDINATE_STATUS_OK -> rawCoordinates
                else -> apiCoordinates ?: rawCoordinates
            }
        val selectedStatus = gpsCoordinateStatus(coordinates)
        if (raw.hasCoordinateTags || raw.hasAltitudeTags || apiCoordinates != null) {
            putGpsProbe(
                payload,
                raw,
                apiCoordinates,
                rawCoordinates,
                coordinates,
                apiStatus,
                rawStatus,
                selectedStatus,
            )
            Log.i(
                TAG,
                "image_metadata android_native gps_probe api=${apiCoordinates != null} api_status=$apiStatus " +
                    "raw_lat=${!raw.latitude.isNullOrBlank()} raw_lat_ref=${!raw.latitudeRef.isNullOrBlank()} " +
                    "raw_lon=${!raw.longitude.isNullOrBlank()} raw_lon_ref=${!raw.longitudeRef.isNullOrBlank()} " +
                    "raw_alt=${!raw.altitude.isNullOrBlank()} raw_status=$rawStatus " +
                    "fallback=${coordinates?.source == GPS_SOURCE_RAW_EXIF} selected_status=$selectedStatus",
            )
        }

        if (coordinates == null) return null
        if (selectedStatus != GPS_COORDINATE_STATUS_OK) {
            Log.i(TAG, "image_metadata android_native gps_ignored reason=$selectedStatus source=${coordinates.source}")
            return null
        }

        val gps = JSONObject()
            .put("latitude", coordinates.latitude)
            .put("longitude", coordinates.longitude)
        val altitude = gpsAltitude(exif, raw)
        if (altitude != null) gps.put("altitudeMeters", altitude)
        return gps
    }

    private fun putGpsProbe(
        payload: JSONObject,
        raw: GpsRawAttributes,
        apiCoordinates: GpsCoordinates?,
        rawCoordinates: GpsCoordinates?,
        coordinates: GpsCoordinates?,
        apiStatus: String,
        rawStatus: String,
        selectedStatus: String,
    ) {
        val probe = JSONObject()
            .put("api", apiCoordinates != null)
            .put("apiStatus", apiStatus)
            .put("rawLat", !raw.latitude.isNullOrBlank())
            .put("rawLatRef", !raw.latitudeRef.isNullOrBlank())
            .put("rawLon", !raw.longitude.isNullOrBlank())
            .put("rawLonRef", !raw.longitudeRef.isNullOrBlank())
            .put("rawAlt", !raw.altitude.isNullOrBlank())
            .put("rawParsed", rawCoordinates != null)
            .put("rawStatus", rawStatus)
            .put("fallback", coordinates?.source == GPS_SOURCE_RAW_EXIF)
            .put("selectedStatus", selectedStatus)
            .put("latFormat", gpsAttributeFormat(raw.latitude))
            .put("lonFormat", gpsAttributeFormat(raw.longitude))
            .put("altFormat", gpsAttributeFormat(raw.altitude))
        val source = coordinates?.source
        if (source != null) probe.put("source", source)
        payload.put("gpsProbe", probe)
    }

    private fun gpsCoordinatesFromAndroidApi(exif: ExifInterface): GpsCoordinates? {
        val latLong = FloatArray(2)
        if (!exif.getLatLong(latLong)) return null

        val latitude = latLong[0].toDouble()
        val longitude = latLong[1].toDouble()
        return GpsCoordinates(latitude = latitude, longitude = longitude, source = "android_api")
    }

    private fun gpsCoordinatesFromRawAttributes(raw: GpsRawAttributes): GpsCoordinates? {
        val latitude = gpsCoordinateFromRawAttribute(raw.latitude, raw.latitudeRef) ?: return null
        val longitude = gpsCoordinateFromRawAttribute(raw.longitude, raw.longitudeRef) ?: return null
        return GpsCoordinates(latitude = latitude, longitude = longitude, source = GPS_SOURCE_RAW_EXIF)
    }

    private fun gpsRawAttributes(exif: ExifInterface): GpsRawAttributes =
        GpsRawAttributes(
            latitude = exif.getAttribute(ExifInterface.TAG_GPS_LATITUDE),
            latitudeRef = exif.getAttribute(ExifInterface.TAG_GPS_LATITUDE_REF),
            longitude = exif.getAttribute(ExifInterface.TAG_GPS_LONGITUDE),
            longitudeRef = exif.getAttribute(ExifInterface.TAG_GPS_LONGITUDE_REF),
            altitude = exif.getAttribute(ExifInterface.TAG_GPS_ALTITUDE),
            altitudeRef = exif.getAttribute(ExifInterface.TAG_GPS_ALTITUDE_REF),
        )

    private fun gpsCoordinateFromRawAttribute(
        value: String?,
        reference: String?,
    ): Double? {
        val parts = value
            ?.split(',')
            ?.map { it.trim() }
            ?.takeIf { it.size >= 3 }
            ?: return null

        val degrees = exifRationalToDouble(parts[0]) ?: return null
        val minutes = exifRationalToDouble(parts[1]) ?: return null
        val seconds = exifRationalToDouble(parts[2]) ?: return null
        var coordinate = degrees + minutes / 60.0 + seconds / 3600.0
        if (reference.equals("S", ignoreCase = true) || reference.equals("W", ignoreCase = true)) {
            coordinate = -coordinate
        }
        return coordinate
    }

    private fun gpsAltitude(
        exif: ExifInterface,
        raw: GpsRawAttributes,
    ): Double? {
        val apiAltitude = exif.getAltitude(Double.NaN)
        if (!apiAltitude.isNaN()) return apiAltitude

        var altitude = exifRationalToDouble(raw.altitude) ?: return null
        if (raw.altitudeRef?.trim() == "1") {
            altitude = -altitude
        }
        return altitude
    }

    private fun exifRationalToDouble(value: String?): Double? {
        val text = value?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        val slashIndex = text.indexOf('/')
        if (slashIndex < 0) return text.toDoubleOrNull()

        val numerator = text.substring(0, slashIndex).trim().toDoubleOrNull() ?: return null
        val denominator = text.substring(slashIndex + 1).trim().toDoubleOrNull() ?: return null
        if (denominator == 0.0) return null
        return numerator / denominator
    }

    private fun gpsAttributeFormat(value: String?): String {
        val text = value?.trim()?.takeIf { it.isNotEmpty() } ?: return "none"
        val parts = text.split(',').map { it.trim() }
        return when {
            parts.size >= 3 && parts.all { it.contains('/') } -> "dms_rational"
            parts.size >= 3 -> "dms_decimal"
            text.contains('/') -> "rational"
            text.toDoubleOrNull() != null -> "decimal"
            else -> "other"
        }
    }

    private fun gpsCoordinateStatus(coordinates: GpsCoordinates?): String =
        if (coordinates == null) {
            GPS_COORDINATE_STATUS_NOT_PARSED
        } else {
            gpsCoordinateStatus(coordinates.latitude, coordinates.longitude)
        }

    private fun gpsCoordinateStatus(
        latitude: Double,
        longitude: Double,
    ): String =
        when {
            !latitude.isFinite() || !longitude.isFinite() -> "non_finite"
            latitude !in -90.0..90.0 || longitude !in -180.0..180.0 -> "out_of_range"
            latitude == 0.0 && longitude == 0.0 -> "zero_zero"
            else -> GPS_COORDINATE_STATUS_OK
        }

    private fun putString(
        payload: JSONObject,
        key: String,
        value: String?,
    ) {
        val normalized = value?.trim()?.takeIf { it.isNotEmpty() } ?: return
        payload.put(key, normalized)
    }

    private fun getExifInt(
        exif: ExifInterface,
        tag: String,
    ): Int? =
        runCatching {
            exif.getAttributeInt(tag, 0).takeIf { it > 0 }
        }.getOrNull()

    private fun getExifString(
        exif: ExifInterface,
        tag: String,
    ): String? =
        runCatching {
            exif.getAttribute(tag)
        }.getOrNull()

    private fun normalizeExifDateTime(value: String?): String? {
        val text = value?.trim()?.takeIf { it.isNotEmpty() } ?: return null
        if (text.length < 19) return text
        if (text[4] == ':' && text[7] == ':') {
            return "${text.substring(0, 4)}-${text.substring(5, 7)}-${text.substring(8, 10)}T${text.substring(11, 19)}"
        }
        return text
    }

    private fun orientationLabel(orientation: Int): String? =
        when (orientation) {
            ExifInterface.ORIENTATION_NORMAL -> "Normal"
            ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> "Mirrored horizontally"
            ExifInterface.ORIENTATION_ROTATE_180 -> "Rotated 180"
            ExifInterface.ORIENTATION_FLIP_VERTICAL -> "Mirrored vertically"
            ExifInterface.ORIENTATION_TRANSPOSE -> "Mirrored horizontally, rotated 270"
            ExifInterface.ORIENTATION_ROTATE_90 -> "Rotated 90"
            ExifInterface.ORIENTATION_TRANSVERSE -> "Mirrored horizontally, rotated 90"
            ExifInterface.ORIENTATION_ROTATE_270 -> "Rotated 270"
            ExifInterface.ORIENTATION_UNDEFINED -> null
            else -> orientation.toString()
        }

    private fun sanitizeFailureMessage(message: String): String {
        val compact = message
            .replace(Regex("\\s+"), " ")
            .trim()
        if (compact.length <= MAX_FAILURE_MESSAGE_LENGTH) return compact
        return compact.take(MAX_FAILURE_MESSAGE_LENGTH)
    }
}
