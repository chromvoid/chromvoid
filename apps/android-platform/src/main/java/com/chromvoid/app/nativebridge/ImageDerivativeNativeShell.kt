package com.chromvoid.app.nativebridge

import java.nio.ByteBuffer

/**
 * One answer of Android's image decoder to Core: the encoded derivative and its type, or why there
 * is none. Each call gets its own, so calls on several Core workers never read each other's.
 */
internal class ImageDerivativeNativeResult(
    @JvmField val bytes: ByteArray?,
    @JvmField val mimeType: String?,
    @JvmField val failure: String?,
)

/**
 * Where Core's image derivatives reach Android's image decoder. Rust (air-ffi) calls it on a Core
 * worker thread, never the main thread, with the original's bytes in a direct buffer over memory
 * Rust owns: the decoder only reads it and never keeps it, and Rust clears it afterwards.
 */
internal object ImageDerivativeNativeShell {
    @JvmStatic
    fun decodePreview(source: ByteBuffer, maxEdge: Int, tierCode: Int): ImageDerivativeNativeResult =
        ImageDerivativeDecoder.decode(source, maxEdge, tierCode)
}
