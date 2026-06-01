package com.chromvoid.app.nativebridge

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import com.chromvoid.app.AudioPlaybackCommand
import com.chromvoid.app.AudioPlaybackDiagnostics
import com.chromvoid.app.BuildConfig
import com.chromvoid.app.ChromVoidAudioSessionService
import com.chromvoid.app.shared.ForegroundServiceSupport
import com.chromvoid.app.shared.NativeRuntimeLoader
import java.util.concurrent.CountDownLatch
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean

internal object AudioPlaybackNativeShell {
    private const val TAG = "ChromVoid/AudioPlayback"
    private const val MAIN_THREAD_DISPATCH_TIMEOUT_MS = 2_000L
    private const val SERVICE_DISPATCH_ACK_TIMEOUT_MS = 4_000L
    private const val ERR_SERVICE_DISPATCH_FAILED = "ERR_NATIVE_AUDIO_SERVICE_DISPATCH_FAILED"
    private const val ERR_SERVICE_DISPATCH_TIMEOUT = "ERR_NATIVE_AUDIO_SERVICE_DISPATCH_TIMEOUT"
    private val pendingDispatchAcks = ConcurrentHashMap<String, PendingDispatchAck>()
    private var serviceDispatcherForTests: ((Context, String) -> Boolean)? = null
    private var warmupServiceDispatcherForTests: ((Context) -> Boolean)? = null
    private var audioSourceReleaserForTests: ((String) -> Unit)? = null
    private var audioPlayerEventEmitterForTests: ((String) -> Unit)? = null
    private var serviceDispatchAckTimeoutMsForTests: Long? = null

    @JvmStatic
    fun sendCommand(
        context: Context,
        commandJson: String,
    ): Boolean {
        if (commandJson.isBlank()) return false
        trace(
            "native_shell_send",
            "command" to AudioPlaybackCommand.commandNameFromJson(commandJson),
            "nativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(AudioPlaybackCommand.nativeSessionIdFromJson(commandJson)),
            "dispatchId" to AudioPlaybackDiagnostics.redactIdentifier(AudioPlaybackCommand.dispatchIdFromJson(commandJson)),
        )
        val command = AudioPlaybackCommand.fromJson(commandJson)
        if (command == null) {
            Log.w(TAG, "Ignoring invalid audio command payload")
            return false
        }

        val appContext = context.applicationContext
        val dispatch = {
            runCatching {
                trace(
                    "native_shell_start_service",
                    "command" to AudioPlaybackDiagnostics.commandName(command),
                    "nativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(command.nativeSessionId),
                    "dispatchId" to AudioPlaybackDiagnostics.redactIdentifier(command.dispatchId),
                )
                val accepted = dispatchAudioService(appContext, commandJson)
                trace(
                    "native_shell_dispatch_result",
                    "command" to AudioPlaybackDiagnostics.commandName(command),
                    "nativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(command.nativeSessionId),
                    "dispatchId" to AudioPlaybackDiagnostics.redactIdentifier(command.dispatchId),
                    "accepted" to accepted,
                )
                accepted
            }.getOrElse { error ->
                Log.w(TAG, "Failed to dispatch audio command", error)
                trace(
                    "native_shell_dispatch_result",
                    "command" to AudioPlaybackDiagnostics.commandName(command),
                    "nativeSessionId" to AudioPlaybackDiagnostics.redactIdentifier(command.nativeSessionId),
                    "dispatchId" to AudioPlaybackDiagnostics.redactIdentifier(command.dispatchId),
                    "accepted" to false,
                )
                false
            }
        }

        if (Looper.myLooper() == Looper.getMainLooper()) {
            // Main-thread callers cannot block waiting for service acknowledgement; the WebView
            // start watchdog remains the bounded failure path for this compatibility branch.
            return dispatch()
        }

        val dispatchId = command.dispatchId
        if (dispatchId != null) {
            return dispatchAndAwaitServiceAck(dispatchId, dispatch)
        }

        val latch = CountDownLatch(1)
        val result = AtomicBoolean(false)
        Handler(Looper.getMainLooper()).post {
            result.set(dispatch())
            latch.countDown()
        }
        return latch.await(MAIN_THREAD_DISPATCH_TIMEOUT_MS, TimeUnit.MILLISECONDS) && result.get()
    }

    @JvmStatic
    fun warmup(context: Context): Boolean {
        val appContext = context.applicationContext
        val dispatch = {
            runCatching {
                trace("native_shell_warmup_start")
                val accepted = dispatchAudioServiceWarmup(appContext)
                trace("native_shell_warmup_result", "accepted" to accepted)
                accepted
            }.getOrElse { error ->
                Log.w(TAG, "Failed to warm up audio service", error)
                trace("native_shell_warmup_result", "accepted" to false)
                false
            }
        }

        if (Looper.myLooper() == Looper.getMainLooper()) {
            return dispatch()
        }

        val latch = CountDownLatch(1)
        val result = AtomicBoolean(false)
        Handler(Looper.getMainLooper()).post {
            result.set(dispatch())
            latch.countDown()
        }
        return latch.await(MAIN_THREAD_DISPATCH_TIMEOUT_MS, TimeUnit.MILLISECONDS) && result.get()
    }

    @JvmStatic
    internal fun reportCommandHandled(
        dispatchId: String?,
        accepted: Boolean,
        terminal: Boolean,
        errorCode: String?,
    ) {
        val id = dispatchId?.trim()?.takeIf { it.isNotEmpty() } ?: return
        pendingDispatchAcks.remove(id)?.complete(accepted, terminal, errorCode)
    }

    @JvmStatic
    internal fun createPendingDispatchAckForTests(dispatchId: String): PendingDispatchAckHandle {
        val pending = PendingDispatchAck()
        pendingDispatchAcks[dispatchId] = pending
        return PendingDispatchAckHandle(dispatchId, pending)
    }

    @JvmStatic
    internal fun resetPendingDispatchAcksForTests() {
        pendingDispatchAcks.clear()
        serviceDispatcherForTests = null
        warmupServiceDispatcherForTests = null
        audioSourceReleaserForTests = null
        audioPlayerEventEmitterForTests = null
        serviceDispatchAckTimeoutMsForTests = null
    }

    @JvmStatic
    internal fun setServiceDispatcherForTests(dispatcher: ((Context, String) -> Boolean)?) {
        serviceDispatcherForTests = dispatcher
    }

    @JvmStatic
    internal fun setWarmupServiceDispatcherForTests(dispatcher: ((Context) -> Boolean)?) {
        warmupServiceDispatcherForTests = dispatcher
    }

    @JvmStatic
    internal fun setAudioSourceReleaserForTests(releaser: ((String) -> Unit)?) {
        audioSourceReleaserForTests = releaser
    }

    @JvmStatic
    internal fun setAudioPlayerEventEmitterForTests(emitter: ((String) -> Unit)?) {
        audioPlayerEventEmitterForTests = emitter
    }

    @JvmStatic
    internal fun setServiceDispatchAckTimeoutMsForTests(timeoutMs: Long?) {
        serviceDispatchAckTimeoutMsForTests = timeoutMs
    }

    private fun dispatchAndAwaitServiceAck(
        dispatchId: String,
        dispatch: () -> Boolean,
    ): Boolean {
        val pending = PendingDispatchAck()
        if (pendingDispatchAcks.putIfAbsent(dispatchId, pending) != null) {
            Log.w(TAG, "Audio command dispatch rejected: duplicate dispatch id")
            return false
        }

        Handler(Looper.getMainLooper()).post {
            if (!dispatch()) {
                pendingDispatchAcks.remove(dispatchId)
                pending.complete(
                    accepted = false,
                    terminal = true,
                    errorCode = ERR_SERVICE_DISPATCH_FAILED,
                )
            }
        }

        val acknowledged = pending.await(serviceDispatchAckTimeoutMsForTests ?: SERVICE_DISPATCH_ACK_TIMEOUT_MS)
        pendingDispatchAcks.remove(dispatchId)
        if (!acknowledged) {
            Log.w(TAG, "Audio command dispatch timed out waiting for service acknowledgement")
            return false
        }
        if (!pending.accepted) {
            Log.w(TAG, "Audio command dispatch rejected by service: ${pending.errorCode ?: "unknown"}")
        }
        return pending.accepted
    }

    @JvmStatic
    internal fun readAudioSource(
        token: String,
        offset: Long,
        length: Int,
    ): AudioSourceReadResult =
        NativeRuntimeLoader.callWhenLoaded(
            callerTag = TAG,
            fallback = AudioSourceReadResult(bytes = null, errorCode = "ERR_NATIVE_AUDIO_SOURCE_READ"),
        ) {
            nativeReadAudioSource(token, offset, length)
                ?: AudioSourceReadResult(bytes = null, errorCode = "ERR_NATIVE_AUDIO_SOURCE_READ")
        }

    @JvmStatic
    internal fun releaseAudioSource(token: String) {
        if (token.isBlank()) return
        audioSourceReleaserForTests?.let {
            it(token)
            return
        }
        NativeRuntimeLoader.runWhenLoaded(TAG) { nativeReleaseAudioSource(token) }
    }

    @JvmStatic
    internal fun onAudioPlayerEvent(eventJson: String) {
        if (eventJson.isBlank()) return
        audioPlayerEventEmitterForTests?.let {
            it(eventJson)
            return
        }
        NativeRuntimeLoader.runWhenLoaded(TAG) { nativeOnAudioPlayerEvent(eventJson) }
    }

    @JvmStatic
    private external fun nativeReadAudioSource(
        token: String,
        offset: Long,
        length: Int,
    ): AudioSourceReadResult?

    @JvmStatic
    private external fun nativeReleaseAudioSource(token: String)

    @JvmStatic
    private external fun nativeOnAudioPlayerEvent(eventJson: String): String?

    private fun dispatchAudioService(
        context: Context,
        commandJson: String,
    ): Boolean {
        serviceDispatcherForTests?.let { return it(context, commandJson) }
        return ForegroundServiceSupport.startForegroundService(
            context,
            Intent(context, ChromVoidAudioSessionService::class.java)
                .setAction(ChromVoidAudioSessionService.ACTION_COMMAND)
                .putExtra(ChromVoidAudioSessionService.EXTRA_COMMAND_JSON, commandJson),
            TAG,
        )
    }

    private fun dispatchAudioServiceWarmup(context: Context): Boolean {
        warmupServiceDispatcherForTests?.let { return it(context) }
        return context.startService(
            Intent(context, ChromVoidAudioSessionService::class.java)
                .setAction(ChromVoidAudioSessionService.ACTION_WARMUP),
        ) != null
    }

    internal data class PendingDispatchAckSnapshot(
        val accepted: Boolean,
        val terminal: Boolean,
        val errorCode: String?,
    )

    internal class PendingDispatchAckHandle internal constructor(
        private val dispatchId: String,
        private val pending: PendingDispatchAck,
    ) {
        fun await(timeoutMs: Long): PendingDispatchAckSnapshot? {
            if (!pending.await(timeoutMs)) return null
            pendingDispatchAcks.remove(dispatchId)
            return PendingDispatchAckSnapshot(
                accepted = pending.accepted,
                terminal = pending.terminal,
                errorCode = pending.errorCode,
            )
        }
    }

    internal class PendingDispatchAck {
        private val latch = CountDownLatch(1)

        @Volatile
        var accepted: Boolean = false
            private set

        @Volatile
        var terminal: Boolean = false
            private set

        @Volatile
        var errorCode: String? = ERR_SERVICE_DISPATCH_TIMEOUT
            private set

        fun complete(
            accepted: Boolean,
            terminal: Boolean,
            errorCode: String?,
        ) {
            this.accepted = accepted
            this.terminal = terminal
            this.errorCode = errorCode
            latch.countDown()
        }

        fun await(timeoutMs: Long): Boolean = latch.await(timeoutMs, TimeUnit.MILLISECONDS)
    }

    private fun trace(event: String, vararg fields: Pair<String, Any?>) {
        val suffix =
            fields.joinToString(" ") { (key, value) ->
                "$key=${AudioPlaybackDiagnostics.traceValue(value)}"
            }
        val message = "elapsedMs=${SystemClock.elapsedRealtime()} event=$event $suffix"
        if (BuildConfig.DEBUG) {
            Log.d(TAG, message)
            return
        }
        Log.i(TAG, message)
    }

}
