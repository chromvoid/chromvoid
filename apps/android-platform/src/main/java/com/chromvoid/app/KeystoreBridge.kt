package com.chromvoid.app

import com.chromvoid.app.security.PepperStore
import com.chromvoid.app.shared.AndroidRuntimeAccess

/**
 * Stable Android keystore boundary for Rust callers.
 * The Rust Android keystore backend still resolves this exact class name directly.
 */
object KeystoreBridge {
    @JvmStatic
    fun loadPepper(): ByteArray? = requirePepperStore().loadPepper()

    @JvmStatic
    fun storePepper(pepper: ByteArray) {
        requirePepperStore().storePepper(pepper)
    }

    @JvmStatic
    fun deletePepper() {
        requirePepperStore().deletePepper()
    }

    private fun requirePepperStore(): PepperStore {
        return AndroidRuntimeAccess.appGraphOrNull()?.pepperStore
            ?: throw IllegalStateException("ChromVoid application graph is not available")
    }
}
