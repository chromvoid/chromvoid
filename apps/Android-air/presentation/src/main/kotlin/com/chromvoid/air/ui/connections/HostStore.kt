package com.chromvoid.air.ui.connections

import com.chromvoid.air.ffi.AirHostPeer
import com.chromvoid.air.ffi.AirHostPreferences
import com.chromvoid.air.ffi.AirHostSnapshot
import com.chromvoid.air.ffi.AirUsbApprovalKind

/**
 * The runtime's host, as a screen asks for it: this device serving its vault
 * to trusted computers through a relay. Rust owns trust, the protocol and the
 * host's lifetime; leaving the screen never stops it.
 */
public interface HostStore {
    public suspend fun snapshot(): AirHostSnapshot

    /** Waits until the host moves past [afterSequence]: the long poll a screen follows it with. */
    public suspend fun events(afterSequence: ULong): AirHostSnapshot

    public suspend fun preferences(): AirHostPreferences

    public suspend fun trustedPeers(): List<AirHostPeer>

    /** Listens for computers already trusted; Rust refuses when there are none. */
    public suspend fun startListening(generation: ULong, relayUrl: String, deviceLabel: String): AirHostSnapshot

    /** Opens a pairing session with a code and an invitation for a new computer. */
    public suspend fun startPairing(generation: ULong, relayUrl: String, deviceLabel: String): AirHostSnapshot

    /** Starts the host again if it was on when the app last left, else reports it as it is. */
    public suspend fun resumeIfEnabled(generation: ULong, deviceLabel: String): AirHostSnapshot

    public suspend fun stop(): AirHostSnapshot

    /** Forgets a computer and ends its session. */
    public suspend fun revokePeer(peerId: String)

    /**
     * The person's answer to a computer on the USB cable: to pair with it, or to let it use the
     * vault for this session. False when the question is no longer asked.
     */
    public suspend fun answerUsb(kind: AirUsbApprovalKind, attemptId: String, allow: Boolean): Boolean
}
