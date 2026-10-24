package com.chromvoid.air.session

import android.content.Context
import com.chromvoid.air.ffi.AirHostSnapshot
import com.chromvoid.air.ffi.AirUsbApprovalKind
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.connections.HostStore
import com.chromvoid.app.nativebridge.MobileUsbAccessoryForegroundRuntime
import com.chromvoid.app.nativebridge.MobileUsbAccessoryNativeShell
import com.chromvoid.app.nativebridge.MobileUsbAccessoryNativeSink
import com.chromvoid.app.shared.UsbApprovalNotificationFactory
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** What the phone's USB accessory needs from the runtime's host. */
internal interface UsbAccessoryHosts : HostStore {
    fun isReadyForAccessory(): Boolean

    /** Serves the desktop on the descriptor; false leaves the descriptor with the caller. */
    fun startUsbAccessory(sessionId: String, fd: Int, deviceLabel: String): Boolean

    fun stopUsbAccessory(sessionId: String, reason: String)

    /** Why the session ended, once it has. */
    suspend fun usbAccessoryEnded(sessionId: String): String

    fun resolveUsbApproval(kind: AirUsbApprovalKind, attemptId: String, allow: Boolean): Boolean
}

/**
 * The phone as a USB accessory for a desktop. The platform finds the desktop's accessory, asks
 * the person for access and opens its descriptor; the runtime's host serves the session on it,
 * and its end goes back to the platform, which decides whether to listen for the desktop again.
 *
 * A desktop on the cable may ask the person something - to pair, or to use the vault - while the
 * app is in the background; the question then waits in a notification, which the app takes down
 * again once it is answered or gone. In the app the Connections prompt asks instead.
 */
internal class UsbAccessoryHost(
    private val context: Context,
    private val hosts: UsbAccessoryHosts,
    private val deviceLabel: () -> String,
    private val session: StateFlow<AirSessionState>,
    private val scope: CoroutineScope,
    private val ended: (Context, String, String) -> Unit = MobileUsbAccessoryNativeShell::onNativeAccessorySessionEnded,
    private val listen: (Context) -> Unit = { MobileUsbAccessoryForegroundRuntime.handleCurrentAccessory(it) },
) : MobileUsbAccessoryNativeSink {
    /** The question a notification shows now, so each is posted once; main thread only. */
    private var noticed: String? = null

    init {
        scope.launch(Dispatchers.Main.immediate) {
            session.map { it == AirSessionState.Locked || it is AirSessionState.Unlocked }
                .distinctUntilChanged()
                .collectLatest { open ->
                    if (open) {
                        // A cable plugged in while the app started found no host to take it; the
                        // desktop's accessory, still attached, is listened for now.
                        listen(context)
                        follow()
                    } else {
                        notice(null)
                    }
                }
        }
    }

    override fun isReadyForAccessory(): Boolean {
        val state = session.value
        return (state == AirSessionState.Locked || state is AirSessionState.Unlocked) && hosts.isReadyForAccessory()
    }

    override fun startAccessorySession(sessionId: String, fd: Int, identityJson: String): Boolean {
        if (!hosts.startUsbAccessory(sessionId, fd, deviceLabel())) return false
        scope.launch {
            val reason = hosts.usbAccessoryEnded(sessionId)
            withContext(Dispatchers.Main) { ended(context, sessionId, reason) }
        }
        return true
    }

    override fun stopAccessorySession(sessionId: String, reasonCode: String) {
        hosts.stopUsbAccessory(sessionId, reasonCode)
    }

    override fun resolveApproval(kind: String, attemptId: String, approved: Boolean): Boolean {
        val asked = when (kind) {
            UsbApprovalNotificationFactory.KIND_PAIRING -> AirUsbApprovalKind.PAIRING
            UsbApprovalNotificationFactory.KIND_SESSION -> AirUsbApprovalKind.SESSION
            else -> return false
        }
        return hosts.resolveUsbApproval(asked, attemptId, approved)
    }

    private suspend fun follow() {
        try {
            var snapshot = hosts.snapshot()
            while (true) {
                notice(snapshot)
                snapshot = hosts.events(snapshot.sequence)
            }
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (_: Exception) {
            // The runtime went away; a new one is followed from its start.
            notice(null)
        }
    }

    private fun notice(snapshot: AirHostSnapshot?) {
        val usb = snapshot?.usb
        val question = usb?.pairing?.let { UsbApprovalNotificationFactory.KIND_PAIRING to it.attemptId }
            ?: usb?.session?.let { UsbApprovalNotificationFactory.KIND_SESSION to it.attemptId }
        val key = question?.let { (kind, attempt) -> "$kind:$attempt" }
        if (key == noticed) return
        noticed = key
        if (question == null) {
            MobileUsbAccessoryNativeShell.onNativeUsbApprovalResolved(context)
        } else {
            MobileUsbAccessoryNativeShell.onNativeUsbApprovalRequired(context, question.first, question.second)
        }
    }
}
