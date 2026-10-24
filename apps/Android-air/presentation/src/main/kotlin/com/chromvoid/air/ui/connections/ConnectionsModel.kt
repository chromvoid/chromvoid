package com.chromvoid.air.ui.connections

import com.chromvoid.air.ffi.AirHostPairingOffer
import com.chromvoid.air.ffi.AirHostPeer
import com.chromvoid.air.ffi.AirHostPhase
import com.chromvoid.air.ffi.AirHostSnapshot
import com.chromvoid.air.ffi.AirUsbApprovalKind
import com.chromvoid.air.ffi.AirUsbStatus
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.credentials.CredentialClipboard
import java.net.URLEncoder
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * This device as a host for trusted computers, as the iOS Connections page
 * shows it: whether the host is on, a pairing code and invitation while a
 * computer is being added, and the computers already trusted. It follows the
 * session, locked or open, and leaving it never stops the host.
 */
public class ConnectionsModel(
    private val store: HostStore,
    private val deviceLabel: String,
    private val scope: CoroutineScope,
    private val clipboard: CredentialClipboard,
) {
    public enum class Phase { LOADING, READY, FAILED, SUSPENDED }

    public enum class Issue { UNAVAILABLE, RELAY, OPERATION, REVOKE }

    /** The one line that says what the host is doing. */
    public enum class Summary {
        PREPARING,
        READY_TO_PAIR,
        DEVICE_CONNECTED,
        LISTENING,
        INTERRUPTED,
        EXPIRED,
        PAUSED,
        STOPPED,
        UNAVAILABLE,
        CHECKING,
    }

    public data class State(
        val phase: Phase = Phase.SUSPENDED,
        val snapshot: AirHostSnapshot? = null,
        val peers: List<AirHostPeer> = emptyList(),
        val vaultOpen: Boolean = false,
        val busy: Boolean = false,
        val issue: Issue? = null,
        /** Bumped when the relay address needs the person's attention. */
        val validationRevision: Int = 0,
        /** The host was on when it was last left; Rust starts it again on return. */
        val savedEnabled: Boolean = false,
        val relayUrl: String = DEFAULT_RELAY,
        val revokeCandidate: AirHostPeer? = null,
        val codeCopied: Boolean = false,
    ) {
        val activeHost: Boolean
            get() = snapshot?.phase == AirHostPhase.PAIRING || snapshot?.phase == AirHostPhase.READY

        val pairingCode: String? get() = snapshot?.pairingPin

        val summary: Summary
            get() = when (snapshot?.phase) {
                AirHostPhase.PAIRING -> if (snapshot.pairingPin == null) Summary.PREPARING else Summary.READY_TO_PAIR
                AirHostPhase.READY ->
                    if (snapshot.connectedPeers.isNotEmpty()) Summary.DEVICE_CONNECTED else Summary.LISTENING
                AirHostPhase.ERROR -> Summary.INTERRUPTED
                AirHostPhase.PAIRING_EXPIRED -> Summary.EXPIRED
                AirHostPhase.IDLE -> if (savedEnabled) Summary.PAUSED else Summary.STOPPED
                null -> when (phase) {
                    Phase.FAILED -> Summary.UNAVAILABLE
                    Phase.SUSPENDED -> Summary.PAUSED
                    else -> Summary.CHECKING
                }
            }

        /** A computer on the USB cable, while one is there; it may be asking the person something. */
        val usb: AirUsbStatus? get() = snapshot?.usb

        /** The invitation a computer opens: the desktop's own `chromvoid://pair-mobile` link. */
        val invitation: String? get() = snapshot?.pairingOffer?.let(::invitationUri)

        public fun isConnected(peerId: String): Boolean = snapshot?.connectedPeers?.any { it.peerId == peerId } == true
    }

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private var generation: ULong? = null
    private var work: Job? = null
    private var operation: Job? = null
    private var observer: Job? = null

    /**
     * The session moved: [generation] is the one administration runs under,
     * locked or open, or null while there is none - then the page pauses.
     */
    public fun synchronize(generation: ULong?, vaultOpen: Boolean) {
        if (generation == null) {
            suspend()
            return
        }
        mutableState.value = mutableState.value.copy(vaultOpen = vaultOpen)
        if (this.generation == generation && mutableState.value.phase != Phase.SUSPENDED) return
        this.generation = generation
        load(resume = true)
    }

    public fun reload() {
        load(resume = false)
    }

    private fun load(resume: Boolean) {
        val generation = generation ?: return
        observer?.cancel()
        work?.cancel()
        mutableState.value = mutableState.value.copy(
            phase = Phase.LOADING,
            snapshot = null,
            peers = emptyList(),
            busy = false,
            revokeCandidate = null,
            issue = null,
            codeCopied = false,
        )
        work = scope.launch {
            try {
                val snapshot = if (resume) store.resumeIfEnabled(generation, deviceLabel) else store.snapshot()
                val preferences = store.preferences()
                val peers = store.trustedPeers()
                val current = mutableState.value
                mutableState.value = current.copy(
                    phase = Phase.READY,
                    snapshot = snapshot,
                    peers = peers,
                    savedEnabled = preferences.enabled,
                    relayUrl = preferences.relayUrl ?: current.relayUrl,
                )
                observe(snapshot.sequence)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (_: Exception) {
                mutableState.value = mutableState.value.copy(phase = Phase.FAILED, issue = Issue.UNAVAILABLE)
            }
        }
    }

    public fun changeRelay(value: String) {
        val current = mutableState.value
        if (current.activeHost || current.busy) return
        mutableState.value = current.copy(relayUrl = value, issue = null)
    }

    /** Listens for the computers already trusted. */
    public fun start() {
        begin(pairing = false)
    }

    /** Opens a pairing session for a new computer. */
    public fun pair() {
        begin(pairing = true)
    }

    /** The relay address was submitted from the keyboard: pair while nothing is trusted, else listen. */
    public fun submitRelay() {
        begin(pairing = mutableState.value.peers.isEmpty())
    }

    private fun begin(pairing: Boolean) {
        val current = mutableState.value
        val generation = generation ?: return
        if (current.phase != Phase.READY || current.busy || current.activeHost) return
        val relay = current.relayUrl.trim()
        mutableState.value = current.copy(busy = true, issue = null, codeCopied = false)
        operation = scope.launch {
            val next = try {
                val snapshot = if (pairing) {
                    store.startPairing(generation, relay, deviceLabel)
                } else {
                    store.startListening(generation, relay, deviceLabel)
                }
                mutableState.value.copy(snapshot = newer(snapshot))
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (_: BridgeException.InvalidRelayUrl) {
                mutableState.value.let { it.copy(issue = Issue.RELAY, validationRevision = it.validationRevision + 1) }
            } catch (_: Exception) {
                mutableState.value.copy(issue = Issue.OPERATION)
            }
            mutableState.value = next.copy(busy = false)
        }
    }

    /** Stops the host; cancelling a pairing is the same. */
    public fun stop() {
        val current = mutableState.value
        if (generation == null || current.busy) return
        mutableState.value = current.copy(busy = true)
        operation = scope.launch {
            val next = try {
                val snapshot = store.stop()
                mutableState.value.copy(snapshot = newer(snapshot), savedEnabled = false, issue = null)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (_: Exception) {
                mutableState.value.copy(issue = Issue.OPERATION)
            }
            mutableState.value = next.copy(busy = false, codeCopied = false)
        }
    }

    public fun copyPairingCode() {
        val current = mutableState.value
        val code = current.pairingCode ?: return
        if (current.phase != Phase.READY) return
        clipboard.copy(code, sensitive = true)
        mutableState.value = current.copy(codeCopied = true)
    }

    public fun requestRevoke(peer: AirHostPeer) {
        val current = mutableState.value
        if (current.phase != Phase.READY || current.busy) return
        mutableState.value = current.copy(revokeCandidate = peer)
    }

    public fun cancelRevoke() {
        mutableState.value = mutableState.value.copy(revokeCandidate = null)
    }

    public fun confirmRevoke() {
        val current = mutableState.value
        val peer = current.revokeCandidate ?: return
        if (current.phase != Phase.READY || current.busy) return
        mutableState.value = current.copy(revokeCandidate = null, busy = true, issue = null)
        operation = scope.launch {
            val next = try {
                store.revokePeer(peer.peerId)
                val peers = store.trustedPeers()
                val snapshot = store.snapshot()
                mutableState.value.copy(peers = peers, snapshot = newer(snapshot))
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (_: Exception) {
                mutableState.value.copy(issue = Issue.REVOKE)
            }
            mutableState.value = next.copy(busy = false)
        }
    }

    /** The person's answer to the computer on the cable asking to pair; allowing may come before its PIN. */
    public fun answerUsbPairing(allow: Boolean) {
        answerUsb(AirUsbApprovalKind.PAIRING, mutableState.value.usb?.pairing?.attemptId, allow)
    }

    /** The person's answer to a trusted computer on the cable asking to use the vault. */
    public fun answerUsbSession(allow: Boolean) {
        answerUsb(AirUsbApprovalKind.SESSION, mutableState.value.usb?.session?.attemptId, allow)
    }

    private fun answerUsb(kind: AirUsbApprovalKind, attemptId: String?, allow: Boolean) {
        if (attemptId == null || generation == null) return
        // The host reports the answer through its events; a question already gone needs nothing.
        scope.launch {
            try {
                store.answerUsb(kind, attemptId, allow)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (_: Exception) {
                mutableState.value = mutableState.value.copy(issue = Issue.OPERATION)
            }
        }
    }

    /** The session is gone or the app left: stop following the host, which Rust keeps or pauses itself. */
    public fun suspend() {
        work?.cancel()
        operation?.cancel()
        observer?.cancel()
        generation = null
        val current = mutableState.value
        mutableState.value = State(relayUrl = current.relayUrl, savedEnabled = current.savedEnabled)
    }

    private fun observe(after: ULong) {
        observer?.cancel()
        observer = scope.launch {
            var sequence = after
            try {
                while (true) {
                    val snapshot = store.events(sequence)
                    val peers = store.trustedPeers()
                    sequence = snapshot.sequence
                    val current = mutableState.value
                    // A finished start or stop may already have shown a newer snapshot.
                    if (snapshot.sequence < (current.snapshot?.sequence ?: 0uL)) continue
                    mutableState.value = current.copy(
                        snapshot = snapshot,
                        peers = peers,
                        savedEnabled = current.savedEnabled || snapshot.phase == AirHostPhase.READY,
                        codeCopied = current.codeCopied && snapshot.pairingPin == current.pairingCode,
                    )
                }
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (_: Exception) {
                mutableState.value = mutableState.value.copy(
                    snapshot = null,
                    phase = Phase.FAILED,
                    issue = Issue.UNAVAILABLE,
                )
            }
        }
    }

    /** A snapshot from an operation, unless the host already reported a newer one. */
    private fun newer(snapshot: AirHostSnapshot): AirHostSnapshot {
        val shown = mutableState.value.snapshot ?: return snapshot
        return if (snapshot.sequence >= shown.sequence) snapshot else shown
    }

    public companion object {
        public const val DEFAULT_RELAY: String = "wss://relay.chromvoid.com"

        /** How a computer's ChromVoid recognises this device: the same invitation iOS shares. */
        internal fun invitationUri(offer: AirHostPairingOffer): String {
            val query = listOf(
                "session_id" to offer.sessionId,
                "relay_base_url" to offer.relayBaseUrl,
                "device_label" to offer.deviceLabel,
                "expires_at_ms" to offer.expiresAtMs.toString(),
                "platform" to "android",
            ).joinToString("&") { (name, value) -> "$name=${encode(value)}" }
            return "chromvoid://pair-mobile?$query"
        }

        // The Charset overload is Android 13's; the name works on every release this client runs on.
        private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8").replace("+", "%20")
    }
}
