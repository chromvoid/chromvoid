package com.chromvoid.air.ffi

import android.content.Context

/**
 * Process-wide handover of the Android application context to Rust.
 *
 * Core reaches the Android keystore through JNI, and `ndk-context` only keeps
 * raw pointers, so the context must be handed over once per process - in every
 * process that can reach Core, not only the main one - before any runtime is
 * constructed. Loading the library here also means JNA finds it already
 * resident when the generated bindings initialize.
 */
public object AirNative {
    private const val LIBRARY_NAME: String = "chromvoid_air_ffi"

    @Volatile
    private var initialized: Boolean = false

    @JvmStatic
    @Synchronized
    public fun initialize(context: Context) {
        if (initialized) return
        System.loadLibrary(LIBRARY_NAME)
        check(initializeRustContext(context.applicationContext)) {
            "ChromVoid native context initialization failed"
        }
        initialized = true
    }

    /**
     * Startup handover that never crashes the process. A missing or mismatched
     * library is a diagnosable state, not a fatal one: the bridge surface
     * re-attempts the handover and explains the actual failure. Returns false
     * on a host JVM, where no Android library exists at all.
     */
    @JvmStatic
    public fun tryInitialize(context: Context): Boolean =
        try {
            initialize(context)
            true
        } catch (error: UnsatisfiedLinkError) {
            false
        } catch (error: IllegalStateException) {
            false
        }

    @JvmStatic
    public fun isInitialized(): Boolean = initialized

    @JvmStatic
    private external fun initializeRustContext(applicationContext: Context): Boolean
}
