package com.chromvoid.air.ui.media

import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import com.chromvoid.air.ui.files.FileStore
import com.chromvoid.air.ui.support.FailureKind
import com.chromvoid.air.ui.support.failureKind
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** Makes a player that reads its media through [source]. */
@UnstableApi
public fun interface MediaPlayers {
    public fun create(source: DataSource.Factory): Player
}

/**
 * Audio or video on screen, as iOS plays it: the file's size and revision are
 * taken first, then a player reads it from the vault range by range. Nothing
 * starts on its own; leaving the screen pauses, and closing - or a lock -
 * releases the player and every reader it held.
 */
@UnstableApi
public class MediaPreviewModel(
    private val store: FileStore,
    public val nodeId: Long,
    private val generation: ULong,
    public val name: String,
    private val scope: CoroutineScope,
    private val players: MediaPlayers,
) {
    public enum class Status { IDLE, LOADING, READY, FAILED, REVOKED }

    public data class State(val status: Status = Status.IDLE, val player: Player? = null)

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private var work: Job? = null

    private val failures = object : Player.Listener {
        override fun onPlayerError(error: PlaybackException) {
            fail()
        }
    }

    public fun load() {
        val current = mutableState.value
        if (current.status != Status.IDLE && current.status != Status.FAILED) return
        mutableState.value = State(Status.LOADING)
        work = scope.launch {
            try {
                // One byte proves the file is there and names the revision every range must match.
                val reader = store.openReader(nodeId, generation)
                val probe = try {
                    reader.read(0, 1)
                } finally {
                    reader.cancel()
                }
                probe.bytes.fill(0)
                if (probe.metadata.size <= 0 || mutableState.value.status != Status.LOADING) {
                    if (mutableState.value.status == Status.LOADING) fail()
                    return@launch
                }
                val source = DataSource.Factory { VaultDataSource(store, nodeId, generation, probe.metadata) }
                val player = players.create(source).apply {
                    addListener(failures)
                    setMediaItem(MediaItem.fromUri(Uri.parse("$SCHEME://$nodeId")))
                    playWhenReady = false
                    prepare()
                }
                mutableState.value = State(Status.READY, player)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (error: Exception) {
                if (error.failureKind == FailureKind.REVOKED) close() else fail()
            }
        }
    }

    /** The screen went away or the app left the foreground. */
    public fun pause() {
        mutableState.value.player?.pause()
    }

    public fun close() {
        work?.cancel()
        releasePlayer()
        mutableState.value = State(Status.REVOKED)
    }

    private fun fail() {
        if (mutableState.value.status == Status.REVOKED) return
        releasePlayer()
        mutableState.value = State(Status.FAILED)
    }

    private fun releasePlayer() {
        mutableState.value.player?.let { player ->
            player.removeListener(failures)
            player.stop()
            player.release()
        }
    }

    public companion object {
        private const val SCHEME = "chromvoid-vault"
        private val EXTENSIONS = setOf(
            "mp4", "m4v", "mov", "webm", "mkv", "3gp", "mp3", "m4a", "aac", "wav", "ogg", "oga", "opus", "flac",
        )

        public fun supports(name: String, mimeType: String?): Boolean {
            val type = mimeType?.lowercase()
            if (type != null && (type.startsWith("audio/") || type.startsWith("video/"))) return true
            return name.substringAfterLast('.', "").lowercase() in EXTENSIONS
        }
    }
}
