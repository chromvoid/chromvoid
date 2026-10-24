package com.chromvoid.app.nativebridge

import android.app.Application
import android.content.Context
import android.content.Intent
import android.os.Looper
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.AudioPlaybackCommand
import com.chromvoid.app.ChromVoidAudioSessionService
import com.chromvoid.app.shared.ForegroundServiceSupport
import com.chromvoid.app.shared.NativeRuntimeLoader
import java.util.concurrent.atomic.AtomicReference
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioPlaybackNativeShellTest {
    @After
    fun tearDown() {
        AudioPlaybackNativeShell.resetPendingDispatchAcksForTests()
        ForegroundServiceSupport.resetForTests()
        NativeRuntimeLoader.resetForTests()
    }

    @Test
    fun reportCommandHandledCompletesPendingAcknowledgement() {
        val pending = AudioPlaybackNativeShell.createPendingDispatchAckForTests("dispatch-1")

        AudioPlaybackNativeShell.reportCommandHandled(
            dispatchId = "dispatch-1",
            accepted = true,
            terminal = false,
            errorCode = null,
        )

        val result = pending.await(100)
        assertEquals(true, result?.accepted)
        assertEquals(false, result?.terminal)
        assertNull(result?.errorCode)
    }

    @Test
    fun reportCommandHandledRecordsRejectedAcknowledgement() {
        val pending = AudioPlaybackNativeShell.createPendingDispatchAckForTests("dispatch-1")

        AudioPlaybackNativeShell.reportCommandHandled(
            dispatchId = "dispatch-1",
            accepted = false,
            terminal = true,
            errorCode = "ERR_NATIVE_AUDIO_COMMAND_REJECTED",
        )

        val result = pending.await(100)
        assertEquals(false, result?.accepted)
        assertEquals(true, result?.terminal)
        assertEquals("ERR_NATIVE_AUDIO_COMMAND_REJECTED", result?.errorCode)
    }

    @Test
    fun reportCommandHandledIgnoresMissingDispatchId() {
        val pending = AudioPlaybackNativeShell.createPendingDispatchAckForTests("dispatch-1")

        AudioPlaybackNativeShell.reportCommandHandled(
            dispatchId = null,
            accepted = true,
            terminal = false,
            errorCode = null,
        )

        assertNull(pending.await(10))
    }

    @Test
    fun sendCommandWaitsForBackgroundServiceAcknowledgement() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        AudioPlaybackNativeShell.setServiceDispatchAckTimeoutMsForTests(250L)
        AudioPlaybackNativeShell.setServiceDispatcherForTests { _, commandJson ->
            AudioPlaybackNativeShell.reportCommandHandled(
                dispatchId = AudioPlaybackCommand.dispatchIdFromJson(commandJson),
                accepted = true,
                terminal = false,
                errorCode = null,
            )
            true
        }

        val result = runSendCommandOnBackgroundThread(context, commandJson("dispatch-1"))

        assertEquals(true, result)
    }

    @Test
    fun sendCommandReturnsFalseWhenServiceRejectsBackgroundAcknowledgement() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        AudioPlaybackNativeShell.setServiceDispatchAckTimeoutMsForTests(250L)
        AudioPlaybackNativeShell.setServiceDispatcherForTests { _, commandJson ->
            AudioPlaybackNativeShell.reportCommandHandled(
                dispatchId = AudioPlaybackCommand.dispatchIdFromJson(commandJson),
                accepted = false,
                terminal = true,
                errorCode = "ERR_NATIVE_AUDIO_COMMAND_REJECTED",
            )
            true
        }

        val result = runSendCommandOnBackgroundThread(context, commandJson("dispatch-1"))

        assertEquals(false, result)
    }

    @Test
    fun sendCommandReturnsFalseWhenBackgroundAcknowledgementTimesOut() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        AudioPlaybackNativeShell.setServiceDispatchAckTimeoutMsForTests(25L)
        AudioPlaybackNativeShell.setServiceDispatcherForTests { _, _ -> true }

        val result = runSendCommandOnBackgroundThread(context, commandJson("dispatch-1"))

        assertEquals(false, result)
    }

    @Test
    fun sendCommandDoesNotWaitForAcknowledgementOnMainThread() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        var dispatched = false
        AudioPlaybackNativeShell.setServiceDispatcherForTests { _, _ ->
            dispatched = true
            true
        }

        val result = AudioPlaybackNativeShell.sendCommand(context, commandJson("dispatch-1"))

        assertTrue(dispatched)
        assertTrue(result)
    }

    @Test
    fun sendCommandReturnsFalseWhenForegroundServiceStartIsDenied() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        ForegroundServiceSupport.setStartForegroundServiceForTests { _, _ ->
            throw IllegalStateException("denied")
        }

        val result = AudioPlaybackNativeShell.sendCommand(context, commandJson("dispatch-1"))

        assertFalse(result)
    }

    @Test
    fun sendCommandDispatchesNativeAudioServiceIntent() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val commandJson = commandJson("dispatch-1")

        val result = AudioPlaybackNativeShell.sendCommand(context, commandJson)

        val started = shadowOf(context).nextStartedService
        assertTrue(result)
        assertEquals(ChromVoidAudioSessionService.ACTION_COMMAND, started.action)
        assertEquals(ChromVoidAudioSessionService::class.java.name, started.component?.className)
        assertEquals(commandJson, started.getStringExtra(ChromVoidAudioSessionService.EXTRA_COMMAND_JSON))
    }

    @Test
    fun warmupDispatchesNativeAudioWarmupIntent() {
        val context = ApplicationProvider.getApplicationContext<Application>()

        val result = AudioPlaybackNativeShell.warmup(context)

        val started = shadowOf(context).nextStartedService
        assertTrue(result)
        assertEquals(ChromVoidAudioSessionService.ACTION_WARMUP, started.action)
        assertEquals(ChromVoidAudioSessionService::class.java.name, started.component?.className)
    }

    @Test
    fun warmupUsesMainThreadDispatchFromBackgroundThread() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        var dispatched = false
        AudioPlaybackNativeShell.setWarmupServiceDispatcherForTests {
            dispatched = true
            true
        }

        val result = runWarmupOnBackgroundThread(context)

        assertTrue(dispatched)
        assertEquals(true, result)
    }

    @Test
    fun readAudioSourceReturnsErrorWhenNativeRuntimeUnavailable() {
        NativeRuntimeLoader.setLoadLibraryForTests {
            throw UnsatisfiedLinkError("missing")
        }

        val result = AudioPlaybackNativeShell.readAudioSource("token-1", offset = 0, length = 1024)

        assertNull(result.bytes)
        assertEquals("ERR_NATIVE_AUDIO_SOURCE_READ", result.errorCode)
    }

    @Test
    fun serviceReportsRejectedAcknowledgementForInvalidJsonWithDispatchId() {
        val pending = AudioPlaybackNativeShell.createPendingDispatchAckForTests("dispatch-1")
        val serviceController =
            Robolectric
                .buildService(ChromVoidAudioSessionService::class.java)
                .create()
        val service = serviceController.get()
        val intent =
            Intent()
                .setAction(ChromVoidAudioSessionService.ACTION_COMMAND)
                .putExtra(
                    ChromVoidAudioSessionService.EXTRA_COMMAND_JSON,
                    JSONObject()
                        .put("dispatchId", "dispatch-1")
                        .put("command", "unknown")
                        .put("nativeSessionId", "native-1")
                        .toString(),
                )

        try {
            service.onStartCommand(intent, 0, 1)
        } finally {
            serviceController.destroy()
        }

        val result = pending.await(100)
        assertEquals(false, result?.accepted)
        assertEquals(true, result?.terminal)
        assertEquals("ERR_NATIVE_AUDIO_COMMAND_INVALID_JSON", result?.errorCode)
    }

    private fun runSendCommandOnBackgroundThread(
        context: Context,
        commandJson: String,
    ): Boolean? {
        val result = AtomicReference<Boolean?>()
        val error = AtomicReference<Throwable?>()
        val thread =
            Thread {
                try {
                    result.set(AudioPlaybackNativeShell.sendCommand(context, commandJson))
                } catch (throwable: Throwable) {
                    error.set(throwable)
                }
            }
        thread.start()
        repeat(20) {
            shadowOf(Looper.getMainLooper()).idle()
            thread.join(50L)
            if (!thread.isAlive) return@repeat
        }
        assertFalse(thread.isAlive)
        error.get()?.let { throw it }
        return result.get()
    }

    private fun runWarmupOnBackgroundThread(context: Context): Boolean? {
        val result = AtomicReference<Boolean?>()
        val error = AtomicReference<Throwable?>()
        val thread =
            Thread {
                try {
                    result.set(AudioPlaybackNativeShell.warmup(context))
                } catch (throwable: Throwable) {
                    error.set(throwable)
                }
            }
        thread.start()
        repeat(20) {
            shadowOf(Looper.getMainLooper()).idle()
            thread.join(50L)
            if (!thread.isAlive) return@repeat
        }
        assertFalse(thread.isAlive)
        error.get()?.let { throw it }
        return result.get()
    }

    private fun commandJson(dispatchId: String): String =
        JSONObject()
            .put("dispatchId", dispatchId)
            .put("command", "pause")
            .put("nativeSessionId", "native-1")
            .toString()
}
