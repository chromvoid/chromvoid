package com.chromvoid.app

import androidx.credentials.provider.CallingAppInfo
import com.chromvoid.app.passkey.PasskeyOriginResolver
import java.net.URL

internal data class PasswordProviderContext(
    val origin: String,
    val domain: String,
)

internal fun passwordProviderContext(info: CallingAppInfo?): PasswordProviderContext? {
    val origin = PasskeyOriginResolver.originForCallingApp(info).trim()
    val url =
        runCatching { URL(origin) }.getOrNull()
            ?: return null
    if (url.protocol !in setOf("http", "https")) {
        return null
    }

    val domain = url.host.trim().lowercase()
    if (domain.isEmpty()) {
        return null
    }

    val normalizedOrigin = origin.trimEnd('/')
    return PasswordProviderContext(
        origin = normalizedOrigin.ifEmpty { "${url.protocol}://$domain" },
        domain = domain,
    )
}
