package com.chromvoid.app.nativebridge

import android.content.Context
import android.hardware.usb.UsbAccessory
import android.hardware.usb.UsbManager
import android.os.ParcelFileDescriptor
import android.util.Log
import com.chromvoid.app.shared.TracePrivacy
import com.chromvoid.app.shared.UsbApprovalNotificationFactory
import java.util.UUID
import org.json.JSONObject

internal fun interface MobileUsbAccessoryDescriptorOpener {
    fun open(accessory: UsbAccessory): MobileUsbAccessoryDescriptor?
}

internal interface MobileUsbAccessoryDescriptor {
    fun detachFd(): Int

    fun close()
}

/**
 * The application's host for a USB accessory session, which serves the desktop on the
 * accessory's descriptor. The application installs one; until it does, nothing opens.
 */
interface MobileUsbAccessoryNativeSink {
    /** Whether the host can accept a session before its descriptor is opened. */
    fun isReadyForAccessory(): Boolean = true

    /**
     * Starts a session on [fd]. True means the host took the descriptor and will report the
     * session's end through [MobileUsbAccessoryNativeShell.onNativeAccessorySessionEnded]; false
     * leaves the descriptor with the caller.
     */
    fun startAccessorySession(
        sessionId: String,
        fd: Int,
        identityJson: String,
    ): Boolean

    fun stopAccessorySession(
        sessionId: String,
        reasonCode: String,
    )

    /** The person's answer to a pairing or session request; false when it is no longer asked. */
    fun resolveApproval(
        kind: String,
        attemptId: String,
        approved: Boolean,
    ): Boolean
}

object MobileUsbAccessoryNativeShell {
    private const val TAG = "ChromVoid/MobileUsb"

    @Volatile
    private var installedSink: MobileUsbAccessoryNativeSink? = null

    /** The application's host; installed once at startup, before any accessory event. */
    @JvmStatic
    fun installSink(sink: MobileUsbAccessoryNativeSink?) {
        installedSink = sink
    }

    @JvmStatic
    fun onNativeAccessorySessionEnded(
        context: Context,
        sessionId: String,
    ) {
        onNativeAccessorySessionEnded(context, sessionId, "unknown")
    }

    @JvmStatic
    fun onNativeAccessorySessionEnded(
        context: Context,
        sessionId: String,
        reasonCode: String,
    ) {
        MobileUsbAccessoryForegroundRuntime.handleNativeSessionEnded(
            context.applicationContext,
            sessionId,
            reasonCode,
        )
    }

    @JvmStatic
    fun onNativeUsbApprovalRequired(
        context: Context,
        kind: String,
        attemptId: String,
    ) {
        if (!UsbApprovalNotificationFactory.isKnownKind(kind) || attemptId.isBlank()) {
            Log.w(TAG, "Ignoring invalid USB approval notification kind=$kind")
            return
        }
        UsbApprovalNotificationFactory.post(context.applicationContext, kind, attemptId)
    }

    @JvmStatic
    fun onNativeUsbApprovalResolved(context: Context) {
        UsbApprovalNotificationFactory.cancel(context.applicationContext)
    }

    fun resolveNativeUsbApproval(
        kind: String,
        attemptId: String,
        approved: Boolean,
    ): Boolean {
        if (
            !UsbApprovalNotificationFactory.isKnownKind(kind) ||
                attemptId.isBlank() ||
                (kind == UsbApprovalNotificationFactory.KIND_PAIRING && approved)
        ) {
            return false
        }
        return installedSink?.resolveApproval(kind, attemptId, approved) ?: false
    }

    internal fun createSessionOpener(context: Context): MobileUsbAccessorySessionOpener =
        createSessionOpenerForTests(
            descriptorOpener = AndroidUsbAccessoryDescriptorOpener(context),
            nativeSink = InstalledSink,
        )

    internal fun createSessionOpenerForTests(
        descriptorOpener: MobileUsbAccessoryDescriptorOpener,
        nativeSink: MobileUsbAccessoryNativeSink,
        detachedFdCloser: (Int) -> Unit = ::closeDetachedFd,
    ): MobileUsbAccessorySessionOpener =
        MobileUsbAccessoryNativeSessionOpener(
            descriptorOpener = descriptorOpener,
            nativeSink = nativeSink,
            detachedFdCloser = detachedFdCloser,
        )

    private fun closeDetachedFd(fd: Int) {
        ParcelFileDescriptor.adoptFd(fd).close()
    }

    private class AndroidUsbAccessoryDescriptorOpener(
        context: Context,
    ) : MobileUsbAccessoryDescriptorOpener {
        private val usbManager = context.applicationContext.getSystemService(UsbManager::class.java)

        override fun open(accessory: UsbAccessory): MobileUsbAccessoryDescriptor? =
            usbManager?.openAccessory(accessory)?.let(::AndroidUsbAccessoryDescriptor)
    }

    private class AndroidUsbAccessoryDescriptor(
        private val descriptor: ParcelFileDescriptor,
    ) : MobileUsbAccessoryDescriptor {
        override fun detachFd(): Int = descriptor.detachFd()

        override fun close() {
            descriptor.close()
        }
    }

    private class MobileUsbAccessoryNativeSessionOpener(
        private val descriptorOpener: MobileUsbAccessoryDescriptorOpener,
        private val nativeSink: MobileUsbAccessoryNativeSink,
        private val detachedFdCloser: (Int) -> Unit,
    ) : MobileUsbAccessorySessionOpener {
        override fun isReadyForAccessory(): Boolean = nativeSink.isReadyForAccessory()

        override fun open(
            accessory: UsbAccessory,
            identity: MobileUsbAccessoryIdentity,
        ): MobileUsbAccessorySessionHandle {
            Log.i(
                TAG,
                "accessory_descriptor_open_start serial=${TracePrivacy.redactIdentifier(identity.serial)} model=${TracePrivacy.traceValue(identity.model)}",
            )
            val descriptor = descriptorOpener.open(accessory)
                ?: throw IllegalStateException("USB accessory descriptor is unavailable")
            val sessionId = UUID.randomUUID().toString()
            Log.i(
                TAG,
                "accessory_descriptor_opened session=${TracePrivacy.redactIdentifier(sessionId)}",
            )
            val fd =
                try {
                    descriptor.detachFd()
                } catch (error: Throwable) {
                    Log.w(
                        TAG,
                        "accessory_fd_detach_failed session=${TracePrivacy.redactIdentifier(sessionId)} error=${TracePrivacy.failureMessage(error)}",
                    )
                    descriptor.close()
                    throw error
                }
            Log.i(
                TAG,
                "accessory_fd_detached session=${TracePrivacy.redactIdentifier(sessionId)} fd=$fd",
            )

            val started =
                try {
                    Log.i(
                        TAG,
                        "accessory_native_start_call session=${TracePrivacy.redactIdentifier(sessionId)} fd=$fd",
                    )
                    nativeSink.startAccessorySession(sessionId, fd, encodeIdentity(identity))
                } catch (error: Throwable) {
                    Log.w(
                        TAG,
                        "accessory_native_start_throw session=${TracePrivacy.redactIdentifier(sessionId)} error=${TracePrivacy.failureMessage(error)}",
                    )
                    detachedFdCloser(fd)
                    throw error
                }
            Log.i(
                TAG,
                "accessory_native_start_result session=${TracePrivacy.redactIdentifier(sessionId)} started=$started",
            )
            if (!started) {
                detachedFdCloser(fd)
                throw IllegalStateException("Native USB accessory session rejected")
            }

            return NativeSessionHandle(sessionId, nativeSink)
        }
    }

    private class NativeSessionHandle(
        override val sessionId: String,
        private val nativeSink: MobileUsbAccessoryNativeSink,
    ) : MobileUsbAccessorySessionHandle {
        private var closed = false

        override fun close(reason: MobileUsbAccessorySessionStopReason) {
            if (closed) return
            closed = true
            Log.i(
                TAG,
                "accessory_native_stop_call session=${TracePrivacy.redactIdentifier(sessionId)} reason=${reason.code}",
            )
            nativeSink.stopAccessorySession(sessionId, reason.code)
        }
    }

    /** Whatever the application installed, read at each call; none refuses every session. */
    private object InstalledSink : MobileUsbAccessoryNativeSink {
        override fun isReadyForAccessory(): Boolean = installedSink?.isReadyForAccessory() ?: false

        override fun startAccessorySession(
            sessionId: String,
            fd: Int,
            identityJson: String,
        ): Boolean {
            val sink = installedSink
            if (sink == null) {
                Log.w(TAG, "accessory_start_without_host session=${TracePrivacy.redactIdentifier(sessionId)}")
                return false
            }
            return sink.startAccessorySession(sessionId, fd, identityJson)
        }

        override fun stopAccessorySession(
            sessionId: String,
            reasonCode: String,
        ) {
            installedSink?.stopAccessorySession(sessionId, reasonCode)
        }

        override fun resolveApproval(
            kind: String,
            attemptId: String,
            approved: Boolean,
        ): Boolean = installedSink?.resolveApproval(kind, attemptId, approved) ?: false
    }

    private fun encodeIdentity(identity: MobileUsbAccessoryIdentity): String =
        JSONObject()
            .put("manufacturer", identity.manufacturer)
            .put("model", identity.model)
            .put("description", identity.description)
            .put("version", identity.version)
            .put("uri", identity.uri)
            .put("serial", identity.serial)
            .toString()
}
