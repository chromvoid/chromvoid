package com.chromvoid.app.nativebridge

internal data class HeifPreviewNativeResult(
    val bytes: ByteArray,
    val mimeType: String,
    val fileExtension: String,
)

internal object HeifPreviewNativeShell {
    @Volatile private var lastDecodeFailure: String? = null

    @JvmStatic
    fun decodePreview(
        bytes: ByteArray,
        maxEdge: Int,
        tierCode: Int,
    ): HeifPreviewNativeResult? {
        lastDecodeFailure = null
        val outcome = HeifPreviewDecoder.decode(bytes, maxEdge, tierCode)
        lastDecodeFailure = outcome.failure
        return outcome.result
    }

    @JvmStatic
    fun getLastDecodeFailure(): String? = lastDecodeFailure
}
