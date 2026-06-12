package com.chromvoid.app.nativebridge

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import android.webkit.WebView
import com.chromvoid.app.AndroidShareImportDiagnostics
import com.chromvoid.app.main.DefaultWebViewScriptEvaluator
import com.chromvoid.app.main.WebViewScriptEvaluator
import com.chromvoid.app.shared.TracePrivacy
import java.util.UUID
import org.json.JSONArray
import org.json.JSONObject

internal data class AndroidSharedFileHandoffFile(
    val name: String,
    val size: Long?,
    val mimeType: String?,
)

internal data class AndroidSharedFilesHandoff(
    val sessionId: String,
    val files: List<AndroidSharedFileHandoffFile>,
)

internal object AndroidShareImportNativeShell {
    private const val ANDROID_SHARE_NO_FILES = "ANDROID_SHARE_NO_FILES"
    private const val ANDROID_SHARE_IMPORT_BUSY = "ANDROID_SHARE_IMPORT_BUSY"
    private const val ANDROID_SHARE_SESSION_NOT_FOUND = "ANDROID_SHARE_SESSION_NOT_FOUND"

    private data class SharedFile(
        val uri: Uri,
        val name: String,
        val size: Long?,
        val mimeType: String?,
    )

    private data class ShareSession(
        val context: Context,
        val sessionId: String,
        val files: List<SharedFile>,
        val uploading: Boolean = false,
    )

    private val lock = Any()
    private var pendingSession: ShareSession? = null
    private var scriptEvaluator: WebViewScriptEvaluator = DefaultWebViewScriptEvaluator

    fun consumeIntent(
        context: Context,
        intent: Intent?,
    ): Boolean {
        val action = intent?.action ?: return false
        if (action !in setOf(Intent.ACTION_SEND, Intent.ACTION_SEND_MULTIPLE)) return false

        val appContext = context.applicationContext
        AndroidShareImportDiagnostics.log(
            "share_intent_received",
            "action=$action ${AndroidShareImportDiagnostics.describeShareInputs(intent)}",
        )
        val uris = collectStreamUris(intent)
        if (uris.isEmpty()) {
            AndroidShareImportDiagnostics.log(
                "share_rejected",
                "code=$ANDROID_SHARE_NO_FILES action=$action ${AndroidShareImportDiagnostics.describeShareInputs(intent)}",
            )
            return false
        }

        val session = ShareSession(
            context = appContext,
            sessionId = UUID.randomUUID().toString(),
            files = uris.mapIndexed { index, uri -> resolveSharedFile(appContext, index, uri) },
        )

        synchronized(lock) {
            val current = pendingSession
            if (current?.uploading == true) {
                AndroidShareImportDiagnostics.log(
                    "share_rejected",
                    "code=$ANDROID_SHARE_IMPORT_BUSY sessionId=${traceId(current.sessionId)} files=${session.files.size}",
                )
                return false
            }
            if (current != null) {
                AndroidShareImportDiagnostics.log(
                    "share_replaced",
                    "oldSessionId=${traceId(current.sessionId)} newSessionId=${traceId(session.sessionId)} oldFiles=${current.files.size} newFiles=${session.files.size}",
                )
            }
            pendingSession = session
        }

        AndroidShareImportDiagnostics.log(
            "share_staged",
            "sessionId=${traceId(session.sessionId)} files=${session.files.size} knownBytes=${session.files.sumOf { it.size ?: 0L }} unknownSizes=${session.files.count { it.size == null }} authorities=${session.files.map { it.uri.authority.orEmpty() }.distinct().joinToString(",")}",
        )
        return true
    }

    fun dispatchPending(webView: WebView?): Boolean {
        if (webView == null) {
            AndroidShareImportDiagnostics.log("handoff_dispatch_skipped", "reason=no_webview")
            return false
        }
        val payload = synchronized(lock) {
            pendingSession?.let(::handoffFromSession)
        } ?: run {
            AndroidShareImportDiagnostics.log("handoff_dispatch_skipped", "reason=no_pending_session")
            return false
        }

        val payloadLiteral = JSONObject.quote(encodeHandoff(payload))
        return try {
            AndroidShareImportDiagnostics.log(
                "handoff_dispatch_requested",
                "sessionId=${traceId(payload.sessionId)} files=${payload.files.size}",
            )
            scriptEvaluator.evaluate(
                webView,
                """
                (function () {
                  try {
                    const payload = JSON.parse($payloadLiteral)
                    window.__chromvoidPendingAndroidSharedFiles = payload
                    window.dispatchEvent(new CustomEvent('chromvoid:android-share-files-pending'))
                    return true
                  } catch (_error) {
                    return false
                  }
                })();
                """.trimIndent(),
            ) { result ->
                AndroidShareImportDiagnostics.log(
                    "handoff_dispatch_result",
                    "sessionId=${traceId(payload.sessionId)} files=${payload.files.size} scriptReturnedTrue=${result == "true"} scriptResult=${TracePrivacy.traceValue(result.orEmpty())}",
                )
            }
            true
        } catch (error: Exception) {
            Log.w(AndroidShareImportDiagnostics.TAG, "event=handoff_dispatch_failed sessionId=${traceId(payload.sessionId)} error=${traceFailure(error)}")
            false
        }
    }

    @JvmStatic
    fun startSharedFilesUpload(
        uploadId: String,
        shareSessionId: String,
        readChunkSize: Long,
    ): Int {
        val session = synchronized(lock) {
            val current = pendingSession
            if (current == null) {
                AndroidShareImportDiagnostics.log(
                    "share_upload_start_rejected",
                    "uploadId=${traceId(uploadId)} sessionId=${traceId(shareSessionId)} code=$ANDROID_SHARE_SESSION_NOT_FOUND reason=no_pending_session",
                )
                return 1
            }
            if (current.sessionId != shareSessionId) {
                AndroidShareImportDiagnostics.log(
                    "share_upload_start_rejected",
                    "uploadId=${traceId(uploadId)} sessionId=${traceId(shareSessionId)} code=$ANDROID_SHARE_SESSION_NOT_FOUND reason=session_mismatch currentSessionId=${traceId(current.sessionId)}",
                )
                return 1
            }
            if (current.uploading) {
                AndroidShareImportDiagnostics.log(
                    "share_upload_start_rejected",
                    "uploadId=${traceId(uploadId)} sessionId=${traceId(shareSessionId)} code=$ANDROID_SHARE_SESSION_NOT_FOUND reason=already_uploading files=${current.files.size}",
                )
                return 1
            }
            if (current.files.isEmpty()) {
                AndroidShareImportDiagnostics.log(
                    "share_upload_start_rejected",
                    "uploadId=${traceId(uploadId)} sessionId=${traceId(shareSessionId)} code=$ANDROID_SHARE_NO_FILES reason=empty_session",
                )
                return 3
            }
            val uploading = current.copy(uploading = true)
            pendingSession = uploading
            uploading
        }

        AndroidShareImportDiagnostics.log(
            "share_upload_start_requested",
            "uploadId=${traceId(uploadId)} sessionId=${traceId(session.sessionId)} files=${session.files.size} readChunkSize=$readChunkSize",
        )
        val result = NativeUploadNativeShell.startUriUpload(
            context = session.context,
            uploadId = uploadId,
            readChunkSize = readChunkSize,
            uris = session.files.map { file ->
                NativeUploadUriInput(
                    uri = file.uri,
                    displayName = file.name,
                    size = file.size,
                    mimeType = file.mimeType,
                )
            },
            source = "android_share",
            shareSessionId = session.sessionId,
        )
        AndroidShareImportDiagnostics.log(
            "share_upload_start_result",
            "uploadId=${traceId(uploadId)} sessionId=${traceId(session.sessionId)} result=$result files=${session.files.size}",
        )
        if (result != 0) {
            synchronized(lock) {
                val current = pendingSession
                if (current?.sessionId == session.sessionId) {
                    pendingSession = if (result == 2) {
                        current.copy(uploading = false)
                    } else {
                        null
                    }
                }
            }
        }
        return result
    }

    @JvmStatic
    fun cancelShareSession(shareSessionId: String): Boolean =
        synchronized(lock) {
            val current = pendingSession
            if (current == null) {
                AndroidShareImportDiagnostics.log(
                    "share_cancel_rejected",
                    "sessionId=${traceId(shareSessionId)} reason=no_pending_session",
                )
                return false
            }
            if (current.sessionId != shareSessionId) {
                AndroidShareImportDiagnostics.log(
                    "share_cancel_rejected",
                    "sessionId=${traceId(shareSessionId)} reason=session_mismatch currentSessionId=${traceId(current.sessionId)}",
                )
                return false
            }
            if (current.uploading) {
                AndroidShareImportDiagnostics.log(
                    "share_cancel_rejected",
                    "sessionId=${traceId(shareSessionId)} reason=uploading",
                )
                return false
            }
            pendingSession = null
            AndroidShareImportDiagnostics.log(
                "share_cancelled",
                "sessionId=${traceId(shareSessionId)} files=${current.files.size}",
            )
            true
        }

    internal fun resetForTests() {
        synchronized(lock) {
            pendingSession = null
            scriptEvaluator = DefaultWebViewScriptEvaluator
        }
    }

    internal fun setScriptEvaluatorForTests(evaluator: WebViewScriptEvaluator) {
        synchronized(lock) {
            scriptEvaluator = evaluator
        }
    }

    internal fun pendingHandoffForTests(): AndroidSharedFilesHandoff? =
        synchronized(lock) {
            pendingSession?.let(::handoffFromSession)
        }

    internal fun markPendingSessionUploadingForTests(): Boolean =
        synchronized(lock) {
            val current = pendingSession ?: return false
            pendingSession = current.copy(uploading = true)
            true
        }

    internal fun finishSharedFilesUpload(shareSessionId: String) {
        synchronized(lock) {
            val current = pendingSession
            if (current == null) {
                AndroidShareImportDiagnostics.log(
                    "share_upload_finish_ignored",
                    "sessionId=${traceId(shareSessionId)} reason=no_pending_session",
                )
                return
            }
            if (current.sessionId != shareSessionId) {
                AndroidShareImportDiagnostics.log(
                    "share_upload_finish_ignored",
                    "sessionId=${traceId(shareSessionId)} reason=session_mismatch currentSessionId=${traceId(current.sessionId)}",
                )
                return
            }
            if (!current.uploading) {
                AndroidShareImportDiagnostics.log(
                    "share_upload_finish_ignored",
                    "sessionId=${traceId(shareSessionId)} reason=not_uploading",
                )
                return
            }
            pendingSession = null
            AndroidShareImportDiagnostics.log(
                "share_upload_finished",
                "sessionId=${traceId(shareSessionId)} files=${current.files.size}",
            )
        }
    }

    @Suppress("DEPRECATION")
    private fun collectStreamUris(intent: Intent): List<Uri> {
        val ordered = mutableListOf<Uri>()
        if (intent.action == Intent.ACTION_SEND) {
            getParcelableExtraUri(intent, Intent.EXTRA_STREAM)?.let { uri ->
                addSharedFileUri(ordered, uri)
            }
        }
        if (intent.action == Intent.ACTION_SEND_MULTIPLE) {
            getParcelableArrayListExtraUris(intent, Intent.EXTRA_STREAM)?.forEach { uri ->
                addSharedFileUri(ordered, uri)
            }
        }
        intent.clipData?.let { clipData ->
            for (index in 0 until clipData.itemCount) {
                clipData.getItemAt(index)?.uri?.let { uri ->
                    addSharedFileUri(ordered, uri)
                }
            }
        }
        intent.data?.let { uri ->
            addSharedFileUri(ordered, uri)
        }

        val seen = linkedSetOf<String>()
        return ordered.filter { uri ->
            seen.add(uri.toString())
        }
    }

    private fun addSharedFileUri(
        ordered: MutableList<Uri>,
        uri: Uri,
    ) {
        when (uri.scheme?.lowercase()) {
            "content" -> ordered.add(uri)
        }
    }

    @Suppress("DEPRECATION")
    private fun getParcelableExtraUri(
        intent: Intent,
        name: String,
    ): Uri? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(name, Uri::class.java)
        } else {
            intent.getParcelableExtra(name) as? Uri
        }

    @Suppress("DEPRECATION")
    private fun getParcelableArrayListExtraUris(
        intent: Intent,
        name: String,
    ): ArrayList<Uri>? =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableArrayListExtra(name, Uri::class.java)
        } else {
            intent.getParcelableArrayListExtra(name)
        }

    private fun resolveSharedFile(
        context: Context,
        index: Int,
        uri: Uri,
    ): SharedFile {
        val metadata = NativeUriFileMetadataResolver.resolve(
            context = context,
            uri = uri,
            displayName = null,
            size = null,
            mimeType = null,
            fallbackName = "shared-file-${index + 1}",
            defaultMimeType = null,
            guessMimeTypeFromUriPath = true,
            queryFailureLog = { failedUri, error ->
                Log.d(
                    AndroidShareImportDiagnostics.TAG,
                    "event=metadata_query_failed uri=${traceUri(failedUri)} error=${traceFailure(error)}",
                )
            },
            sizeFailureLog = { failedUri, error ->
                Log.d(
                    AndroidShareImportDiagnostics.TAG,
                    "event=metadata_size_failed uri=${traceUri(failedUri)} error=${traceFailure(error)}",
                )
            },
        )
        return SharedFile(
            uri = uri,
            name = metadata.name,
            size = metadata.size,
            mimeType = metadata.mimeType,
        )
    }

    private fun handoffFromSession(session: ShareSession): AndroidSharedFilesHandoff =
        AndroidSharedFilesHandoff(
            sessionId = session.sessionId,
            files = session.files.map { file ->
                AndroidSharedFileHandoffFile(
                    name = file.name,
                    size = file.size,
                    mimeType = file.mimeType,
                )
            },
        )

    private fun encodeHandoff(payload: AndroidSharedFilesHandoff): String {
        val files = JSONArray()
        payload.files.forEach { file ->
            files.put(
                JSONObject()
                    .put("name", file.name)
                    .put("size", file.size ?: JSONObject.NULL)
                    .put("mimeType", file.mimeType ?: JSONObject.NULL),
            )
        }
        return JSONObject()
            .put("sessionId", payload.sessionId)
            .put("files", files)
            .toString()
    }

    private fun traceId(value: String?): String = TracePrivacy.redactIdentifier(value) ?: "blank"

    private fun traceUri(value: Uri): String = TracePrivacy.redactUri(value.toString()) ?: "blank"

    private fun traceFailure(error: Throwable): String = TracePrivacy.failureMessage(error)
}
