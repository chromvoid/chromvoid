package com.chromvoid.app.passkey

import android.util.Base64

internal object PasskeyEncoding {
    fun base64UrlEncode(value: ByteArray): String {
        return Base64.encodeToString(value, Base64.NO_WRAP or Base64.URL_SAFE or Base64.NO_PADDING)
    }

    fun base64UrlDecode(value: String): ByteArray {
        return Base64.decode(value, Base64.NO_WRAP or Base64.URL_SAFE or Base64.NO_PADDING)
    }
}
