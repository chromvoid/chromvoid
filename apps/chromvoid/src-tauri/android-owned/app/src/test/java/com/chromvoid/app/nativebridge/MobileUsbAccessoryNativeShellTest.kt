package com.chromvoid.app.nativebridge

import android.hardware.usb.UsbAccessory
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class MobileUsbAccessoryNativeShellTest {
    @Test
    fun openerDetachesFdAndCallsNativeSinkWithIdentityJson() {
        val sink = RecordingNativeSink(startResult = true)
        val descriptor = FakeDescriptor(fd = 42)
        val opener =
            MobileUsbAccessoryNativeShell.createSessionOpenerForTests(
                descriptorOpener = FakeDescriptorOpener(descriptor),
                nativeSink = sink,
            )

        val handle = opener.open(chromVoidAccessory(), chromVoidIdentity())

        val started = sink.started.single()
        assertEquals(42, started.fd)
        assertTrue(descriptor.detached)
        assertEquals(0, descriptor.closeCount)
        assertEquals(MobileUsbAccessoryIntentContract.MANUFACTURER, started.identityJson.getString("manufacturer"))
        assertEquals(MobileUsbAccessoryIntentContract.MODEL, started.identityJson.getString("model"))
        assertEquals("serial-1", started.identityJson.getString("serial"))
        handle.close(MobileUsbAccessorySessionStopReason.ExplicitDisconnect)
        assertEquals(
            listOf(StoppedSession(started.sessionId, "explicit_disconnect")),
            sink.stopped,
        )
    }

    @Test
    fun handleCloseIsIdempotent() {
        val sink = RecordingNativeSink(startResult = true)
        val opener =
            MobileUsbAccessoryNativeShell.createSessionOpenerForTests(
                descriptorOpener = FakeDescriptorOpener(FakeDescriptor(fd = 43)),
                nativeSink = sink,
            )
        val handle = opener.open(chromVoidAccessory(), chromVoidIdentity())
        val sessionId = sink.started.single().sessionId

        handle.close(MobileUsbAccessorySessionStopReason.AccessoryDetached)
        handle.close(MobileUsbAccessorySessionStopReason.ExplicitDisconnect)

        assertEquals(listOf(StoppedSession(sessionId, "accessory_detached")), sink.stopped)
    }

    @Test
    fun nativeStartFalseClosesDetachedFdAndFails() {
        val sink = RecordingNativeSink(startResult = false)
        val closed = mutableListOf<Int>()
        val opener =
            MobileUsbAccessoryNativeShell.createSessionOpenerForTests(
                descriptorOpener = FakeDescriptorOpener(FakeDescriptor(fd = 44)),
                nativeSink = sink,
                detachedFdCloser = { fd -> closed += fd },
            )

        val result = runCatching { opener.open(chromVoidAccessory(), chromVoidIdentity()) }

        assertTrue(result.isFailure)
        assertEquals(listOf(sink.started.single().fd), closed)
    }

    @Test
    fun nativeStartThrowClosesDetachedFdAndFails() {
        val sink = RecordingNativeSink(startResult = true).apply {
            throwOnStart = true
        }
        val closed = mutableListOf<Int>()
        val opener =
            MobileUsbAccessoryNativeShell.createSessionOpenerForTests(
                descriptorOpener = FakeDescriptorOpener(FakeDescriptor(fd = 45)),
                nativeSink = sink,
                detachedFdCloser = { fd -> closed += fd },
            )

        val result = runCatching { opener.open(chromVoidAccessory(), chromVoidIdentity()) }

        assertTrue(result.isFailure)
        assertEquals(1, closed.size)
    }

    @Test
    fun nullDescriptorFailsBeforeNativeStart() {
        val sink = RecordingNativeSink(startResult = true)
        val opener =
            MobileUsbAccessoryNativeShell.createSessionOpenerForTests(
                descriptorOpener = MobileUsbAccessoryDescriptorOpener { null },
                nativeSink = sink,
            )

        val result = runCatching { opener.open(chromVoidAccessory(), chromVoidIdentity()) }

        assertTrue(result.isFailure)
        assertTrue(sink.started.isEmpty())
    }

    @Test
    fun descriptorDetachFailureClosesDescriptorAndFailsBeforeNativeStart() {
        val descriptor = FakeDescriptor(fd = 46).apply {
            failDetach = true
        }
        val sink = RecordingNativeSink(startResult = true)
        val opener =
            MobileUsbAccessoryNativeShell.createSessionOpenerForTests(
                descriptorOpener = FakeDescriptorOpener(descriptor),
                nativeSink = sink,
            )

        val result = runCatching { opener.open(chromVoidAccessory(), chromVoidIdentity()) }

        assertTrue(result.isFailure)
        assertEquals(1, descriptor.closeCount)
        assertTrue(sink.started.isEmpty())
    }

    private class FakeDescriptorOpener(
        private val descriptor: MobileUsbAccessoryDescriptor?,
    ) : MobileUsbAccessoryDescriptorOpener {
        override fun open(accessory: UsbAccessory): MobileUsbAccessoryDescriptor? = descriptor
    }

    private class FakeDescriptor(
        private val fd: Int,
    ) : MobileUsbAccessoryDescriptor {
        var closeCount = 0
        var detached = false
        var failDetach = false

        override fun detachFd(): Int {
            if (failDetach) throw IllegalStateException("detach failed")
            detached = true
            return fd
        }

        override fun close() {
            closeCount += 1
        }
    }

    private class RecordingNativeSink(
        private val startResult: Boolean,
    ) : MobileUsbAccessoryNativeSink {
        val started = mutableListOf<StartedSession>()
        val stopped = mutableListOf<StoppedSession>()
        var throwOnStart = false

        override fun startAccessorySession(
            sessionId: String,
            fd: Int,
            identityJson: String,
        ): Boolean {
            if (throwOnStart) throw UnsatisfiedLinkError("missing")
            started += StartedSession(sessionId, fd, JSONObject(identityJson))
            return startResult
        }

        override fun stopAccessorySession(
            sessionId: String,
            reasonCode: String,
        ) {
            stopped += StoppedSession(sessionId, reasonCode)
        }
    }

    private data class StartedSession(
        val sessionId: String,
        val fd: Int,
        val identityJson: JSONObject,
    )

    private data class StoppedSession(
        val sessionId: String,
        val reasonCode: String,
    )

    private fun chromVoidIdentity(serial: String = "serial-1"): MobileUsbAccessoryIdentity =
        MobileUsbAccessoryIdentity(
            manufacturer = MobileUsbAccessoryIntentContract.MANUFACTURER,
            model = MobileUsbAccessoryIntentContract.MODEL,
            description = MobileUsbAccessoryIntentContract.DESCRIPTION,
            version = MobileUsbAccessoryIntentContract.VERSION,
            uri = MobileUsbAccessoryIntentContract.URI,
            serial = serial,
        )

    private fun chromVoidAccessory(serial: String = "serial-1"): UsbAccessory {
        val constructor =
            UsbAccessory::class.java.getConstructor(
                String::class.java,
                String::class.java,
                String::class.java,
                String::class.java,
                String::class.java,
                String::class.java,
            )
        return constructor.newInstance(
            MobileUsbAccessoryIntentContract.MANUFACTURER,
            MobileUsbAccessoryIntentContract.MODEL,
            MobileUsbAccessoryIntentContract.DESCRIPTION,
            MobileUsbAccessoryIntentContract.VERSION,
            MobileUsbAccessoryIntentContract.URI,
            serial,
        )
    }
}
