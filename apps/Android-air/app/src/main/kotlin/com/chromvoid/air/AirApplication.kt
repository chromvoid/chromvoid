package com.chromvoid.air

import android.app.Application
import android.content.Intent
import android.os.Build
import android.system.ErrnoException
import android.system.Os
import com.chromvoid.air.ffi.AirNative
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.app.shared.NativeRuntimeLoader
import com.chromvoid.app.shared.PlatformHost

/**
 * Hands the application context to Rust once per process, before anything can
 * construct a runtime. Core reaches the Android keystore through JNI, so this
 * must happen in every process that can reach Core, not only in this one. The
 * keystore bridge it reaches reads the shared platform graph, so that is
 * installed first.
 *
 * A failure here is not fatal: the bridge surface repeats the handover and
 * reports the real reason instead of a crash with no explanation.
 *
 * The platform's provider shells call into this app's native library, and
 * another app's request that finds the vault locked opens this app's unlock screen.
 * A login the system was asked to save comes to this app's inbox, and the
 * status notification and the Quick Settings tile lock this app's vault.
 */
public class AirApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        nameTheTemporaryDirectory()
        PlatformHost.install(this)
        NativeRuntimeLoader.installLibrary(NATIVE_LIBRARY)
        PlatformHost.installProviderUnlock { context -> Intent(context, ProviderUnlockActivity::class.java) }
        PlatformHost.installQuickLock { AirAppGraph.of(this).lockFromOutside() }
        PlatformHost.installPasswordSaveReceiver { context, token ->
            AirAppGraph.of(context).offeredLogins.receive(token)
        }
        AirNative.tryInitialize(this)
    }

    /**
     * Rust's temporary files - Core holds a backup being restored in one - go where `TMPDIR` says.
     * From Android 11 the system points it at the app's cache; Android 10 leaves it unset, and the
     * fallback, /data/local/tmp, is closed to apps. The same cache is named here, before Rust loads.
     */
    private fun nameTheTemporaryDirectory() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) return
        try {
            Os.setenv("TMPDIR", cacheDir.absolutePath, true)
        } catch (_: ErrnoException) {
            // A restore then reports that it could not hold the backup, as before.
        }
    }
}

/** The library the Rust bindings and the provider shells' native calls live in. */
private const val NATIVE_LIBRARY: String = "chromvoid_air_ffi"
