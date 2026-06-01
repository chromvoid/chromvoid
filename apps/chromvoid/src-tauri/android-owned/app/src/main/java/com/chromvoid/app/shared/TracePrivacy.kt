package com.chromvoid.app.shared

import android.net.Uri
import java.security.MessageDigest
import java.util.Locale

internal object TracePrivacy {
    private const val HASH_CHARS = 12
    private const val MAX_TEXT_LENGTH = 160

    fun redactIdentifier(value: String?): String? {
        if (value.isNullOrBlank()) return null
        val normalized = sanitizeText(value).takeIf { it.isNotEmpty() } ?: return null
        return "${normalized.length}:${shortHash(normalized)}"
    }

    fun redactUri(value: String?): String? {
        if (value.isNullOrBlank()) return null
        val normalized = sanitizeText(value).takeIf { it.isNotEmpty() } ?: return null
        val uri = runCatching { Uri.parse(normalized) }.getOrNull()
        val scheme = uri?.scheme?.takeIf { it.isNotBlank() } ?: "unknown"
        val authority = uri?.authority?.takeIf { it.isNotBlank() } ?: "none"
        return "scheme=$scheme authority=$authority id=${redactIdentifier(normalized)}"
    }

    fun redactDisplayName(value: String?): String? {
        if (value.isNullOrBlank()) return null
        val normalized = sanitizeText(value).takeIf { it.isNotEmpty() } ?: return null
        val extension = safeExtension(normalized)
        return buildString {
            append("len=${normalized.length}:hash=${shortHash(normalized)}")
            if (extension != null) {
                append(":ext=")
                append(extension)
            }
        }
    }

    fun traceValue(value: Any?): String = sanitizeText(value)

    fun failureMessage(error: Throwable): String =
        sanitizeText(error.message ?: error.javaClass.simpleName).ifEmpty { error.javaClass.simpleName }

    private fun sanitizeText(value: Any?): String {
        val text = value?.toString() ?: return "null"
        val compact = text
            .replace(Regex("\\p{Cntrl}+"), " ")
            .replace(Regex("\\s+"), " ")
            .trim()
        return if (compact.length <= MAX_TEXT_LENGTH) compact else compact.take(MAX_TEXT_LENGTH)
    }

    private fun shortHash(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
        return digest.joinToString("") { byte -> "%02x".format(byte) }.take(HASH_CHARS)
    }

    private fun safeExtension(value: String): String? {
        val extension = value.substringAfterLast('.', missingDelimiterValue = "")
            .lowercase(Locale.US)
        if (extension.isBlank() || extension.length > 10) return null
        if (!extension.all { it in 'a'..'z' || it in '0'..'9' }) return null
        return extension
    }
}
