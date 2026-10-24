package com.chromvoid.air.ui.media

import android.graphics.Bitmap
import android.graphics.drawable.AnimatedImageDrawable
import com.chromvoid.air.ui.files.DerivativeTier
import com.chromvoid.air.ui.files.FileChanged
import com.chromvoid.air.ui.files.FileStore
import com.chromvoid.air.ui.files.FileTooLarge
import com.chromvoid.air.ui.support.FailureKind
import com.chromvoid.air.ui.support.failureKind
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/** What the catalog knows about an image before it is read. */
public data class ImageFacts(
    val path: String?,
    val size: Long,
    val mimeType: String?,
    val createdAt: Long,
    val updatedAt: Long,
)

/**
 * One image on screen, read as iOS reads it: a picture this session already
 * decoded shows at once; a large still reads Core's stored preview when there
 * is one; otherwise the original is read, bounded, with the camera's own
 * thumbnail softened in its place meanwhile, and once it is on screen Core is
 * asked to store a preview for the next opening. An animation plays only when
 * asked.
 */
public class ImagePreviewModel(
    private val store: FileStore,
    public val nodeId: Long,
    private val generation: ULong,
    public val name: String,
    private val sourceRevision: Long,
    public val facts: ImageFacts?,
    private val scope: CoroutineScope,
    private val posters: ImagePosterCache? = null,
    private val decode: suspend (ByteArray) -> DecodedImage = ImageDecoding::decode,
    private val thumbnail: (ByteArray) -> Bitmap? = ImageDecoding::embeddedThumbnail,
    private val readDetails: (ByteArray) -> ImageDetails = { ImageDetails.read(it) },
) {
    public enum class Status { IDLE, LOADING, READY, FAILED, REVOKED }

    public enum class Issue {
        /** Larger than a viewer holds in memory. */
        TOO_LARGE,

        /** Unsupported or incomplete. */
        UNDECODABLE,

        /** The file changed while it was read. */
        CHANGED,

        /** Anything else. */
        FAILED,
    }

    public data class State(
        val status: Status = Status.IDLE,
        val image: Bitmap? = null,
        /** The camera's embedded thumbnail, shown softened while the image still reads. */
        val placeholder: Bitmap? = null,
        /** Pixel size and camera records; null until read. */
        val details: ImageDetails? = null,
        /** Frames that play on request; null for a still. */
        val animation: AnimatedImageDrawable? = null,
        val playing: Boolean = false,
        val issue: Issue? = null,
    )

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private var work: Job? = null
    private var detailsWork: Job? = null
    private var ensureWork: Job? = null

    /** The read in flight, so a gallery can start its neighbours once this image is on screen. */
    public val loading: Job? get() = work?.takeIf { mutableState.value.status == Status.LOADING }

    private val key: ImagePosterCache.Key? =
        ImagePosterCache.Key(nodeId, sourceRevision).takeIf { sourceRevision > 0 }

    /**
     * A stored preview is worth it for a large still. Animated formats keep
     * their frames, so those always read the original.
     */
    private val usesDerivative: Boolean =
        sourceRevision > 0 &&
            (facts?.size ?: 0) >= DERIVATIVE_THRESHOLD_BYTES &&
            !ImageDecoding.keepsFrames(name, facts?.mimeType)

    public fun load(): Job? {
        val current = mutableState.value
        if (current.status != Status.IDLE && current.status != Status.FAILED) return null
        key?.let { posters?.poster(it) }?.let { poster ->
            mutableState.value = State(Status.READY, image = poster.bitmap, details = poster.details)
            return null
        }
        mutableState.value = current.copy(status = Status.LOADING, issue = null)
        return scope.launch { read() }.also { work = it }
    }

    /** Fills the details from the original's head when the picture came from a stored preview. */
    public fun loadDetails() {
        val current = mutableState.value
        if (current.status != Status.READY || current.details != null || detailsWork?.isActive == true) return
        detailsWork = scope.launch {
            val head = runCatching { store.readHead(nodeId, generation) }.getOrNull() ?: return@launch
            try {
                val details = readDetails(head)
                val after = mutableState.value
                if (after.status == Status.READY && after.details == null) {
                    mutableState.value = after.copy(details = details)
                }
            } finally {
                head.fill(0)
            }
        }
    }

    public fun play() {
        val current = mutableState.value
        val animation = current.animation ?: return
        if (current.status != Status.READY || current.playing) return
        animation.start()
        mutableState.value = current.copy(playing = true)
    }

    public fun pause() {
        val current = mutableState.value
        current.animation?.stop()
        if (current.playing) mutableState.value = current.copy(playing = false)
    }

    /** The image left the screen or the session ended: nothing decoded stays here. */
    public fun close() {
        work?.cancel()
        detailsWork?.cancel()
        ensureWork?.cancel()
        mutableState.value.animation?.stop()
        mutableState.value = State(Status.REVOKED)
    }

    private suspend fun read() {
        storedPreview()?.let { stored ->
            if (mutableState.value.status != Status.LOADING) return
            mutableState.value = State(Status.READY, image = stored.bitmap)
            key?.let { posters?.store(it, ImagePosterCache.Poster(stored.bitmap, null)) }
            return
        }
        try {
            val content = store.readFile(nodeId, generation, ImageDecoding.MAXIMUM_SOURCE_BYTES) { head ->
                showThumbnail(head)
            }
            val decoded = try {
                decode(content.bytes)
            } catch (error: Throwable) {
                content.bytes.fill(0)
                throw error
            }
            // An animation keeps reading its frames from these bytes; a still is done with them.
            if (decoded.animation == null) content.bytes.fill(0)
            if (mutableState.value.status != Status.LOADING) return
            mutableState.value = State(
                Status.READY,
                image = decoded.bitmap,
                details = decoded.details,
                animation = decoded.animation,
            )
            if (decoded.animation == null) {
                key?.let { posters?.store(it, ImagePosterCache.Poster(decoded.bitmap, decoded.details)) }
            }
            ensureStoredPreview()
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (error: Exception) {
            if (error.failureKind == FailureKind.REVOKED) {
                close()
                return
            }
            if (mutableState.value.status != Status.LOADING) return
            mutableState.value = State(
                Status.FAILED,
                issue = when (error) {
                    is FileTooLarge -> Issue.TOO_LARGE
                    is ImageDecodeFailed -> Issue.UNDECODABLE
                    is FileChanged -> Issue.CHANGED
                    else -> Issue.FAILED
                },
            )
        }
    }

    /** An existing stored preview; null when there is none yet or it cannot be used. */
    private suspend fun storedPreview(): DecodedImage? {
        if (!usesDerivative) return null
        return try {
            val bytes = store.derivative(nodeId, sourceRevision, DerivativeTier.PREVIEW, ensure = false, generation)
            try {
                decode(bytes)
            } finally {
                bytes.fill(0)
            }
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (_: Exception) {
            null
        }
    }

    /**
     * The original has been shown once: Core converts and stores its preview, so later openings,
     * after a relaunch too, read the small encrypted copy. Nothing waits for it, and a failure
     * changes nothing on screen.
     */
    private fun ensureStoredPreview() {
        if (!usesDerivative || ensureWork != null) return
        ensureWork = scope.launch {
            try {
                store.derivative(nodeId, sourceRevision, DerivativeTier.PREVIEW, ensure = true, generation).fill(0)
            } catch (cancellation: CancellationException) {
                throw cancellation
            } catch (_: Exception) {
                // The next opening reads the original again and asks anew.
            }
        }
    }

    private fun showThumbnail(head: ByteArray) {
        try {
            val current = mutableState.value
            if (current.status != Status.LOADING || current.placeholder != null) return
            thumbnail(head)?.let { mutableState.value = current.copy(placeholder = it) }
        } finally {
            head.fill(0)
        }
    }

    private companion object {
        const val DERIVATIVE_THRESHOLD_BYTES = 1024L * 1024
    }
}
