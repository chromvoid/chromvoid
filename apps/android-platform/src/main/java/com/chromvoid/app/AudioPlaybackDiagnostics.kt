package com.chromvoid.app

import com.chromvoid.app.shared.TracePrivacy

internal object AudioPlaybackDiagnostics {
    fun redactIdentifier(value: String?): String? = TracePrivacy.redactIdentifier(value)

    fun traceValue(value: Any?): String = TracePrivacy.traceValue(value)

    fun commandName(command: AudioPlaybackCommand): String =
        when (command) {
            is AudioPlaybackCommand.StartSession -> "startSession"
            is AudioPlaybackCommand.Play -> "play"
            is AudioPlaybackCommand.Pause -> "pause"
            is AudioPlaybackCommand.Stop -> "stop"
            is AudioPlaybackCommand.NextTrack -> "nextTrack"
            is AudioPlaybackCommand.PreviousTrack -> "previousTrack"
            is AudioPlaybackCommand.SeekTo -> "seekTo"
            is AudioPlaybackCommand.SelectTrack -> "selectTrack"
        }

    fun traceTrackId(command: AudioPlaybackCommand): Long? =
        when (command) {
            is AudioPlaybackCommand.StartSession -> command.tracks.getOrNull(command.index)?.trackId
            else -> null
        }

    fun traceSourceRevision(command: AudioPlaybackCommand): Long? =
        when (command) {
            is AudioPlaybackCommand.StartSession -> command.tracks.getOrNull(command.index)?.sourceRevision
            else -> null
        }

    fun traceIndex(command: AudioPlaybackCommand): Int? =
        when (command) {
            is AudioPlaybackCommand.StartSession -> command.index
            is AudioPlaybackCommand.SelectTrack -> command.index
            else -> null
        }

    fun trackMeta(track: AudioPlaybackCommand.AudioTrack): Map<String, Long> =
        mapOf("trackId" to track.trackId, "sourceRevision" to track.sourceRevision)
}
