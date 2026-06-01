package com.chromvoid.app.nativebridge

import android.graphics.Bitmap
import android.graphics.ImageDecoder
import android.os.Build
import android.os.SystemClock
import android.util.Log
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import kotlin.math.max
import kotlin.math.roundToInt

internal data class HeifPreviewDecodeOutcome(
    val result: HeifPreviewNativeResult?,
    val failure: String?,
)

internal object HeifPreviewDecoder {
    private const val TAG = "ChromVoidImagePreview"
    private const val WEBP_QUALITY = 82
    private const val MAX_INPUT_BYTES = 64 * 1024 * 1024
    private const val MAX_SOURCE_PIXELS = 80_000_000L
    private const val MAX_PREVIEW_EDGE = 3200
    private const val MAX_FAILURE_MESSAGE_LENGTH = 240
    private const val TIER_THUMBNAIL = 0
    private const val TIER_PREVIEW = 1

    fun decode(
        bytes: ByteArray,
        maxEdge: Int,
        tierCode: Int,
    ): HeifPreviewDecodeOutcome {
        var tierLabel = "unknown"
        return try {
            val derivativeTier = resolveDerivativeTier(tierCode)
            tierLabel = derivativeTier.label
            require(bytes.isNotEmpty()) { "Image preview payload is empty" }
            require(bytes.size <= MAX_INPUT_BYTES) {
                "Image preview payload exceeds derivative input limit: bytes=${bytes.size} max=$MAX_INPUT_BYTES"
            }
            require(maxEdge in 1..MAX_PREVIEW_EDGE) {
                "Image derivative max edge exceeds policy: edge=$maxEdge max=$MAX_PREVIEW_EDGE"
            }

            val decodeStartedAt = SystemClock.elapsedRealtime()
            val decodeTargetEdge = resolveDecodeTargetEdge(maxEdge, derivativeTier)
            val source = ImageDecoder.createSource(ByteBuffer.wrap(bytes))
            val decodedBitmap =
                ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
                    decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                    decoder.isMutableRequired = false

                    val width = info.size.width
                    val height = info.size.height
                    require(width > 0 && height > 0) {
                        "Image derivative dimensions must be non-zero: width=$width height=$height"
                    }
                    val pixelCount = width.toLong() * height.toLong()
                    require(pixelCount <= MAX_SOURCE_PIXELS) {
                        "Image exceeds derivative pixel limit: width=$width height=$height pixels=$pixelCount max=$MAX_SOURCE_PIXELS"
                    }

                    val longestEdge = max(width, height)
                    if (longestEdge > decodeTargetEdge) {
                        val scale = decodeTargetEdge.toDouble() / longestEdge.toDouble()
                        decoder.setTargetSize(
                            max(1, (width * scale).roundToInt()),
                            max(1, (height * scale).roundToInt()),
                        )
                    }
                }

            val result = encodePreview(decodedBitmap, decodeStartedAt, maxEdge, derivativeTier)
            HeifPreviewDecodeOutcome(result = result, failure = null)
        } catch (error: Exception) {
            val failure = sanitizeFailureMessage(error.message ?: error.javaClass.simpleName)
            Log.w(TAG, "image_derivative decode_failed tier=$tierLabel max_edge=$maxEdge error=$failure", error)
            HeifPreviewDecodeOutcome(result = null, failure = failure)
        }
    }

    private fun encodePreview(
        decodedBitmap: Bitmap,
        decodeStartedAt: Long,
        maxEdge: Int,
        derivativeTier: DerivativeTier,
    ): HeifPreviewNativeResult {
        var outputBitmap: Bitmap? = decodedBitmap
        try {
            val decodeMs = SystemClock.elapsedRealtime() - decodeStartedAt
            val renderBitmap = scaleDecodedBitmap(decodedBitmap, maxEdge, derivativeTier)
            if (renderBitmap !== decodedBitmap) {
                decodedBitmap.recycle()
                outputBitmap = renderBitmap
            }
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
                renderBitmap.setHasAlpha(true)
            }
            val hasAlpha = renderBitmap.hasAlpha()
            require(max(renderBitmap.width, renderBitmap.height) <= maxEdge) {
                "Image derivative output exceeds requested edge: width=${renderBitmap.width} height=${renderBitmap.height} max_edge=$maxEdge"
            }
            val outputFormat = resolveOutputFormat(hasAlpha, derivativeTier)
            val encodeStartedAt = SystemClock.elapsedRealtime()

            ByteArrayOutputStream().use { encoded ->
                check(renderBitmap.compress(outputFormat.format, outputFormat.quality, encoded)) {
                    "Failed to encode ${outputFormat.mimeType} preview"
                }
                val encodedBytes = encoded.toByteArray()
                Log.i(
                    TAG,
                    "image_derivative tier=${derivativeTier.label} decode_resize_ms=$decodeMs encode_ms=${SystemClock.elapsedRealtime() - encodeStartedAt} output_bytes=${encodedBytes.size} mime_type=${outputFormat.mimeType}",
                )
                return HeifPreviewNativeResult(
                    bytes = encodedBytes,
                    mimeType = outputFormat.mimeType,
                    fileExtension = outputFormat.fileExtension,
                )
            }
        } finally {
            outputBitmap?.recycle()
        }
    }

    private fun sanitizeFailureMessage(message: String): String {
        val compact = message
            .replace(Regex("\\s+"), " ")
            .trim()
        if (compact.length <= MAX_FAILURE_MESSAGE_LENGTH) {
            return compact
        }
        return compact.take(MAX_FAILURE_MESSAGE_LENGTH)
    }

    private data class OutputFormat(
        val format: Bitmap.CompressFormat,
        val mimeType: String,
        val fileExtension: String,
        val quality: Int,
    )

    private enum class DerivativeTier(val label: String) {
        Thumbnail("thumbnail"),
        Preview("preview"),
    }

    private fun resolveDerivativeTier(tierCode: Int): DerivativeTier =
        when (tierCode) {
            TIER_THUMBNAIL -> DerivativeTier.Thumbnail
            TIER_PREVIEW -> DerivativeTier.Preview
            else -> error("Unsupported image derivative tier: $tierCode")
        }

    private fun resolveDecodeTargetEdge(
        maxEdge: Int,
        tier: DerivativeTier,
    ): Int {
        if (tier !== DerivativeTier.Thumbnail) {
            return maxEdge
        }

        return max(maxEdge * 2, 512).coerceAtMost(MAX_PREVIEW_EDGE)
    }

    private fun scaleDecodedBitmap(
        bitmap: Bitmap,
        maxEdge: Int,
        tier: DerivativeTier,
    ): Bitmap {
        if (tier !== DerivativeTier.Thumbnail) {
            return bitmap
        }

        val longestEdge = max(bitmap.width, bitmap.height)
        if (longestEdge <= maxEdge) {
            return bitmap
        }

        val scale = maxEdge.toDouble() / longestEdge.toDouble()
        return Bitmap.createScaledBitmap(
            bitmap,
            max(1, (bitmap.width * scale).roundToInt()),
            max(1, (bitmap.height * scale).roundToInt()),
            true,
        )
    }

    private fun resolveOutputFormat(
        hasAlpha: Boolean,
        tier: DerivativeTier,
    ): OutputFormat {
        if (tier === DerivativeTier.Thumbnail) {
            return OutputFormat(Bitmap.CompressFormat.PNG, "image/png", "png", 100)
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val format =
                if (hasAlpha) {
                    Bitmap.CompressFormat.WEBP_LOSSLESS
                } else {
                    Bitmap.CompressFormat.WEBP_LOSSY
                }
            val quality = if (hasAlpha) 100 else WEBP_QUALITY

            return OutputFormat(format, "image/webp", "webp", quality)
        }

        // Android API 28-29 has no framework WebP encoder that preserves alpha. Use the
        // conservative PNG fallback because platform decoders do not expose a reliable
        // source-alpha signal for every supported image type.
        return OutputFormat(Bitmap.CompressFormat.PNG, "image/png", "png", 100)
    }
}
