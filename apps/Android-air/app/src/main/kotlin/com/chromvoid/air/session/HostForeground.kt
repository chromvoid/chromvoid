package com.chromvoid.air.session

import android.content.Context
import com.chromvoid.air.ffi.AirHostPhase
import com.chromvoid.air.ffi.AirHostSnapshot
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.connections.HostStore
import com.chromvoid.app.ConnectionForegroundService
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * Keeps the process running while the host serves computers. The platform's
 * connection service runs from the moment Rust reports the host pairing or
 * listening until it stops, with a notification that says which computer is
 * connected and stops the host from its action. It follows Rust's host, not a
 * screen, so it holds whichever screen - or none - is showing; the host
 * becomes active only from a person's action in the app, which is when
 * Android lets a foreground service start.
 */
internal class HostForeground(
    private val context: Context,
    private val hosts: HostStore,
    session: StateFlow<AirSessionState>,
    scope: CoroutineScope,
) {
    /** Whether this controller holds the service; only touched on the main thread. */
    private var running = false
    private var shown: String? = null

    init {
        ConnectionForegroundService.installNetworkStopListener {
            // Our own stop has already cleared [running]; anything else - the action, the
            // system - ended the service under a host that is still on, so the host stops too.
            if (running) {
                running = false
                scope.launch(Dispatchers.Main.immediate) { runCatching { hosts.stop() } }
            }
        }
        scope.launch(Dispatchers.Main.immediate) {
            session.map { it != AirSessionState.Starting && it !is AirSessionState.Unavailable }
                .distinctUntilChanged()
                .collectLatest { open -> if (open) follow() else release() }
        }
    }

    private suspend fun follow() {
        try {
            var snapshot = hosts.snapshot()
            while (true) {
                apply(snapshot)
                snapshot = hosts.events(snapshot.sequence)
            }
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (_: Exception) {
            // The runtime went away under the host; a new one starts following again.
            release()
        }
    }

    private fun apply(snapshot: AirHostSnapshot) {
        val active = snapshot.phase == AirHostPhase.PAIRING || snapshot.phase == AirHostPhase.READY
        val connected = snapshot.connectedPeers.firstOrNull()?.label
        when {
            active && !running -> {
                running = ConnectionForegroundService.start(context, connected)
                shown = connected
            }
            active && connected != shown -> {
                ConnectionForegroundService.update(context, connected)
                shown = connected
            }
            !active -> release()
        }
    }

    private fun release() {
        if (!running) return
        running = false
        shown = null
        ConnectionForegroundService.stop(context)
    }
}
