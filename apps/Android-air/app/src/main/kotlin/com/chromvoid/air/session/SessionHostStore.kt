package com.chromvoid.air.session

import com.chromvoid.air.bridge.AirSessionRuntime
import com.chromvoid.air.ffi.AirHostInterface
import com.chromvoid.air.ffi.AirHostPeer
import com.chromvoid.air.ffi.AirHostPreferences
import com.chromvoid.air.ffi.AirHostSnapshot
import com.chromvoid.air.ffi.AirPhase
import com.chromvoid.air.ffi.AirUsbApprovalKind
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.connections.HostStore
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * The session runtime's host. Rust keeps one controller per runtime and hands
 * out the same one each time; its blocking calls run off the main thread.
 */
internal class SessionHostStore(
    private val runtime: () -> AirSessionRuntime?,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : HostStore, UsbAccessoryHosts {
    private var cached: Pair<AirSessionRuntime, AirHostInterface>? = null

    override suspend fun snapshot(): AirHostSnapshot = blocking { it.snapshot() }

    override suspend fun events(afterSequence: ULong): AirHostSnapshot = host().events(afterSequence)

    override suspend fun preferences(): AirHostPreferences = host().preferences()

    override suspend fun trustedPeers(): List<AirHostPeer> = host().trustedPeers()

    override suspend fun startListening(generation: ULong, relayUrl: String, deviceLabel: String): AirHostSnapshot =
        blocking { it.startListening(generation, relayUrl, deviceLabel) }

    override suspend fun startPairing(generation: ULong, relayUrl: String, deviceLabel: String): AirHostSnapshot =
        blocking { it.startPairing(generation, relayUrl, deviceLabel) }

    override suspend fun resumeIfEnabled(generation: ULong, deviceLabel: String): AirHostSnapshot =
        host().resumeIfEnabled(generation, deviceLabel)

    override suspend fun stop(): AirHostSnapshot = blocking { it.stop() }

    override suspend fun revokePeer(peerId: String): Unit = host().revokePeer(peerId)

    override suspend fun answerUsb(kind: AirUsbApprovalKind, attemptId: String, allow: Boolean): Boolean =
        blocking { it.resolveUsbApproval(kind, attemptId, allow) }

    override fun isReadyForAccessory(): Boolean = runCatching {
        val snapshot = runtime()?.snapshot() ?: return@runCatching false
        if (snapshot.cleanupPending || (snapshot.phase != AirPhase.LOCKED && snapshot.phase != AirPhase.UNLOCKED)) {
            return@runCatching false
        }
        // The UI also shows Locked while inactive; use the runtime phase and a live host.
        host().snapshot()
        true
    }.getOrDefault(false)

    /**
     * Serves the desktop on a USB accessory's descriptor; false leaves the descriptor with the
     * caller, as it does when no runtime is open.
     */
    override fun startUsbAccessory(sessionId: String, fd: Int, deviceLabel: String): Boolean =
        runCatching { host() }.getOrNull()?.startUsbAccessory(sessionId, fd, deviceLabel) ?: false

    override fun stopUsbAccessory(sessionId: String, reason: String) {
        runCatching { host() }.getOrNull()?.stopUsbAccessory(sessionId, reason)
    }

    /** Why the session ended; a runtime that went away first ended it by shutting down. */
    override suspend fun usbAccessoryEnded(sessionId: String): String =
        runCatching { host() }.getOrNull()?.usbAccessoryEnded(sessionId) ?: "shutdown"

    override fun resolveUsbApproval(kind: AirUsbApprovalKind, attemptId: String, allow: Boolean): Boolean =
        runCatching { host() }.getOrNull()?.resolveUsbApproval(kind, attemptId, allow) ?: false

    private suspend fun <T> blocking(call: (AirHostInterface) -> T): T = withContext(dispatcher) { call(host()) }

    @Synchronized
    private fun host(): AirHostInterface {
        val current = runtime() ?: throw BridgeException.SessionRevoked()
        cached?.let { (owner, host) -> if (owner === current) return host }
        return current.host().also { cached = current to it }
    }
}
