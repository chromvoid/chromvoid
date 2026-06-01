package com.chromvoid.app.nativebridge

import android.content.Context
import android.net.Uri
import android.os.SystemClock
import androidx.activity.result.ActivityResultLauncher
import java.io.InputStream

internal data class NativeUploadUriInput(
    val uri: Uri,
    val displayName: String?,
    val size: Long?,
    val mimeType: String?,
)

internal data class PendingPicker(
    val uploadId: String,
    val bufferSize: Int,
    val launcher: ActivityResultLauncher<Array<String>>,
)

internal data class ActiveUpload(
    val uploadId: String,
    val source: String,
    val shareSessionId: String?,
)

internal data class PickedFile(
    val fileId: String,
    val uri: Uri,
    val name: String,
    val size: Long,
    val mimeType: String,
)

internal data class StreamStats(
    val startedNs: Long = SystemClock.elapsedRealtimeNanos(),
    var bytesRead: Long = 0,
    var chunks: Long = 0,
    var zeroReads: Long = 0,
    var readNs: Long = 0,
    var copyNs: Long = 0,
    var nativeNs: Long = 0,
    var slowReadCalls: Long = 0,
    var slowNativeCalls: Long = 0,
    var slowCopyCalls: Long = 0,
    var lastLogNs: Long = startedNs,
    var lastLogBytes: Long = 0,
)

internal data class StreamResult(
    val completed: Boolean,
    val stats: StreamStats,
)

internal data class OpenedUploadStream(
    val readUri: Uri,
    val stream: InputStream,
    val provenance: UploadReadProvenance,
)

internal data class UploadReadProvenance(
    val imageCandidate: Boolean,
    val permissionStatus: String,
    val requireOriginalStatus: String,
    val originalStreamUsed: Boolean,
    val regularStreamFallback: Boolean,
    val uriScheme: String,
    val uriAuthority: String,
    val capturedAtMs: Long,
)

internal data class OriginalMediaUriResult(
    val uri: Uri,
    val requireOriginalStatus: String,
    val shouldOpenOriginal: Boolean,
)

internal data class OriginalMediaUriDebugSnapshot(
    val uri: String,
    val requireOriginalStatus: String,
    val shouldOpenOriginal: Boolean,
)

internal data class PendingStream(
    val context: Context,
    val uploadId: String,
    val bufferSize: Int,
    val files: List<PickedFile>,
    val batchStartNs: Long,
    val source: String,
)
