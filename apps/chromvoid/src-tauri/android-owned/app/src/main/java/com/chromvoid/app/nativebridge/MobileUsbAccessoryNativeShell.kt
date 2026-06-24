package com.chromvoid.app.nativebridge

import android.content.Context
import android.hardware.usb.UsbAccessory
import android.hardware.usb.UsbManager
import android.os.ParcelFileDescriptor
import android.util.Log
import com.chromvoid.app.shared.NativeRuntimeLoader
import com.chromvoid.app.shared.TracePrivacy
import java.util.UUID
import org.json.JSONObject

internal fun interface MobileUsbAccessoryDescriptorOpener {
    fun open(accessory: UsbAccessory): MobileUsbAccessoryDescriptor?
}

internal interface MobileUsbAccessoryDescriptor {
    fun detachFd(): Int

    fun close()
}

internal interface MobileUsbAccessoryNativeSink {
    fun startAccessorySession(
        sessionId: String,
        fd: Int,
        identityJson: String,
    ): Boolean

    fun stopAccessorySession(sessionId: String)
}

internal object MobileUsbAccessoryNativeShell {
    private const val TAG = "ChromVoid/MobileUsb"

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

    fun createSessionOpener(context: Context): MobileUsbAccessorySessionOpener =
        createSessionOpenerForTests(
            descriptorOpener = AndroidUsbAccessoryDescriptorOpener(context),
            nativeSink = JniMobileUsbAccessoryNativeSink,
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

        override fun close() {
            if (closed) return
            closed = true
            Log.i(
                TAG,
                "accessory_native_stop_call session=${TracePrivacy.redactIdentifier(sessionId)}",
            )
            nativeSink.stopAccessorySession(sessionId)
        }
    }

    private object JniMobileUsbAccessoryNativeSink : MobileUsbAccessoryNativeSink {
        override fun startAccessorySession(
            sessionId: String,
            fd: Int,
            identityJson: String,
        ): Boolean {
            Log.i(
                TAG,
                "accessory_jni_start_dispatch session=${TracePrivacy.redactIdentifier(sessionId)} fd=$fd",
            )
            val result = NativeRuntimeLoader.callWhenLoaded(TAG, false) {
                nativeStartAccessorySession(sessionId, fd, identityJson)
            }
            Log.i(
                TAG,
                "accessory_jni_start_complete session=${TracePrivacy.redactIdentifier(sessionId)} result=$result",
            )
            return result
        }

        override fun stopAccessorySession(sessionId: String) {
            Log.i(
                TAG,
                "accessory_jni_stop_dispatch session=${TracePrivacy.redactIdentifier(sessionId)}",
            )
            NativeRuntimeLoader.runWhenLoaded(TAG) {
                nativeStopAccessorySession(sessionId)
            }
        }
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

    private external fun nativeStartAccessorySession(
        sessionId: String,
        fd: Int,
        identityJson: String,
    ): Boolean

    private external fun nativeStopAccessorySession(sessionId: String)
}
