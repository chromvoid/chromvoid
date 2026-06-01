package com.chromvoid.app.nativebridge

import android.Manifest
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Log
import androidx.activity.result.ActivityResultLauncher
import com.chromvoid.app.shared.NativeRuntimeLoader
import com.chromvoid.app.shared.TracePrivacy
import java.util.Locale
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference

internal object NativeUploadNativeShell {
    private const val TAG = "ChromVoid/NativeUpload"
    private const val MEDIA_LOCATION_PERMISSION_FALLBACK_MS = 1_500L

    private val uploadStateLock = Any()
    private val pickerLauncher = AtomicReference<ActivityResultLauncher<Array<String>>?>()
    private val mediaLocationPermissionLauncher = AtomicReference<ActivityResultLauncher<String>?>()
    private val appContext = AtomicReference<Context?>()
    private val pendingPicker = AtomicReference<PendingPicker?>()
    private val pendingMediaLocationStream = AtomicReference<PendingStream?>()
    private val activeUpload = AtomicReference<ActiveUpload?>()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val executor = Executors.newSingleThreadExecutor { runnable ->
        Thread(runnable, "chromvoid-native-upload").apply {
            isDaemon = true
        }
    }
    private val nativeCallbackSink =
        object : NativeUploadCallbackSink {
            override fun onFileStreamStarted(
                uploadId: String,
                fileId: String,
                provenanceJson: String,
            ): Boolean =
                callNativeBoolean { nativeOnFileStreamStarted(uploadId, fileId, provenanceJson) }

            override fun onFileChunk(
                uploadId: String,
                fileId: String,
                offset: Long,
                chunk: ByteArray,
            ): Boolean =
                callNativeBoolean { nativeOnFileChunk(uploadId, fileId, offset, chunk) }

            override fun onFileCompleted(
                uploadId: String,
                fileId: String,
            ): Boolean =
                callNativeBoolean { nativeOnFileCompleted(uploadId, fileId) }

            override fun onUploadFinished(uploadId: String) {
                runNative { nativeOnUploadFinished(uploadId) }
            }

            override fun onUploadFailed(
                uploadId: String,
                message: String,
            ) {
                runNative { nativeOnUploadFailed(uploadId, message) }
            }
        }
    private val streamRunner = NativeUploadStreamRunner(nativeCallbackSink)

    @JvmStatic
    fun bindPickerLauncher(
        context: Context,
        launcher: ActivityResultLauncher<Array<String>>,
        permissionLauncher: ActivityResultLauncher<String>,
    ) {
        appContext.set(context.applicationContext)
        pickerLauncher.set(launcher)
        mediaLocationPermissionLauncher.set(permissionLauncher)
    }

    @JvmStatic
    fun clearPickerLauncher(launcher: ActivityResultLauncher<Array<String>>) {
        val pendingStream = synchronized(uploadStateLock) {
            pickerLauncher.compareAndSet(launcher, null)
            mediaLocationPermissionLauncher.set(null)
            appContext.set(null)
            pendingPicker.set(null)
            pendingMediaLocationStream.getAndSet(null)
        }
        if (pendingStream != null) {
            Log.i(
                TAG,
                "event=media_location_permission_skip uploadId=${traceId(pendingStream.uploadId)} source=${pendingStream.source} reason=launcher_cleared",
            )
            executeStreamPreparedFiles(pendingStream)
        }
    }

    internal fun resetForTests() {
        synchronized(uploadStateLock) {
            pickerLauncher.set(null)
            mediaLocationPermissionLauncher.set(null)
            appContext.set(null)
            pendingPicker.set(null)
            pendingMediaLocationStream.set(null)
            activeUpload.set(null)
        }
    }

    @JvmStatic
    fun startFilePicker(uploadId: String, readChunkSize: Long): Int {
        val launcher = pickerLauncher.get() ?: return 1
        val bufferSize = readChunkSize
            .coerceIn(64L * 1024L, 8L * 1024L * 1024L)
            .toInt()
        val pending = PendingPicker(uploadId = uploadId, bufferSize = bufferSize, launcher = launcher)
        synchronized(uploadStateLock) {
            if (
                pendingPicker.get() != null ||
                pendingMediaLocationStream.get() != null ||
                activeUpload.get() != null
            ) {
                return 2
            }
            pendingPicker.set(pending)
        }

        return launchPicker(pending)
    }

    @JvmStatic
    fun handleMediaLocationPermissionResult(granted: Boolean) {
        val pending = pendingMediaLocationStream.getAndSet(null)
        if (pending == null) {
            Log.i(TAG, "event=media_location_permission_result_without_upload granted=$granted")
            return
        }
        Log.i(TAG, "event=media_location_permission_result uploadId=${traceId(pending.uploadId)} granted=$granted")
        executeStreamPreparedFiles(pending)
    }

    private fun launchPicker(pending: PendingPicker): Int =
        try {
            Log.i(
                TAG,
                "event=picker_launch uploadId=${traceId(pending.uploadId)} bufferSize=${pending.bufferSize} mediaLocationPermission=${hasMediaLocationPermission()}",
            )
            pending.launcher.launch(arrayOf("*/*"))
            0
        } catch (error: Throwable) {
            pendingPicker.compareAndSet(pending, null)
            Log.w(TAG, "picker_launch_failed uploadId=${traceId(pending.uploadId)} error=${traceFailure(error)}")
            3
        }

    @JvmStatic
    fun handlePickerResult(
        context: Context,
        uris: List<Uri>,
    ) {
        var busy = false
        val pending = synchronized(uploadStateLock) {
            val current = pendingPicker.get() ?: return
            pendingPicker.set(null)
            if (uris.isNotEmpty()) {
                if (pendingMediaLocationStream.get() != null || activeUpload.get() != null) {
                    busy = true
                } else {
                    activeUpload.set(
                        ActiveUpload(
                            uploadId = current.uploadId,
                            source = "picker",
                            shareSessionId = null,
                        ),
                    )
                }
            }
            current
        }
        if (uris.isEmpty()) {
            Log.i(TAG, "event=picker_cancel uploadId=${traceId(pending.uploadId)}")
            runNative { nativeOnUploadCancelled(pending.uploadId) }
            return
        }
        if (busy) {
            Log.i(TAG, "event=picker_result_rejected uploadId=${traceId(pending.uploadId)} reason=busy")
            runNative { nativeOnUploadFailed(pending.uploadId, "Native upload is busy") }
            return
        }

        Log.i(
            TAG,
            "event=picker_result uploadId=${traceId(pending.uploadId)} files=${uris.size} bufferSize=${pending.bufferSize}",
        )
        try {
            submitUriUpload(
                context = context.applicationContext,
                uploadId = pending.uploadId,
                bufferSize = pending.bufferSize,
                inputs = uris.map { uri ->
                    NativeUploadUriInput(
                        uri = uri,
                        displayName = null,
                        size = null,
                        mimeType = null,
                    )
                },
                source = "picker",
            )
        } catch (error: Throwable) {
            val message = nativeUploadFailureMessage("picker", error)
            clearActiveUpload(pending.uploadId)
            Log.w(TAG, "picker_upload_submit_failed uploadId=${traceId(pending.uploadId)} error=${traceFailure(error)}")
            runNative { nativeOnUploadFailed(pending.uploadId, message) }
        }
    }

    internal fun startUriUpload(
        context: Context,
        uploadId: String,
        readChunkSize: Long,
        uris: List<NativeUploadUriInput>,
        source: String,
        shareSessionId: String? = null,
    ): Int {
        if (uris.isEmpty()) {
            Log.i(
                TAG,
                "event=uri_upload_start_rejected uploadId=${traceId(uploadId)} source=$source shareSessionId=${traceId(shareSessionId)} code=ANDROID_SHARE_NO_FILES reason=no_uris",
            )
            return 3
        }
        val bufferSize = readChunkSize
            .coerceIn(64L * 1024L, 8L * 1024L * 1024L)
            .toInt()
        synchronized(uploadStateLock) {
            if (
                pendingPicker.get() != null ||
                pendingMediaLocationStream.get() != null ||
                activeUpload.get() != null
            ) {
                val active = activeUpload.get()
                Log.i(
                    TAG,
                    "event=uri_upload_start_rejected uploadId=${traceId(uploadId)} source=$source shareSessionId=${traceId(shareSessionId)} code=ANDROID_SHARE_IMPORT_BUSY reason=busy activeUploadId=${traceId(active?.uploadId)} activeSource=${active?.source.orEmpty()} pendingPicker=${pendingPicker.get() != null} pendingMediaLocation=${pendingMediaLocationStream.get() != null}",
                )
                return 2
            }
            activeUpload.set(
                ActiveUpload(
                    uploadId = uploadId,
                    source = source,
                    shareSessionId = shareSessionId,
                ),
            )
        }

        Log.i(
            TAG,
            "event=uri_upload_start_accepted uploadId=${traceId(uploadId)} source=$source shareSessionId=${traceId(shareSessionId)} files=${uris.size} bufferSize=$bufferSize",
        )
        return try {
            submitUriUpload(
                context = context.applicationContext,
                uploadId = uploadId,
                bufferSize = bufferSize,
                inputs = uris,
                source = source,
            )
            0
        } catch (error: Throwable) {
            clearActiveUpload(uploadId)
            Log.w(
                TAG,
                "event=uri_upload_start_failed uploadId=${traceId(uploadId)} source=$source shareSessionId=${traceId(shareSessionId)} code=NATIVE_UPLOAD_START_FAILED error=${traceFailure(error)}",
            )
            4
        }
    }

    private fun submitUriUpload(
        context: Context,
        uploadId: String,
        bufferSize: Int,
        inputs: List<NativeUploadUriInput>,
        source: String,
    ) {
        executor.execute {
            runCatching {
                resolveUploadFilesAndMaybeStream(
                    context = context,
                    uploadId = uploadId,
                    bufferSize = bufferSize,
                    inputs = inputs,
                    source = source,
                )
            }.onFailure { error ->
                val message = nativeUploadFailureMessage(source, error)
                Log.w(TAG, "event=batch_failed uploadId=${traceId(uploadId)} source=$source message=${traceFailure(error)}")
                runNative { nativeOnUploadFailed(uploadId, message) }
                clearActiveUpload(uploadId)
            }
        }
    }

    private fun resolveUploadFilesAndMaybeStream(
        context: Context,
        uploadId: String,
        bufferSize: Int,
        inputs: List<NativeUploadUriInput>,
        source: String,
    ) {
        val batchStartNs = SystemClock.elapsedRealtimeNanos()
        Log.i(
            TAG,
            "event=batch_start uploadId=${traceId(uploadId)} source=$source files=${inputs.size} bufferSize=$bufferSize",
        )
        val resolveStartNs = SystemClock.elapsedRealtimeNanos()
        val files = inputs.mapIndexed { index, input ->
            NativeUploadReadResolver.resolveUploadFile(context, uploadId, index, input, source)
        }
        Log.i(
            TAG,
            "event=files_resolved uploadId=${traceId(uploadId)} source=$source files=${files.size} knownBytes=${files.sumOf { if (it.size > 0) it.size else 0L }} unknownSizes=${files.count { it.size < 0 }} elapsedMs=${formatMs(SystemClock.elapsedRealtimeNanos() - resolveStartNs)}",
        )

        val selectedStartNs = SystemClock.elapsedRealtimeNanos()
        if (!callNativeBoolean { nativeOnFilesSelected(uploadId, NativeUploadPayloadCodec.encodeFiles(files)) }) {
            Log.i(
                TAG,
                "event=files_selected_rejected uploadId=${traceId(uploadId)} source=$source elapsedMs=${formatMs(SystemClock.elapsedRealtimeNanos() - selectedStartNs)}",
            )
            clearActiveUpload(uploadId)
            return
        }
        Log.i(
            TAG,
            "event=files_selected_sent uploadId=${traceId(uploadId)} source=$source elapsedMs=${formatMs(SystemClock.elapsedRealtimeNanos() - selectedStartNs)}",
        )

        requestMediaLocationPermissionOrStream(
            PendingStream(
                context = context,
                uploadId = uploadId,
                bufferSize = bufferSize,
                files = files,
                batchStartNs = batchStartNs,
                source = source,
            ),
        )
    }

    private fun streamPreparedFiles(
        context: Context,
        uploadId: String,
        bufferSize: Int,
        files: List<PickedFile>,
        batchStartNs: Long,
        source: String,
    ) {
        try {
            streamRunner.streamPreparedFiles(
                context = context,
                uploadId = uploadId,
                bufferSize = bufferSize,
                files = files,
                batchStartNs = batchStartNs,
                source = source,
            )
        } finally {
            clearActiveUpload(uploadId)
        }
    }

    private fun requestMediaLocationPermissionOrStream(pending: PendingStream) {
        if (!NativeUploadReadResolver.shouldRequestMediaLocationPermission(pending.context, pending.files)) {
            streamPreparedFiles(
                pending.context,
                pending.uploadId,
                pending.bufferSize,
                pending.files,
                pending.batchStartNs,
                pending.source,
            )
            return
        }

        if (!pendingMediaLocationStream.compareAndSet(null, pending)) {
            Log.i(
                TAG,
                "event=media_location_permission_skip uploadId=${traceId(pending.uploadId)} reason=pending_request_exists",
            )
            executeStreamPreparedFiles(pending)
            return
        }

        mainHandler.post {
            val permissionLauncher = mediaLocationPermissionLauncher.get()
            if (permissionLauncher == null) {
                if (!pendingMediaLocationStream.compareAndSet(pending, null)) {
                    Log.i(
                        TAG,
                        "event=media_location_permission_skip uploadId=${traceId(pending.uploadId)} source=${pending.source} reason=stale_no_launcher_callback",
                    )
                    return@post
                }
                Log.i(
                    TAG,
                    "event=media_location_permission_skip uploadId=${traceId(pending.uploadId)} reason=no_launcher",
                )
                executeStreamPreparedFiles(pending)
                return@post
            }

            try {
                Log.i(TAG, "event=media_location_permission_request uploadId=${traceId(pending.uploadId)}")
                permissionLauncher.launch(Manifest.permission.ACCESS_MEDIA_LOCATION)
                mainHandler.postDelayed(
                    {
                        if (pendingMediaLocationStream.compareAndSet(pending, null)) {
                            Log.i(
                                TAG,
                                "event=media_location_permission_timeout uploadId=${traceId(pending.uploadId)} fallback=redacted",
                            )
                            executeStreamPreparedFiles(pending)
                        }
                    },
                    MEDIA_LOCATION_PERMISSION_FALLBACK_MS,
                )
            } catch (error: Throwable) {
                if (!pendingMediaLocationStream.compareAndSet(pending, null)) {
                    Log.i(
                        TAG,
                        "event=media_location_permission_skip uploadId=${traceId(pending.uploadId)} source=${pending.source} reason=stale_launch_error_callback",
                    )
                    return@post
                }
                Log.w(TAG, "media_location_permission_request_failed uploadId=${traceId(pending.uploadId)} error=${traceFailure(error)}")
                executeStreamPreparedFiles(pending)
            }
        }
    }

    private fun executeStreamPreparedFiles(pending: PendingStream) {
        executor.execute {
            runCatching {
                streamPreparedFiles(
                    pending.context,
                    pending.uploadId,
                    pending.bufferSize,
                    pending.files,
                    pending.batchStartNs,
                    pending.source,
                )
            }.onFailure { error ->
                val message = nativeUploadFailureMessage(pending.source, error)
                Log.w(TAG, "event=batch_failed uploadId=${traceId(pending.uploadId)} source=${pending.source} message=${traceFailure(error)}")
                runNative { nativeOnUploadFailed(pending.uploadId, message) }
                clearActiveUpload(pending.uploadId)
            }
        }
    }

    private fun nativeUploadFailureMessage(source: String, error: Throwable): String {
        if (source == "android_share" && error is SecurityException) {
            return "ANDROID_SHARE_PERMISSION_DENIED"
        }
        return error.message ?: error.javaClass.simpleName
    }

    private fun clearActiveUpload(uploadId: String) {
        val finishedShareSessionId = synchronized(uploadStateLock) {
            val current = activeUpload.get()
            if (current?.uploadId != uploadId) {
                null
            } else {
                activeUpload.set(null)
                current.shareSessionId
            }
        }
        finishedShareSessionId?.let(AndroidShareImportNativeShell::finishSharedFilesUpload)
    }

    private fun hasMediaLocationPermission(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
        val context = appContext.get() ?: return false
        return NativeUploadReadResolver.hasMediaLocationPermission(context)
    }

    private fun formatMs(ns: Long): String = String.format(Locale.US, "%.2f", ns / 1_000_000.0)

    private fun traceId(value: String?): String = TracePrivacy.redactIdentifier(value) ?: "blank"

    private fun traceFailure(error: Throwable): String = TracePrivacy.failureMessage(error)

    private fun callNativeBoolean(block: () -> Boolean): Boolean =
        NativeRuntimeLoader.callWhenLoaded(TAG, false, block)

    private fun runNative(block: () -> Unit) {
        NativeRuntimeLoader.runWhenLoaded(TAG, block)
    }

    @JvmStatic
    private external fun nativeOnFilesSelected(uploadId: String, filesJson: String): Boolean

    @JvmStatic
    private external fun nativeOnFileStreamStarted(uploadId: String, fileId: String, provenanceJson: String): Boolean

    @JvmStatic
    private external fun nativeOnFileChunk(uploadId: String, fileId: String, offset: Long, chunk: ByteArray): Boolean

    @JvmStatic
    private external fun nativeOnFileCompleted(uploadId: String, fileId: String): Boolean

    @JvmStatic
    private external fun nativeOnUploadFinished(uploadId: String)

    @JvmStatic
    private external fun nativeOnUploadCancelled(uploadId: String)

    @JvmStatic
    private external fun nativeOnUploadFailed(uploadId: String, message: String)
}
