package com.chromvoid.air.ui.files

import java.io.IOException

/** A picked document held in memory, as the content resolver would stream it. */
internal class MemorySource(
    override val label: String,
    private val bytes: ByteArray,
    private val mimeType: String? = null,
    /** What the provider claims; defaults to the true size. */
    private val reported: Long = bytes.size.toLong(),
    private val unreadable: Boolean = false,
) : FileSource {
    var closed = false
    private var offset = 0

    override suspend fun open(): FileSourceInfo {
        if (unreadable) throw IOException("permission revoked")
        return FileSourceInfo(label, reported, mimeType)
    }

    override suspend fun read(maximum: Int): ByteArray {
        val end = minOf(bytes.size, offset + maximum)
        return bytes.copyOfRange(offset, end).also { offset = end }
    }

    override suspend fun close() {
        closed = true
    }
}

/** A document receiving an export, kept in memory; [failAfter] bytes make it refuse more. */
internal class MemoryDestination(private val failAfter: Int? = null) : FileDestination {
    val written = java.io.ByteArrayOutputStream()
    var finished = false
    var abandoned = false

    override suspend fun write(bytes: ByteArray) {
        if (failAfter != null && written.size() + bytes.size > failAfter) throw IOException("disk full")
        written.write(bytes)
    }

    override suspend fun finish() {
        finished = true
    }

    override suspend fun abandon() {
        abandoned = true
    }
}
