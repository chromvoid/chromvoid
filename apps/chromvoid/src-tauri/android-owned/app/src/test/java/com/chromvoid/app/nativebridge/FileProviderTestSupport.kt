package com.chromvoid.app.nativebridge

import androidx.core.content.FileProvider

internal fun resetFileProviderCache() {
    val cacheField = FileProvider::class.java.getDeclaredField("sCache")
    cacheField.isAccessible = true
    @Suppress("UNCHECKED_CAST")
    val cache = cacheField.get(null) as MutableMap<String, *>
    cache.clear()
}
