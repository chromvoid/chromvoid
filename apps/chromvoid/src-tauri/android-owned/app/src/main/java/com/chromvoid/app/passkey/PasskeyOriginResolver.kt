package com.chromvoid.app.passkey

import androidx.credentials.provider.CallingAppInfo
import java.net.URI
import java.security.MessageDigest
import java.util.Locale

internal object PasskeyOriginResolver {
    fun originForCallingApp(
        info: CallingAppInfo?,
        privilegedAllowlist: String = PRIVILEGED_BROWSER_ALLOWLIST,
        privilegedOriginReader: (CallingAppInfo, String) -> String? = ::readPrivilegedOrigin,
    ): String {
        val packageName = info?.packageName.orEmpty()
        val originPopulated = info?.isOriginPopulated() == true
        val browserOrigin = info?.let { resolvePrivilegedOrigin(it, privilegedAllowlist, privilegedOriginReader) }
        if (!browserOrigin.isNullOrBlank()) {
            val normalizedOrigin = browserOrigin.toWebOrigin()
            PasskeyTrace.important(
                "origin_privileged",
                "package" to packageName,
                "origin" to normalizedOrigin,
                "rawOrigin" to browserOrigin,
            )
            return normalizedOrigin
        }

        val signer =
            info?.let {
                runCatching { it.signingInfo.apkContentsSigners.firstOrNull()?.toByteArray() }
                    .getOrNull()
                    ?: runCatching { it.signingInfoCompat.apkContentsSigners.firstOrNull()?.toByteArray() }
                        .getOrNull()
            }
        if (signer != null) {
            val digest = MessageDigest.getInstance("SHA-256").digest(signer)
            PasskeyTrace.important("origin_apk_key_hash", "package" to packageName, "originPopulated" to originPopulated)
            return "android:apk-key-hash:${PasskeyEncoding.base64UrlEncode(digest)}"
        }

        PasskeyTrace.important("origin_unknown", "package" to packageName, "originPopulated" to originPopulated)
        return "android:apk-key-hash:unknown"
    }

    private fun resolvePrivilegedOrigin(
        info: CallingAppInfo,
        privilegedAllowlist: String,
        privilegedOriginReader: (CallingAppInfo, String) -> String?,
    ): String? {
        if (!info.isOriginPopulated()) {
            return null
        }
        return runCatching { privilegedOriginReader(info, privilegedAllowlist) }
            .onFailure {
                PasskeyTrace.important(
                    "origin_privileged_rejected",
                    "package" to info.packageName,
                    "error" to it.javaClass.simpleName,
                )
            }
            .getOrNull()
    }

    private fun readPrivilegedOrigin(
        info: CallingAppInfo,
        privilegedAllowlist: String,
    ): String? {
        return info.getOrigin(privilegedAllowlist)
    }

    private fun String.toWebOrigin(): String {
        val uri = runCatching { URI(this) }.getOrNull() ?: return this
        val scheme = uri.scheme?.lowercase(Locale.ROOT) ?: return this
        val host = uri.host?.lowercase(Locale.ROOT) ?: return this
        if (scheme != "http" && scheme != "https") {
            return this
        }

        val defaultPort =
            when (scheme) {
                "http" -> 80
                "https" -> 443
                else -> -1
            }
        val port = if (uri.port != -1 && uri.port != defaultPort) ":${uri.port}" else ""
        return "$scheme://$host$port"
    }

    private const val CHROME_RELEASE_SHA256 =
        "F0:FD:6C:5B:41:0F:25:CB:25:C3:B5:33:46:C8:97:2F:AE:30:F8:EE:74:11:DF:91:04:80:AD:6B:2D:60:DB:83"
    private const val FIREFOX_RELEASE_SHA256 =
        "A7:8B:62:A5:16:5B:44:94:B2:FE:AD:9E:76:A2:80:D2:2D:93:7F:EE:62:51:AE:CE:59:94:46:B2:EA:31:9B:04"

    private const val PRIVILEGED_BROWSER_ALLOWLIST =
        """{"apps":[{"type":"android","info":{"package_name":"com.android.chrome","signatures":[{"build":"release","cert_fingerprint_sha256":"$CHROME_RELEASE_SHA256"}]}},{"type":"android","info":{"package_name":"org.mozilla.firefox","signatures":[{"build":"release","cert_fingerprint_sha256":"$FIREFOX_RELEASE_SHA256"}]}}]}"""
}
