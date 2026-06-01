package com.chromvoid.app.nativebridge

import android.net.Uri
import android.os.Build
import android.provider.DocumentsContract
import androidx.test.core.app.ApplicationProvider
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.Q])
class SafBackupNativeShellTest {
    @After
    fun tearDown() {
        SafBackupNativeShell.resetStreamSessionsForTests()
    }

    @Test
    fun documentUriForTreeRootUsesSelectedFolderDocument() {
        val treeUri = "content://com.android.externalstorage.documents/tree/primary%3Abackup-1"
        val documentUri = Uri.parse(SafBackupNativeShell.documentUriForTests(treeUri))

        assertEquals("primary:backup-1", DocumentsContract.getTreeDocumentId(documentUri))
        assertEquals("primary:backup-1", DocumentsContract.getDocumentId(documentUri))
    }

    @Test
    fun documentUriForNestedTreeDocumentKeepsNestedDocumentId() {
        val chunksUri =
            "content://com.android.externalstorage.documents/tree/primary%3Abackup-1/document/primary%3Abackup-1%2Fchunks"
        val documentUri = Uri.parse(SafBackupNativeShell.documentUriForTests(chunksUri))

        assertEquals("primary:backup-1", DocumentsContract.getTreeDocumentId(documentUri))
        assertEquals("primary:backup-1/chunks", DocumentsContract.getDocumentId(documentUri))
    }

    @Test
    fun childDocumentsUriForNestedTreeDocumentUsesNestedParent() {
        val treeUri = Uri.parse("content://com.android.externalstorage.documents/tree/primary%3Abackup-1")
        val chunksUri =
            "content://com.android.externalstorage.documents/tree/primary%3Abackup-1/document/primary%3Abackup-1%2Fchunks"
        val expected =
            DocumentsContract.buildChildDocumentsUriUsingTree(treeUri, "primary:backup-1/chunks").toString()

        assertEquals(expected, SafBackupNativeShell.childDocumentsUriForTests(chunksUri))
    }

    @Test
    fun childDocumentUriForNestedTreeDocumentUsesOriginalTreeGrant() {
        val treeUri = Uri.parse("content://com.android.externalstorage.documents/tree/primary%3Abackup-1")
        val chunksUri =
            "content://com.android.externalstorage.documents/tree/primary%3Abackup-1/document/primary%3Abackup-1%2Fchunks"
        val expected =
            DocumentsContract
                .buildDocumentUriUsingTree(treeUri, "primary:backup-1/chunks/0123456789abcdef")
                .toString()

        assertEquals(
            expected,
            SafBackupNativeShell.childDocumentUriForTests(chunksUri, "primary:backup-1/chunks/0123456789abcdef"),
        )
    }

    @Test
    fun streamSessionsWriteReadAndCloseBySessionId() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val output = ByteArrayOutputStream()
        SafBackupNativeShell.putWriteSessionForTests("write-1", output)

        assertTrue(SafBackupNativeShell.writeSessionChunk(context, "write-1", byteArrayOf(1, 2, 3)))
        assertTrue(SafBackupNativeShell.writeSessionChunk(context, "write-1", byteArrayOf(4, 5)))
        assertEquals(listOf(1, 2, 3, 4, 5), output.toByteArray().map { it.toInt() })
        assertTrue(SafBackupNativeShell.closeWriteSession(context, "write-1", abort = false))
        assertFalse(SafBackupNativeShell.hasWriteSessionForTests("write-1"))

        SafBackupNativeShell.putReadSessionForTests(
            "read-1",
            ByteArrayInputStream(byteArrayOf(9, 8, 7, 6)),
        )
        assertEquals(listOf(9, 8), SafBackupNativeShell.readSessionChunk(context, "read-1", 2)?.map { it.toInt() })
        assertEquals(listOf(7, 6), SafBackupNativeShell.readSessionChunk(context, "read-1", 8)?.map { it.toInt() })
        assertEquals(emptyList<Int>(), SafBackupNativeShell.readSessionChunk(context, "read-1", 8)?.map { it.toInt() })
        assertTrue(SafBackupNativeShell.closeReadSession(context, "read-1"))
        assertFalse(SafBackupNativeShell.hasReadSessionForTests("read-1"))
    }
}
