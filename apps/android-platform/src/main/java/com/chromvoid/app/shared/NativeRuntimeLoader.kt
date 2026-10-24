package com.chromvoid.app.shared

import android.util.Log

/**
 * Loads the host's native library before a shell's `external` call. The library is the
 * host's: Android-air installs its own at startup ([installLibrary]); the default names the
 * retired Tauri library, which no longer exists, so a shell of a host that installs nothing
 * reports itself unavailable instead of crashing.
 */
object NativeRuntimeLoader {
    private const val TAG = "ChromVoid/NativeRuntime"
    private const val DEFAULT_LIBRARY_NAME = "chromvoid_lib"

    @Volatile
    private var libraryName: String = DEFAULT_LIBRARY_NAME

    /** Names the host library the shells' native calls live in. */
    @JvmStatic
    fun installLibrary(name: String) {
        synchronized(lock) {
            libraryName = name.trim().ifEmpty { DEFAULT_LIBRARY_NAME }
        }
    }

    private val lock = Any()
    private val reportedUnavailableCallers = mutableSetOf<String>()

    @Volatile
    private var loadState: LoadState = LoadState.NotStarted
    private val libraryLoadStates = mutableMapOf<String, LoadState>()

    @Volatile
    private var loadLibraryForTests: ((String) -> Unit)? = null

    fun ensureLoaded(callerTag: String): Boolean = ensureLibraryLoaded(callerTag, libraryName)

    fun ensureLibraryLoaded(
        callerTag: String,
        libraryName: String,
    ): Boolean {
        val normalizedLibraryName = libraryName.trim()
        if (normalizedLibraryName.isEmpty()) return false

        when (val state = libraryState(normalizedLibraryName)) {
            LoadState.Loaded -> return true
            is LoadState.Failed -> {
                logUnavailableOnce(callerTag, normalizedLibraryName, state)
                return false
            }
            LoadState.NotStarted -> Unit
        }

        synchronized(lock) {
            when (val state = libraryStateLocked(normalizedLibraryName)) {
                LoadState.Loaded -> return true
                is LoadState.Failed -> {
                    logUnavailableOnce(callerTag, normalizedLibraryName, state)
                    return false
                }
                LoadState.NotStarted -> Unit
            }

            val error = runCatching {
                loadLibraryForTests?.invoke(normalizedLibraryName) ?: System.loadLibrary(normalizedLibraryName)
            }.exceptionOrNull()
            if (error == null) {
                setLibraryStateLocked(normalizedLibraryName, LoadState.Loaded)
                return true
            }

            val failed = LoadState.Failed(error)
            setLibraryStateLocked(normalizedLibraryName, failed)
            logUnavailableOnce(callerTag, normalizedLibraryName, failed)
            return false
        }
    }

    fun runWhenLoaded(callerTag: String, block: () -> Unit): Boolean {
        if (!ensureLoaded(callerTag)) return false
        return runCatching {
            block()
            true
        }.getOrElse { error ->
            if (error is UnsatisfiedLinkError) {
                recordInvocationFailure(callerTag, libraryName, error)
                false
            } else {
                throw error
            }
        }
    }

    fun <T> callWhenLoaded(callerTag: String, fallback: T, block: () -> T): T {
        if (!ensureLoaded(callerTag)) return fallback
        return runCatching {
            block()
        }.getOrElse { error ->
            if (error is UnsatisfiedLinkError) {
                recordInvocationFailure(callerTag, libraryName, error)
                fallback
            } else {
                throw error
            }
        }
    }

    internal fun setLoadLibraryForTests(loader: ((String) -> Unit)?) {
        synchronized(lock) {
            loadLibraryForTests = loader
            loadState = LoadState.NotStarted
            libraryLoadStates.clear()
            reportedUnavailableCallers.clear()
        }
    }

    internal fun resetForTests() {
        synchronized(lock) {
            libraryName = DEFAULT_LIBRARY_NAME
            loadLibraryForTests = null
            loadState = LoadState.NotStarted
            libraryLoadStates.clear()
            reportedUnavailableCallers.clear()
        }
    }

    internal fun stateForTests(): String =
        when (loadState) {
            LoadState.NotStarted -> "not_started"
            LoadState.Loaded -> "loaded"
            is LoadState.Failed -> "failed"
        }

    private fun recordInvocationFailure(
        callerTag: String,
        libraryName: String,
        error: UnsatisfiedLinkError,
    ) {
        val failed = LoadState.Failed(error)
        synchronized(lock) {
            setLibraryStateLocked(libraryName, failed)
        }
        logUnavailableOnce(callerTag, libraryName, failed)
    }

    private fun logUnavailableOnce(
        callerTag: String,
        libraryName: String,
        state: LoadState.Failed,
    ) {
        val shouldLog = synchronized(lock) {
            reportedUnavailableCallers.add("$callerTag:$libraryName")
        }
        if (!shouldLog) return

        Log.w(
            TAG,
            "Native runtime unavailable caller=$callerTag library=$libraryName error=${state.error.javaClass.simpleName}",
        )
    }

    private fun libraryState(libraryName: String): LoadState =
        synchronized(lock) {
            libraryStateLocked(libraryName)
        }

    private fun libraryStateLocked(libraryName: String): LoadState =
        if (libraryName == this.libraryName) {
            loadState
        } else {
            libraryLoadStates[libraryName] ?: LoadState.NotStarted
        }

    private fun setLibraryStateLocked(
        libraryName: String,
        state: LoadState,
    ) {
        if (libraryName == this.libraryName) {
            loadState = state
        } else {
            libraryLoadStates[libraryName] = state
        }
    }

    private sealed interface LoadState {
        data object NotStarted : LoadState
        data object Loaded : LoadState
        data class Failed(val error: Throwable) : LoadState
    }
}
