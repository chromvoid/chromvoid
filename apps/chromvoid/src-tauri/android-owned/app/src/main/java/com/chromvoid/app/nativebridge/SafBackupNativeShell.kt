package com.chromvoid.app.nativebridge

import android.content.Context
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.DocumentsContract
import android.util.Log
import androidx.activity.result.ActivityResultLauncher
import com.chromvoid.app.shared.NativeBridgeTaskDispatcher
import com.chromvoid.app.shared.NativeRuntimeLoader
import com.chromvoid.app.shared.TracePrivacy
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicReference

internal interface SafBackupDocumentOperations {
    fun query(
        context: Context,
        uri: Uri,
        projection: Array<String>,
    ): Cursor?

    fun deleteDocument(
        context: Context,
        uri: Uri,
    ): Boolean

    fun createDocument(
        context: Context,
        parentUri: Uri,
        mimeType: String,
        name: String,
    ): Uri?

    fun openOutputStream(
        context: Context,
        uri: Uri,
        mode: String,
    ): OutputStream?
}

private object AndroidSafBackupDocumentOperations : SafBackupDocumentOperations {
    override fun query(
        context: Context,
        uri: Uri,
        projection: Array<String>,
    ): Cursor? = context.contentResolver.query(uri, projection, null, null, null)

    override fun deleteDocument(
        context: Context,
        uri: Uri,
    ): Boolean = DocumentsContract.deleteDocument(context.contentResolver, uri)

    override fun createDocument(
        context: Context,
        parentUri: Uri,
        mimeType: String,
        name: String,
    ): Uri? = DocumentsContract.createDocument(context.contentResolver, parentUri, mimeType, name)

    override fun openOutputStream(
        context: Context,
        uri: Uri,
        mode: String,
    ): OutputStream? = context.contentResolver.openOutputStream(uri, mode)
}

internal object SafBackupNativeShell {
    private const val TAG = "ChromVoid/SafBackup"
    private const val MIME_DIR = DocumentsContract.Document.MIME_TYPE_DIR
    private const val MIME_FILE = "application/octet-stream"

    private enum class PickerMode {
        BACKUP,
        RESTORE,
    }

    private data class PendingTreePick(
        val operationId: String,
        val mode: PickerMode,
        val launcher: ActivityResultLauncher<Uri?>,
    )

    private data class ChildDocument(
        val name: String,
        val mimeType: String,
        val uri: Uri,
    )

    private data class SafDocumentRef(
        val authority: String,
        val treeUri: Uri?,
        val documentUri: Uri,
        val documentId: String,
    )

    private data class WriteSession(
        val uri: Uri,
        val stream: OutputStream,
    )

    private data class ReadSession(
        val stream: InputStream,
    )

    private val treePickerLauncher = AtomicReference<ActivityResultLauncher<Uri?>?>()
    private val pendingTreePick = AtomicReference<PendingTreePick?>()
    private val mainHandler = Handler(Looper.getMainLooper())
    private val writeSessions = ConcurrentHashMap<String, WriteSession>()
    private val readSessions = ConcurrentHashMap<String, ReadSession>()
    private val documentOperations = AtomicReference<SafBackupDocumentOperations>(AndroidSafBackupDocumentOperations)

    @JvmStatic
    fun bindTreePickerLauncher(
        launcher: ActivityResultLauncher<Uri?>,
    ) {
        Log.i(TAG, "tree_picker_launcher_bound")
        treePickerLauncher.set(launcher)
    }

    @JvmStatic
    fun clearTreePickerLauncher(launcher: ActivityResultLauncher<Uri?>) {
        Log.i(TAG, "tree_picker_launcher_cleared")
        treePickerLauncher.compareAndSet(launcher, null)
        pendingTreePick.set(null)
    }

    @JvmStatic
    fun startBackupTreePicker(operationId: String): Int = startTreePicker(operationId, PickerMode.BACKUP)

    @JvmStatic
    fun startRestoreTreePicker(operationId: String): Int = startTreePicker(operationId, PickerMode.RESTORE)

    @JvmStatic
    fun handleTreePickerResult(context: Context, uri: Uri?) {
        val pending = pendingTreePick.getAndSet(null)
        if (pending == null) {
            Log.w(TAG, "tree_picker_result_without_pending")
            return
        }
        Log.i(TAG, "tree_picker_result operation_id=${traceId(pending.operationId)} mode=${pending.mode} selected=${uri != null}")
        if (uri == null) {
            Log.i(TAG, "tree_picker_cancelled operation_id=${traceId(pending.operationId)}")
            emitTreePickCancelled(pending.operationId)
            return
        }

        val scheduled =
            NativeBridgeTaskDispatcher.execute("saf.tree_picker_result") {
                persistTreePickerResult(context.applicationContext, pending, uri)
        }
        if (!scheduled) {
            Log.w(TAG, "tree_picker_result_dispatch_rejected operation_id=${traceId(pending.operationId)}")
            emitTreePickFailedOnCurrentThread(pending.operationId, "ANDROID_SAF_BRIDGE_BUSY")
        }
    }

    @JvmStatic
    fun createDirectory(context: Context, parentUri: String, name: String): String? =
        runCatching {
            documentOperations.get().createDocument(
                context,
                documentUriFor(Uri.parse(parentUri)),
                MIME_DIR,
                name,
            )?.toString()
        }.getOrElse { error ->
            Log.w(TAG, "create_directory_failed name=${traceDisplayName(name)} error=${traceFailure(error)}")
            null
        }

    @JvmStatic
    fun writeFile(context: Context, parentUri: String, name: String, bytes: ByteArray): String? =
        runCatching {
            val operations = documentOperations.get()
            val parent = documentRefFor(Uri.parse(parentUri))
            findChild(context, parent, name, null)?.let { existing ->
                if (!deleteExistingChildForOverwrite(context, existing, name)) {
                    return null
                }
            }
            val fileUri = operations.createDocument(context, parent.documentUri, MIME_FILE, name)
                ?: return null
            operations.openOutputStream(context, fileUri, "wt")?.use { stream ->
                stream.write(bytes)
                stream.flush()
            } ?: return null
            fileUri.toString()
        }.getOrElse { error ->
            Log.w(TAG, "write_file_failed name=${traceDisplayName(name)} bytes=${bytes.size} error=${traceFailure(error)}")
            null
        }

    @JvmStatic
    fun openWriteSession(context: Context, parentUri: String, name: String): String? =
        runCatching {
            val operations = documentOperations.get()
            val parent = documentRefFor(Uri.parse(parentUri))
            findChild(context, parent, name, null)?.let { existing ->
                if (!deleteExistingChildForOverwrite(context, existing, name)) {
                    return null
                }
            }
            val fileUri = operations.createDocument(context, parent.documentUri, MIME_FILE, name)
                ?: return null
            val stream = operations.openOutputStream(context, fileUri, "wt") ?: return null
            val sessionId = UUID.randomUUID().toString()
            writeSessions[sessionId] = WriteSession(fileUri, stream)
            sessionId
        }.getOrElse { error ->
            Log.w(TAG, "open_write_session_failed name=${traceDisplayName(name)} error=${traceFailure(error)}")
            null
        }

    @JvmStatic
    @Suppress("UNUSED_PARAMETER")
    fun writeSessionChunk(_context: Context, sessionId: String, bytes: ByteArray): Boolean {
        return runCatching {
            val session = writeSessions[sessionId] ?: return false
            session.stream.write(bytes)
            true
        }.getOrElse { error ->
            Log.w(TAG, "write_session_chunk_failed session_id=${traceId(sessionId)} bytes=${bytes.size} error=${traceFailure(error)}")
            false
        }
    }

    @JvmStatic
    fun closeWriteSession(context: Context, sessionId: String, abort: Boolean): Boolean =
        runCatching {
            val session = writeSessions.remove(sessionId) ?: return false
            runCatching { session.stream.flush() }
            runCatching { session.stream.close() }
            if (abort) {
                runCatching { documentOperations.get().deleteDocument(context, session.uri) }
            }
            true
        }.getOrElse { error ->
            Log.w(TAG, "close_write_session_failed session_id=${traceId(sessionId)} abort=$abort error=${traceFailure(error)}")
            false
        }

    @JvmStatic
    fun deleteDocument(context: Context, uri: String): Boolean =
        runCatching {
            documentOperations.get().deleteDocument(context, documentUriFor(Uri.parse(uri)))
        }.getOrDefault(false)

    @JvmStatic
    fun readNamedFile(context: Context, parentUri: String, name: String): ByteArray? =
        runCatching {
            val parent = documentRefFor(Uri.parse(parentUri))
            val child =
                findChild(context, parent, name, null)
                    ?: run {
                        Log.w(TAG, "read_named_file_missing parent=${traceUri(parentUri)} name=${traceDisplayName(name)}")
                        return null
                    }
            readFile(context, child.uri.toString())
        }.getOrElse { error ->
            Log.w(TAG, "read_named_file_failed parent=${traceUri(parentUri)} name=${traceDisplayName(name)} error=${traceFailure(error)}")
            null
        }

    @JvmStatic
    fun readFile(context: Context, fileUri: String): ByteArray? =
        runCatching {
            context.contentResolver.openInputStream(documentUriFor(Uri.parse(fileUri)))?.use { stream ->
                stream.readBytes()
            }
        }.getOrNull()

    @JvmStatic
    fun openReadNamedSession(context: Context, parentUri: String, name: String): String? =
        runCatching {
            val parent = documentRefFor(Uri.parse(parentUri))
            val child = findChild(context, parent, name, null) ?: return null
            val stream = context.contentResolver.openInputStream(documentUriFor(child.uri)) ?: return null
            val sessionId = UUID.randomUUID().toString()
            readSessions[sessionId] = ReadSession(stream)
            sessionId
        }.getOrElse { error ->
            Log.w(TAG, "open_read_named_session_failed parent=${traceUri(parentUri)} name=${traceDisplayName(name)} error=${traceFailure(error)}")
            null
        }

    @JvmStatic
    @Suppress("UNUSED_PARAMETER")
    fun readSessionChunk(_context: Context, sessionId: String, maxBytes: Int): ByteArray? {
        return runCatching {
            val session = readSessions[sessionId] ?: return null
            if (maxBytes <= 0) return ByteArray(0)
            val buffer = ByteArray(maxBytes)
            val read = session.stream.read(buffer)
            if (read < 0) ByteArray(0) else if (read == buffer.size) buffer else buffer.copyOf(read)
        }.getOrElse { error ->
            Log.w(TAG, "read_session_chunk_failed session_id=${traceId(sessionId)} max_bytes=$maxBytes error=${traceFailure(error)}")
            null
        }
    }

    @JvmStatic
    @Suppress("UNUSED_PARAMETER")
    fun closeReadSession(_context: Context, sessionId: String): Boolean {
        return runCatching {
            val session = readSessions.remove(sessionId) ?: return false
            runCatching { session.stream.close() }
            true
        }.getOrElse { error ->
            Log.w(TAG, "close_read_session_failed session_id=${traceId(sessionId)} error=${traceFailure(error)}")
            false
        }
    }

    private fun startTreePicker(operationId: String, mode: PickerMode): Int {
        val launcher = treePickerLauncher.get()
        if (launcher == null) {
            Log.w(TAG, "tree_picker_launcher_missing operation_id=${traceId(operationId)} mode=$mode")
            return 1
        }
        val pending = PendingTreePick(operationId = operationId, mode = mode, launcher = launcher)
        if (!pendingTreePick.compareAndSet(null, pending)) {
            Log.w(TAG, "tree_picker_already_running operation_id=${traceId(operationId)} mode=$mode")
            return 2
        }
        return try {
            Log.i(TAG, "tree_picker_launch_scheduled operation_id=${traceId(operationId)} mode=$mode")
            mainHandler.post {
                Log.i(TAG, "tree_picker_launching operation_id=${traceId(operationId)} mode=$mode")
                runCatching { pending.launcher.launch(null) }
                    .onFailure { error ->
                        pendingTreePick.compareAndSet(pending, null)
                        Log.w(TAG, "tree_picker_launch_failed operation_id=${traceId(operationId)} error=${traceFailure(error)}")
                        emitTreePickFailed(operationId, error.message ?: error.javaClass.simpleName)
                    }
            }
            0
        } catch (error: Throwable) {
            pendingTreePick.compareAndSet(pending, null)
            Log.w(TAG, "tree_picker_launch_schedule_failed operation_id=${traceId(operationId)} error=${traceFailure(error)}")
            3
        }
    }

    private fun persistTreePickerResult(
        context: Context,
        pending: PendingTreePick,
        uri: Uri,
    ) {
        runCatching {
            val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            context.contentResolver.takePersistableUriPermission(uri, flags)
            val displayName = queryDisplayName(context, documentUriFor(uri)) ?: when (pending.mode) {
                PickerMode.BACKUP -> "Android backup folder"
                PickerMode.RESTORE -> "Android restore folder"
            }
            Log.i(TAG, "tree_picker_persisted operation_id=${traceId(pending.operationId)} display_name=${traceDisplayName(displayName)}")
            emitTreePickedOnCurrentThread(pending.operationId, uri.toString(), displayName)
        }.onFailure { error ->
            Log.w(TAG, "tree_picker_persist_failed operation_id=${traceId(pending.operationId)} error=${traceFailure(error)}")
            emitTreePickFailedOnCurrentThread(pending.operationId, error.message ?: error.javaClass.simpleName)
        }
    }

    private fun documentUriFor(uri: Uri): Uri =
        if (DocumentsContract.isTreeUri(uri)) {
            documentRefFor(uri).documentUri
        } else {
            uri
        }

    private fun documentRefFor(uri: Uri): SafDocumentRef {
        val authority = uri.authority ?: error("SAF document URI is missing authority")
        if (!DocumentsContract.isTreeUri(uri)) {
            return SafDocumentRef(
                authority = authority,
                treeUri = null,
                documentUri = uri,
                documentId = DocumentsContract.getDocumentId(uri),
            )
        }

        val treeDocumentId = DocumentsContract.getTreeDocumentId(uri)
        val documentId = runCatching { DocumentsContract.getDocumentId(uri) }.getOrNull() ?: treeDocumentId
        val treeUri = DocumentsContract.buildTreeDocumentUri(authority, treeDocumentId)
        return SafDocumentRef(
            authority = authority,
            treeUri = treeUri,
            documentUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId),
            documentId = documentId,
        )
    }

    private fun queryDisplayName(context: Context, uri: Uri): String? =
        documentOperations.get().query(
            context,
            uri,
            arrayOf(DocumentsContract.Document.COLUMN_DISPLAY_NAME),
        )?.use { cursor ->
            if (cursor.moveToFirst()) cursor.getString(0) else null
        }

    private fun deleteExistingChildForOverwrite(
        context: Context,
        existing: ChildDocument,
        name: String,
    ): Boolean {
        val deleted =
            runCatching { documentOperations.get().deleteDocument(context, existing.uri) }
                .getOrElse { error ->
                    Log.w(TAG, "overwrite_delete_failed name=${traceDisplayName(name)} error=${traceFailure(error)}")
                    return false
                }
        if (!deleted) {
            Log.w(TAG, "overwrite_delete_failed name=${traceDisplayName(name)} result=false")
        }
        return deleted
    }

    private fun findChild(context: Context, parent: SafDocumentRef, name: String, mimeType: String?): ChildDocument? =
        listChildren(context, parent).firstOrNull { child ->
            child.name == name && (mimeType == null || child.mimeType == mimeType)
        }

    private fun listChildren(context: Context, parent: SafDocumentRef): List<ChildDocument> {
        val childrenUri =
            parent.treeUri?.let { treeUri ->
                DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parent.documentId)
            } ?: DocumentsContract.buildChildDocumentsUri(parent.authority, parent.documentId)
        val children = mutableListOf<ChildDocument>()
        documentOperations.get().query(
            context,
            childrenUri,
            arrayOf(
                DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE,
            ),
        )?.use { cursor ->
            val idIndex = 0
            val nameIndex = 1
            val mimeIndex = 2
            while (cursor.moveToNext()) {
                val documentId = cursor.getString(idIndex) ?: continue
                val displayName = cursor.getString(nameIndex) ?: continue
                val mimeType = cursor.getString(mimeIndex).orEmpty()
                children += ChildDocument(
                    name = displayName,
                    mimeType = mimeType,
                    uri =
                        parent.treeUri?.let { treeUri ->
                            DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId)
                        } ?: DocumentsContract.buildDocumentUri(parent.authority, documentId),
                )
            }
        }
        return children
    }

    internal fun documentUriForTests(uri: String): String =
        documentUriFor(Uri.parse(uri)).toString()

    internal fun childDocumentsUriForTests(uri: String): String {
        val parent = documentRefFor(Uri.parse(uri))
        return (
            parent.treeUri?.let { treeUri ->
                DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, parent.documentId)
            } ?: DocumentsContract.buildChildDocumentsUri(parent.authority, parent.documentId)
        ).toString()
    }

    internal fun childDocumentUriForTests(parentUri: String, documentId: String): String {
        val parent = documentRefFor(Uri.parse(parentUri))
        return (
            parent.treeUri?.let { treeUri ->
                DocumentsContract.buildDocumentUriUsingTree(treeUri, documentId)
            } ?: DocumentsContract.buildDocumentUri(parent.authority, documentId)
        ).toString()
    }

    internal fun resetStreamSessionsForTests() {
        writeSessions.values.forEach { session -> runCatching { session.stream.close() } }
        readSessions.values.forEach { session -> runCatching { session.stream.close() } }
        writeSessions.clear()
        readSessions.clear()
        documentOperations.set(AndroidSafBackupDocumentOperations)
    }

    internal fun setDocumentOperationsForTests(operations: SafBackupDocumentOperations) {
        documentOperations.set(operations)
    }

    internal fun putWriteSessionForTests(
        sessionId: String,
        stream: OutputStream,
    ) {
        writeSessions[sessionId] = WriteSession(Uri.parse("content://chromvoid.test/$sessionId"), stream)
    }

    internal fun putReadSessionForTests(
        sessionId: String,
        stream: InputStream,
    ) {
        readSessions[sessionId] = ReadSession(stream)
    }

    internal fun hasWriteSessionForTests(sessionId: String): Boolean = writeSessions.containsKey(sessionId)

    internal fun hasReadSessionForTests(sessionId: String): Boolean = readSessions.containsKey(sessionId)

    private fun emitTreePickCancelled(operationId: String) {
        dispatchNativeEvent("saf.tree_pick_cancelled") {
            nativeOnTreePickCancelled(operationId)
        }
    }

    private fun emitTreePickFailed(operationId: String, message: String) {
        dispatchNativeEvent("saf.tree_pick_failed") {
            nativeOnTreePickFailed(operationId, message)
        }
    }

    private fun emitTreePickedOnCurrentThread(operationId: String, uri: String, displayName: String) {
        NativeRuntimeLoader.runWhenLoaded(TAG) { nativeOnTreePicked(operationId, uri, displayName) }
    }

    private fun emitTreePickFailedOnCurrentThread(operationId: String, message: String) {
        NativeRuntimeLoader.runWhenLoaded(TAG) { nativeOnTreePickFailed(operationId, message) }
    }

    private fun dispatchNativeEvent(
        owner: String,
        callback: () -> Unit,
    ) {
        if (!NativeBridgeTaskDispatcher.execute(owner) { NativeRuntimeLoader.runWhenLoaded(TAG, callback) }) {
            Log.w(TAG, "native_event_dispatch_rejected owner=$owner")
        }
    }

    private fun traceId(value: String): String = TracePrivacy.redactIdentifier(value) ?: "blank"

    private fun traceUri(value: String): String = TracePrivacy.redactUri(value) ?: "blank"

    private fun traceDisplayName(value: String): String = TracePrivacy.redactDisplayName(value) ?: "blank"

    private fun traceFailure(error: Throwable): String = TracePrivacy.failureMessage(error)

    private external fun nativeOnTreePicked(operationId: String, uri: String, displayName: String)
    private external fun nativeOnTreePickCancelled(operationId: String)
    private external fun nativeOnTreePickFailed(operationId: String, message: String)
}
