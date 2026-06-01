package com.chromvoid.app

internal class MediaPlaybackStateStore(
    private val localPlaybackStateTimeoutMs: Long,
) {
    var currentSnapshot: MediaSnapshot? = null
        private set

    var pendingLocalPlaybackState: PendingLocalPlaybackState? = null
        private set

    val pendingPlaybackState: String?
        get() = pendingLocalPlaybackState?.playbackState

    fun applySnapshot(snapshot: MediaSnapshot) {
        currentSnapshot = snapshot
    }

    fun clear() {
        currentSnapshot = null
        pendingLocalPlaybackState = null
    }

    fun requestLocalPlaybackState(
        playbackState: String,
        nowMs: Long,
    ): MediaPlaybackLocalStateResult {
        val snapshot = currentSnapshot ?: return MediaPlaybackLocalStateResult.Ignored
        val pending =
            PendingLocalPlaybackState(
                playbackState = playbackState,
                trackId = snapshot.trackId,
                expiresAtMs = nowMs + localPlaybackStateTimeoutMs,
            )
        pendingLocalPlaybackState = pending
        return MediaPlaybackLocalStateResult.Applied(
            previousSnapshot = snapshot,
            snapshot = snapshot.copy(playbackState = playbackState),
            pending = pending,
        )
    }

    fun applyLocalPosition(positionMs: Long): MediaSnapshot? {
        val snapshot = currentSnapshot ?: return null
        val localSnapshot = snapshot.copy(positionMs = positionMs.coerceAtLeast(0L))
        currentSnapshot = localSnapshot
        return localSnapshot
    }

    fun reconcileIncomingSnapshot(
        snapshot: MediaSnapshot,
        nowMs: Long,
    ): MediaPlaybackReconcileResult {
        val pending = pendingLocalPlaybackState
            ?: return MediaPlaybackReconcileResult(snapshot = snapshot, decision = null)

        if (snapshot.trackId != pending.trackId) {
            pendingLocalPlaybackState = null
            return MediaPlaybackReconcileResult(
                snapshot = snapshot,
                decision = MediaPlaybackReconcileDecision(
                    decision = "track_changed",
                    trackId = snapshot.trackId,
                    incomingState = snapshot.playbackState,
                    pendingTrackId = pending.trackId,
                    pendingState = pending.playbackState,
                ),
            )
        }

        if (nowMs > pending.expiresAtMs) {
            pendingLocalPlaybackState = null
            return MediaPlaybackReconcileResult(
                snapshot = snapshot,
                decision = MediaPlaybackReconcileDecision(
                    decision = "expired",
                    trackId = snapshot.trackId,
                    incomingState = snapshot.playbackState,
                    pendingTrackId = pending.trackId,
                    pendingState = pending.playbackState,
                    expiredByMs = nowMs - pending.expiresAtMs,
                ),
            )
        }

        if (snapshot.matchesPlaybackState(pending.playbackState)) {
            pendingLocalPlaybackState = null
            return MediaPlaybackReconcileResult(
                snapshot = snapshot,
                decision = MediaPlaybackReconcileDecision(
                    decision = "match",
                    trackId = snapshot.trackId,
                    incomingState = snapshot.playbackState,
                    pendingTrackId = pending.trackId,
                    pendingState = pending.playbackState,
                    remainingMs = pending.expiresAtMs - nowMs,
                ),
            )
        }

        return MediaPlaybackReconcileResult(
            snapshot = snapshot.copy(playbackState = pending.playbackState),
            decision = MediaPlaybackReconcileDecision(
                decision = "hold_pending",
                trackId = snapshot.trackId,
                incomingState = snapshot.playbackState,
                pendingTrackId = pending.trackId,
                pendingState = pending.playbackState,
                remainingMs = pending.expiresAtMs - nowMs,
            ),
        )
    }
}

internal sealed class MediaPlaybackLocalStateResult {
    data object Ignored : MediaPlaybackLocalStateResult()

    data class Applied(
        val previousSnapshot: MediaSnapshot,
        val snapshot: MediaSnapshot,
        val pending: PendingLocalPlaybackState,
    ) : MediaPlaybackLocalStateResult()
}

internal data class MediaPlaybackReconcileResult(
    val snapshot: MediaSnapshot,
    val decision: MediaPlaybackReconcileDecision?,
)

internal data class MediaPlaybackReconcileDecision(
    val decision: String,
    val trackId: Long,
    val incomingState: String,
    val pendingTrackId: Long,
    val pendingState: String,
    val expiredByMs: Long? = null,
    val remainingMs: Long? = null,
)
