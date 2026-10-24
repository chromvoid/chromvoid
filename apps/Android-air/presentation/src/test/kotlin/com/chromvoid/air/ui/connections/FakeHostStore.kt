package com.chromvoid.air.ui.connections

import com.chromvoid.air.ffi.AirHostConnection
import com.chromvoid.air.ffi.AirHostConnectionState
import com.chromvoid.air.ffi.AirHostPairingOffer
import com.chromvoid.air.ffi.AirHostPeer
import com.chromvoid.air.ffi.AirHostPhase
import com.chromvoid.air.ffi.AirHostPreferences
import com.chromvoid.air.ffi.AirHostSnapshot
import com.chromvoid.air.ffi.AirUsbApprovalKind
import com.chromvoid.air.ffi.AirUsbLinkState
import com.chromvoid.air.ffi.AirUsbPairingRequest
import com.chromvoid.air.ffi.AirUsbSessionRequest
import com.chromvoid.air.ffi.AirUsbStatus
import com.chromvoid.air.ffi.BridgeException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first

/**
 * A host that answers as Rust's does: a secure or loopback relay only, a
 * pairing session with a code and an offer, listening only with a computer
 * trusted, and a sequence every change advances, which a long poll waits on.
 */
internal class FakeHostStore : HostStore {
    val calls = mutableListOf<String>()
    var phase = AirHostPhase.IDLE
    var pin: String? = null
    var offer: AirHostPairingOffer? = null
    val connected = mutableListOf<AirHostConnection>()
    val peers = mutableListOf<AirHostPeer>()
    var enabled = false
    var savedRelay: String? = null
    var usb: AirUsbStatus? = null

    /** Thrown by the next call of any kind, once. */
    var failNext: Throwable? = null
    private val sequence = MutableStateFlow(1uL)

    fun current(): AirHostSnapshot = AirHostSnapshot(
        sequence = sequence.value,
        phase = phase,
        connectionState = if (connected.isEmpty()) {
            AirHostConnectionState.LISTENING
        } else {
            AirHostConnectionState.CONNECTED
        },
        relayUrl = savedRelay,
        deviceId = "device",
        deviceLabel = "Pixel",
        pairingPin = pin,
        pairingOffer = offer,
        presenceExpiresAtMs = null,
        connectedPeers = connected.toList(),
        error = null,
        usb = usb,
    )

    /** Changes the host as Rust would, then advances its sequence. */
    fun change(block: FakeHostStore.() -> Unit) {
        block()
        sequence.value += 1uL
    }

    /** A computer pairs: it becomes trusted and connected, and the code goes. */
    fun computerPairs(id: String = "desk", label: String = "Work laptop") = change {
        peers += AirHostPeer(id, label, "desktop")
        connected += AirHostConnection(id, label, "wss_relay")
        phase = AirHostPhase.READY
        pin = null
        offer = null
        enabled = true
    }

    /** A computer the phone does not know asks over the cable to pair, with [pin] on the phone. */
    fun desktopAsksToPair(pin: String = "305172", attemptsLeft: Int = 5) = change {
        usb = AirUsbStatus(
            state = AirUsbLinkState.PAIRING,
            desktop = "Studio Mac",
            pairing = AirUsbPairingRequest(
                attemptId = "pairing-1",
                pin = pin,
                desktop = "Studio Mac",
                fingerprint = "0f1e2d3c4b5a6978",
                attemptsLeft = attemptsLeft.toUByte(),
                expiresAtMs = 1_900_000_000_000uL,
                allowed = false,
            ),
            session = null,
        )
    }

    /** A trusted computer on the cable asks to use the vault. */
    fun desktopAsksForSession() = change {
        usb = AirUsbStatus(
            state = AirUsbLinkState.AWAITING_APPROVAL,
            desktop = "Studio Mac",
            pairing = null,
            session = AirUsbSessionRequest("session-1", "Studio Mac", 1_900_000_000_000uL),
        )
    }

    private fun consume(call: String) {
        calls += call
        failNext?.let {
            failNext = null
            throw it
        }
    }

    override suspend fun snapshot(): AirHostSnapshot {
        consume("snapshot")
        return current()
    }

    override suspend fun events(afterSequence: ULong): AirHostSnapshot {
        sequence.first { it > afterSequence }
        consume("events")
        return current()
    }

    override suspend fun preferences(): AirHostPreferences {
        consume("preferences")
        return AirHostPreferences(savedRelay, enabled)
    }

    override suspend fun trustedPeers(): List<AirHostPeer> {
        consume("peers")
        return peers.toList()
    }

    private fun checkRelay(relay: String) {
        if (!relay.startsWith("wss://") && !relay.startsWith("ws://127.0.0.1")) throw BridgeException.InvalidRelayUrl()
    }

    override suspend fun startListening(generation: ULong, relayUrl: String, deviceLabel: String): AirHostSnapshot {
        consume("listen:$relayUrl")
        checkRelay(relayUrl)
        if (peers.isEmpty()) throw BridgeException.HostUnavailable()
        change {
            phase = AirHostPhase.READY
            enabled = true
            savedRelay = relayUrl
        }
        return current()
    }

    override suspend fun startPairing(generation: ULong, relayUrl: String, deviceLabel: String): AirHostSnapshot {
        consume("pair:$relayUrl")
        checkRelay(relayUrl)
        change {
            phase = AirHostPhase.PAIRING
            pin = "482913"
            offer = AirHostPairingOffer("session 1", relayUrl, deviceLabel, 1_900_000_000_000uL)
            savedRelay = relayUrl
        }
        return current()
    }

    override suspend fun resumeIfEnabled(generation: ULong, deviceLabel: String): AirHostSnapshot {
        consume("resume")
        if (enabled && phase == AirHostPhase.IDLE) change { phase = AirHostPhase.READY }
        return current()
    }

    override suspend fun stop(): AirHostSnapshot {
        consume("stop")
        change {
            phase = AirHostPhase.IDLE
            pin = null
            offer = null
            connected.clear()
            enabled = false
        }
        return current()
    }

    override suspend fun revokePeer(peerId: String) {
        consume("revoke:$peerId")
        change {
            peers.removeAll { it.peerId == peerId }
            connected.removeAll { it.peerId == peerId }
        }
    }

    override suspend fun answerUsb(kind: AirUsbApprovalKind, attemptId: String, allow: Boolean): Boolean {
        consume("usb:${kind.name.lowercase()}:$attemptId:$allow")
        val current = usb ?: return false
        val asked = when (kind) {
            AirUsbApprovalKind.PAIRING -> current.pairing?.attemptId
            AirUsbApprovalKind.SESSION -> current.session?.attemptId
        }
        if (asked != attemptId) return false
        change {
            usb = when {
                !allow -> null
                kind == AirUsbApprovalKind.PAIRING -> current.copy(pairing = current.pairing?.copy(allowed = true))
                else -> current.copy(state = AirUsbLinkState.CONNECTED, session = null)
            }
        }
        return true
    }
}
