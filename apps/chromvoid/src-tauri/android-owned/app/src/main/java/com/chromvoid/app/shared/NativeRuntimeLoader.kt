package com.chromvoid.app.shared

import android.util.Log

internal object NativeRuntimeLoader {
    private const val TAG = "ChromVoid/NativeRuntime"
    private const val LIBRARY_NAME = "chromvoid_lib"

    private val lock = Any()
    private val reportedUnavailableCallers = mutableSetOf<String>()

    @Volatile
    private var loadState: LoadState = LoadState.NotStarted

    @Volatile
    private var loadLibraryForTests: ((String) -> Unit)? = null

    fun ensureLoaded(callerTag: String): Boolean {
        when (val state = loadState) {
            LoadState.Loaded -> return true
            is LoadState.Failed -> {
                logUnavailableOnce(callerTag, state)
                return false
            }
            LoadState.NotStarted -> Unit
        }

        synchronized(lock) {
            when (val state = loadState) {
                LoadState.Loaded -> return true
                is LoadState.Failed -> {
                    logUnavailableOnce(callerTag, state)
                    return false
                }
                LoadState.NotStarted -> Unit
            }

            val error = runCatching {
                loadLibraryForTests?.invoke(LIBRARY_NAME) ?: System.loadLibrary(LIBRARY_NAME)
            }.exceptionOrNull()
            if (error == null) {
                loadState = LoadState.Loaded
                return true
            }

            val failed = LoadState.Failed(error)
            loadState = failed
            logUnavailableOnce(callerTag, failed)
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
                recordInvocationFailure(callerTag, error)
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
                recordInvocationFailure(callerTag, error)
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
            reportedUnavailableCallers.clear()
        }
    }

    internal fun resetForTests() {
        synchronized(lock) {
            loadLibraryForTests = null
            loadState = LoadState.NotStarted
            reportedUnavailableCallers.clear()
        }
    }

    internal fun stateForTests(): String =
        when (loadState) {
            LoadState.NotStarted -> "not_started"
            LoadState.Loaded -> "loaded"
            is LoadState.Failed -> "failed"
        }

    private fun recordInvocationFailure(callerTag: String, error: UnsatisfiedLinkError) {
        val failed = LoadState.Failed(error)
        synchronized(lock) {
            loadState = failed
        }
        logUnavailableOnce(callerTag, failed)
    }

    private fun logUnavailableOnce(callerTag: String, state: LoadState.Failed) {
        val shouldLog = synchronized(lock) {
            reportedUnavailableCallers.add(callerTag)
        }
        if (!shouldLog) return

        Log.w(TAG, "Native runtime unavailable caller=$callerTag error=${state.error.javaClass.simpleName}")
    }

    private sealed interface LoadState {
        data object NotStarted : LoadState
        data object Loaded : LoadState
        data class Failed(val error: Throwable) : LoadState
    }
}
