package com.chromvoid.air.ui.files

import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.support.FailureKind
import com.chromvoid.air.ui.support.failureKind
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Documents and photos imported into one folder, one after another as iOS
 * imports them. Each confirmed file stays imported whatever happens after it;
 * Stop ends the batch at the file in flight, whose outcome is then unknown.
 */
public class FileImportModel(
    private val store: FileStore,
    /** The folder the files go into. */
    public val destination: String,
    private val generation: ULong,
    private val scope: CoroutineScope,
    /** The camera, for Take Photo; null where there is none (tests, previews). */
    private val camera: PhotoCapture? = null,
    private val onFinished: () -> Unit = {},
) {
    public enum class Phase { CHOOSING, RUNNING, STOPPING, FINISHED, REVOKED }

    public sealed interface Outcome {
        public data object Pending : Outcome

        public data object Transferring : Outcome

        public data object Imported : Outcome

        public data class Failed(val issue: FileIssue) : Outcome

        /** Stopped mid-file: the folder may or may not hold it. */
        public data object Interrupted : Outcome
    }

    public data class Item(
        val name: String,
        val received: Long = 0,
        val total: Long = 0,
        val outcome: Outcome = Outcome.Pending,
    )

    /** Why Take Photo gave no photo. */
    public enum class CameraIssue { DENIED, UNAVAILABLE }

    public data class State(
        val phase: Phase = Phase.CHOOSING,
        val items: List<Item> = emptyList(),
        /** The picker handed back nothing it could open. */
        val pickerFailed: Boolean = false,
        /** The camera is open for a photo. */
        val capturing: Boolean = false,
        val cameraIssue: CameraIssue? = null,
    ) {
        val busy: Boolean get() = phase == Phase.RUNNING || phase == Phase.STOPPING

        val imported: Int get() = items.count { it.outcome == Outcome.Imported }

        /** Another batch may be chosen: before the first, and after one finished. */
        val canChoose: Boolean get() = phase == Phase.CHOOSING || phase == Phase.FINISHED
    }

    private val mutableState = MutableStateFlow(State())
    public val state: StateFlow<State> = mutableState.asStateFlow()

    private var run: Job? = null
    private var capture: Job? = null

    /** Take Photo is offered: the device has a camera. */
    public val canTakePhoto: Boolean get() = camera?.available == true

    /** The picker returned these documents; an empty choice changes nothing. */
    public fun receive(sources: List<FileSource>) {
        val current = mutableState.value
        if (!current.canChoose || sources.isEmpty()) return
        mutableState.value = State(phase = Phase.RUNNING, items = sources.map { Item(it.label) })
        run = scope.launch { import(sources) }
    }

    /** Take Photo: the camera's one photo goes into the folder as a picked one does. */
    public fun takePhoto() {
        val camera = camera ?: return
        val current = mutableState.value
        if (!current.canChoose || current.capturing) return
        mutableState.value = current.copy(capturing = true, pickerFailed = false, cameraIssue = null)
        capture = scope.launch {
            val result = camera.capture()
            val after = mutableState.value
            if (after.phase == Phase.REVOKED) {
                (result as? PhotoCapture.Result.Taken)?.jpeg?.fill(0)
                return@launch
            }
            mutableState.value = after.copy(
                capturing = false,
                cameraIssue = when (result) {
                    PhotoCapture.Result.PermissionDenied -> CameraIssue.DENIED
                    PhotoCapture.Result.Unavailable -> CameraIssue.UNAVAILABLE
                    else -> null
                },
            )
            if (result is PhotoCapture.Result.Taken) {
                receive(listOf(PhotoSource(photoName(result.takenAt), result.jpeg)))
            }
        }
    }

    /** The picker failed to hand the documents over. */
    public fun pickerFailed() {
        if (!mutableState.value.canChoose) return
        mutableState.value = mutableState.value.copy(pickerFailed = true)
    }

    /** Ends the batch at the file in flight. */
    public fun stop() {
        if (mutableState.value.phase != Phase.RUNNING) return
        mutableState.value = mutableState.value.copy(phase = Phase.STOPPING)
        run?.cancel()
    }

    public fun close() {
        run?.cancel()
        capture?.cancel()
        mutableState.value = State(phase = Phase.REVOKED)
    }

    private suspend fun import(sources: List<FileSource>) {
        try {
            for ((index, source) in sources.withIndex()) {
                update(index) { it.copy(outcome = Outcome.Transferring) }
                val outcome = try {
                    val saved = store.importFile(source, destination, generation) { received, total ->
                        if (mutableState.value.phase == Phase.RUNNING) {
                            update(index) { it.copy(received = received, total = total) }
                        }
                    }
                    if (saved.completed) Outcome.Imported else Outcome.Interrupted
                } catch (cancellation: CancellationException) {
                    update(index) { it.copy(outcome = Outcome.Interrupted) }
                    throw cancellation
                } catch (error: Exception) {
                    if (error.failureKind == FailureKind.REVOKED) {
                        close()
                        return
                    }
                    val issue = if (error is IOException) FileIssue.DEVICE else error.fileIssue
                    update(index) { it.copy(outcome = Outcome.Failed(issue)) }
                    // A bridge failure leaves the writer's state unknown; the next
                    // file is not started over it.
                    if (error is BridgeException) return
                    continue
                }
                update(index) { it.copy(outcome = outcome) }
            }
        } finally {
            if (mutableState.value.phase != Phase.REVOKED) finish()
        }
    }

    private fun finish() {
        val current = mutableState.value
        if (current.phase == Phase.REVOKED || current.phase == Phase.FINISHED) return
        mutableState.value = current.copy(phase = Phase.FINISHED)
        onFinished()
    }

    private inline fun update(index: Int, change: (Item) -> Item) {
        val current = mutableState.value
        if (current.phase == Phase.REVOKED) return
        mutableState.value = current.copy(
            items = current.items.mapIndexed { i, item -> if (i == index) change(item) else item },
        )
    }
}
