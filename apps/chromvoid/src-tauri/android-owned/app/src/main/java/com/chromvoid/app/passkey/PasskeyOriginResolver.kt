package com.chromvoid.app.passkey

import androidx.credentials.provider.CallingAppInfo
import java.security.MessageDigest

internal object PasskeyOriginResolver {
    fun originForCallingApp(info: CallingAppInfo?): String {
        val origin =
            info?.let {
                runCatching {
                    CallingAppInfo::class.java
                        .getMethod("getOrigin\$credentials_release")
                        .invoke(it) as? String
                }.getOrNull()
            }
        if (!origin.isNullOrBlank()) {
            return origin
        }

        val signer = info?.signingInfo?.apkContentsSigners?.firstOrNull()?.toByteArray()
        if (signer != null) {
            val digest = MessageDigest.getInstance("SHA-256").digest(signer)
            return "android:apk-key-hash:${PasskeyEncoding.base64UrlEncode(digest)}"
        }

        return "android:apk-key-hash:unknown"
    }
}
