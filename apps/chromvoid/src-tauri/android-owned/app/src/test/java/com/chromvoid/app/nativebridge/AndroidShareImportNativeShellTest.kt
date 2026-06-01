package com.chromvoid.app.nativebridge

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.webkit.WebView
import androidx.test.core.app.ApplicationProvider
import com.chromvoid.app.main.WebViewScriptEvaluator
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.TIRAMISU])
class AndroidShareImportNativeShellTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @After
    fun tearDown() {
        AndroidShareImportNativeShell.resetForTests()
    }

    @Test
    fun actionSendWithStream_stagesSafeMetadata() {
        val uri = Uri.parse("content://com.example.files/raw/report.pdf")
        val consumed = AndroidShareImportNativeShell.consumeIntent(
            context,
            Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, uri),
        )

        assertTrue(consumed)
        val handoff = AndroidShareImportNativeShell.pendingHandoffForTests()
        assertNotNull(handoff)
        assertEquals(1, handoff!!.files.size)
        assertEquals("shared-file-1", handoff.files.single().name)
        assertEquals("application/pdf", handoff.files.single().mimeType)
        assertNull(handoff.files.single().size)
    }

    @Test
    fun actionSendMultipleAndClipData_deduplicatesStreamsInOrder() {
        val first = Uri.parse("content://com.example.files/raw/first.jpg")
        val second = Uri.parse("content://com.example.files/raw/second.txt")
        val clipData = ClipData.newUri(context.contentResolver, "first", first).apply {
            addItem(ClipData.Item(second))
        }
        val consumed = AndroidShareImportNativeShell.consumeIntent(
            context,
            Intent(Intent.ACTION_SEND_MULTIPLE)
                .putParcelableArrayListExtra(Intent.EXTRA_STREAM, arrayListOf(first))
                .apply { setClipData(clipData) },
        )

        assertTrue(consumed)
        val handoff = AndroidShareImportNativeShell.pendingHandoffForTests()
        assertEquals(2, handoff?.files?.size)
        assertEquals(listOf("shared-file-1", "shared-file-2"), handoff?.files?.map { it.name })
    }

    @Test
    fun clipDataOnlyShare_stagesSession() {
        val uri = Uri.parse("content://com.example.files/raw/clip.bin")
        val consumed = AndroidShareImportNativeShell.consumeIntent(
            context,
            Intent(Intent.ACTION_SEND).apply {
                setClipData(ClipData.newUri(context.contentResolver, "clip", uri))
            },
        )

        assertTrue(consumed)
        assertEquals(1, AndroidShareImportNativeShell.pendingHandoffForTests()?.files?.size)
    }

    @Test
    fun actionSendWithDataUri_stagesSession() {
        val uri = Uri.parse("content://com.example.files/raw/from-data.bin")
        val consumed = AndroidShareImportNativeShell.consumeIntent(
            context,
            Intent(Intent.ACTION_SEND).setDataAndType(uri, "*/*"),
        )

        assertTrue(consumed)
        assertEquals(1, AndroidShareImportNativeShell.pendingHandoffForTests()?.files?.size)
    }

    @Test
    fun actionSendWithHttpDataUri_doesNotStageSession() {
        val consumed = AndroidShareImportNativeShell.consumeIntent(
            context,
            Intent(Intent.ACTION_SEND).setData(Uri.parse("https://example.com/report.pdf")),
        )

        assertFalse(consumed)
        assertNull(AndroidShareImportNativeShell.pendingHandoffForTests())
    }

    @Test
    fun textOnlyShare_doesNotStageSession() {
        val consumed = AndroidShareImportNativeShell.consumeIntent(
            context,
            Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_TEXT, "hello"),
        )

        assertFalse(consumed)
        assertNull(AndroidShareImportNativeShell.pendingHandoffForTests())
    }

    @Test
    fun newerPendingShare_replacesOlderSessionBeforeUpload() {
        AndroidShareImportNativeShell.consumeIntent(
            context,
            Intent(Intent.ACTION_SEND).putExtra(
                Intent.EXTRA_STREAM,
                Uri.parse("content://com.example.files/raw/old.pdf"),
            ),
        )
        val oldId = AndroidShareImportNativeShell.pendingHandoffForTests()?.sessionId

        AndroidShareImportNativeShell.consumeIntent(
            context,
            Intent(Intent.ACTION_SEND).putExtra(
                Intent.EXTRA_STREAM,
                Uri.parse("content://com.example.files/raw/new.pdf"),
            ),
        )

        val next = AndroidShareImportNativeShell.pendingHandoffForTests()
        assertNotEquals(oldId, next?.sessionId)
        assertEquals(1, next?.files?.size)
    }

    @Test
    fun activeShareImport_rejectsReplacementAndCancel() {
        AndroidShareImportNativeShell.consumeIntent(
            context,
            Intent(Intent.ACTION_SEND).putExtra(
                Intent.EXTRA_STREAM,
                Uri.parse("content://com.example.files/raw/active.pdf"),
            ),
        )
        val activeId = AndroidShareImportNativeShell.pendingHandoffForTests()!!.sessionId
        assertTrue(AndroidShareImportNativeShell.markPendingSessionUploadingForTests())

        val replaced = AndroidShareImportNativeShell.consumeIntent(
            context,
            Intent(Intent.ACTION_SEND).putExtra(
                Intent.EXTRA_STREAM,
                Uri.parse("content://com.example.files/raw/new.pdf"),
            ),
        )

        assertFalse(replaced)
        assertEquals(activeId, AndroidShareImportNativeShell.pendingHandoffForTests()?.sessionId)
        assertFalse(AndroidShareImportNativeShell.cancelShareSession(activeId))
    }

    @Test
    fun cancelShareSession_clearsPendingSessionOnlyForMatchingId() {
        AndroidShareImportNativeShell.consumeIntent(
            context,
            Intent(Intent.ACTION_SEND).putExtra(
                Intent.EXTRA_STREAM,
                Uri.parse("content://com.example.files/raw/report.pdf"),
            ),
        )
        val sessionId = AndroidShareImportNativeShell.pendingHandoffForTests()!!.sessionId

        assertFalse(AndroidShareImportNativeShell.cancelShareSession("missing"))
        assertNotNull(AndroidShareImportNativeShell.pendingHandoffForTests())
        assertTrue(AndroidShareImportNativeShell.cancelShareSession(sessionId))
        assertNull(AndroidShareImportNativeShell.pendingHandoffForTests())
        assertFalse(AndroidShareImportNativeShell.cancelShareSession(sessionId))
    }

    @Test
    fun dispatchPending_keepsSessionAfterSchedulingScriptDispatch() {
        val evaluator = RecordingEvaluator(result = "false")
        AndroidShareImportNativeShell.setScriptEvaluatorForTests(evaluator)
        AndroidShareImportNativeShell.consumeIntent(
            context,
            Intent(Intent.ACTION_SEND).putExtra(
                Intent.EXTRA_STREAM,
                Uri.parse("content://com.example.files/raw/report.pdf"),
            ),
        )
        val sessionId = AndroidShareImportNativeShell.pendingHandoffForTests()!!.sessionId

        assertTrue(AndroidShareImportNativeShell.dispatchPending(WebView(context)))

        assertEquals(sessionId, AndroidShareImportNativeShell.pendingHandoffForTests()?.sessionId)
    }

    @Test
    fun dispatchPending_deliversSafePayloadWithoutUriStrings() {
        val evaluator = RecordingEvaluator(result = "true")
        AndroidShareImportNativeShell.setScriptEvaluatorForTests(evaluator)
        val rawUri = "content://com.example.files/raw/private/report.pdf"
        AndroidShareImportNativeShell.consumeIntent(
            context,
            Intent(Intent.ACTION_SEND).putExtra(Intent.EXTRA_STREAM, Uri.parse(rawUri)),
        )

        assertTrue(AndroidShareImportNativeShell.dispatchPending(WebView(context)))

        val script = evaluator.lastScript.orEmpty()
        assertTrue(script.contains("__chromvoidPendingAndroidSharedFiles"))
        assertTrue(script.contains("chromvoid:android-share-files-pending"))
        assertFalse(script.contains(rawUri))
        assertFalse(script.contains("com.example.files"))
        assertFalse(script.contains("private/report.pdf"))
    }

    private class RecordingEvaluator(
        private val result: String?,
    ) : WebViewScriptEvaluator {
        var lastScript: String? = null

        override fun evaluate(
            webView: WebView,
            script: String,
            onResult: (String?) -> Unit,
        ) {
            lastScript = script
            onResult(result)
        }
    }
}
