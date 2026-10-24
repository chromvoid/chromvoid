package com.chromvoid.app

import java.io.ByteArrayOutputStream

object PasskeyCbor {
    fun encode(value: Any?): ByteArray {
        val out = ByteArrayOutputStream()
        writeValue(out, value)
        return out.toByteArray()
    }

    private fun writeValue(out: ByteArrayOutputStream, value: Any?) {
        when (value) {
            null -> out.write(0xf6)
            is ByteArray -> writeBytes(out, value)
            is String -> writeText(out, value)
            is Int -> writeInteger(out, value.toLong())
            is Long -> writeInteger(out, value)
            is Boolean -> out.write(if (value) 0xf5 else 0xf4)
            is List<*> -> writeList(out, value)
            is Map<*, *> -> writeMap(out, value)
            else -> throw IllegalArgumentException("Unsupported CBOR value: ${value::class.java.name}")
        }
    }

    private fun writeInteger(out: ByteArrayOutputStream, value: Long) {
        if (value >= 0) {
            writeTypeAndLength(out, 0, value)
        } else {
            writeTypeAndLength(out, 1, -1L - value)
        }
    }

    private fun writeBytes(out: ByteArrayOutputStream, value: ByteArray) {
        writeTypeAndLength(out, 2, value.size.toLong())
        out.write(value)
    }

    private fun writeText(out: ByteArrayOutputStream, value: String) {
        val bytes = value.toByteArray(Charsets.UTF_8)
        writeTypeAndLength(out, 3, bytes.size.toLong())
        out.write(bytes)
    }

    private fun writeList(out: ByteArrayOutputStream, value: List<*>) {
        writeTypeAndLength(out, 4, value.size.toLong())
        value.forEach { item -> writeValue(out, item) }
    }

    private fun writeMap(out: ByteArrayOutputStream, value: Map<*, *>) {
        writeTypeAndLength(out, 5, value.size.toLong())
        value.forEach { (key, item) ->
            when (key) {
                is String -> writeText(out, key)
                is Int -> writeInteger(out, key.toLong())
                is Long -> writeInteger(out, key)
                else -> throw IllegalArgumentException("Unsupported CBOR map key: $key")
            }
            writeValue(out, item)
        }
    }

    private fun writeTypeAndLength(out: ByteArrayOutputStream, majorType: Int, value: Long) {
        when {
            value < 24 -> out.write((majorType shl 5) or value.toInt())
            value <= 0xff -> {
                out.write((majorType shl 5) or 24)
                out.write(value.toInt())
            }
            value <= 0xffff -> {
                out.write((majorType shl 5) or 25)
                out.write((value shr 8).toInt() and 0xff)
                out.write(value.toInt() and 0xff)
            }
            value <= 0xffff_ffffL -> {
                out.write((majorType shl 5) or 26)
                for (shift in intArrayOf(24, 16, 8, 0)) {
                    out.write(((value shr shift) and 0xff).toInt())
                }
            }
            else -> {
                out.write((majorType shl 5) or 27)
                for (shift in intArrayOf(56, 48, 40, 32, 24, 16, 8, 0)) {
                    out.write(((value shr shift) and 0xff).toInt())
                }
            }
        }
    }
}
