package com.chromvoid.app.nativebridge

import android.content.Context
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ShareFileNativeShellTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @After
    fun tearDown() {
        resetFileProviderCache()
    }

    @Test
    fun createChooserIntent_wrapsShareIntentWithFileProviderUrisAndFlags() {
        val firstFile =
            File(context.cacheDir.resolve("chromvoid-share"), "report.pdf").apply {
                parentFile?.mkdirs()
                writeText("pdf")
            }
        val secondFile =
            File(context.cacheDir.resolve("chromvoid-share"), "photo.jpg").apply {
                parentFile?.mkdirs()
                writeText("jpg")
            }

        val shareIntent =
            ShareFileNativeShell.createShareIntent(
                context,
                arrayOf(firstFile.absolutePath, secondFile.absolutePath),
                arrayOf("application/pdf", "image/jpeg"),
            )
        val chooserIntent = ShareFileNativeShell.createChooserIntent(context, shareIntent)

        assertEquals(Intent.ACTION_CHOOSER, chooserIntent.action)
        assertTrue(chooserIntent.flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)
        assertTrue(chooserIntent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        assertNotNull(chooserIntent.clipData)

        val wrappedIntent = chooserIntent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
        assertNotNull(wrappedIntent)
        assertEquals(Intent.ACTION_SEND_MULTIPLE, wrappedIntent?.action)
        assertEquals("*/*", wrappedIntent?.type)
        assertTrue(wrappedIntent!!.flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)
        assertTrue(wrappedIntent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        assertNotNull(wrappedIntent.clipData)

        val sharedUris =
            wrappedIntent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, android.net.Uri::class.java)
        assertEquals(2, sharedUris?.size)
        assertEquals("${context.packageName}.fileprovider", sharedUris?.firstOrNull()?.authority)
    }

    @Test
    fun createChooserIntent_wrapsSingleMarkdownShareWithMarkdownMimeAndExtension() {
        val noteFile =
            File(context.cacheDir.resolve("chromvoid-share"), "1700000000_abcd.md").apply {
                parentFile?.mkdirs()
                writeText("# Note")
            }

        val shareIntent =
            ShareFileNativeShell.createShareIntent(
                context,
                arrayOf(noteFile.absolutePath),
                arrayOf("text/markdown"),
            )
        val chooserIntent = ShareFileNativeShell.createChooserIntent(context, shareIntent)

        assertEquals(Intent.ACTION_CHOOSER, chooserIntent.action)
        assertTrue(chooserIntent.flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)
        assertTrue(chooserIntent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        assertNotNull(chooserIntent.clipData)

        val wrappedIntent = chooserIntent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
        assertNotNull(wrappedIntent)
        assertEquals(Intent.ACTION_SEND, wrappedIntent?.action)
        assertEquals("text/markdown", wrappedIntent?.type)
        assertTrue(wrappedIntent!!.flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)
        assertTrue(wrappedIntent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        assertNotNull(wrappedIntent.clipData)

        val sharedUri = wrappedIntent.getParcelableExtra(Intent.EXTRA_STREAM, android.net.Uri::class.java)
        assertNotNull(sharedUri)
        assertEquals("${context.packageName}.fileprovider", sharedUri?.authority)
        assertTrue(sharedUri?.lastPathSegment?.endsWith(".md") == true)
    }

    @Test
    fun createShareIntent_acceptsFilesFromExternalShareCacheDirectory() {
        val externalCacheDir = requireNotNull(context.externalCacheDir)
        val file =
            File(externalCacheDir.resolve("chromvoid-share"), "1700000000_abcd.md").apply {
                parentFile?.mkdirs()
                writeText("# Note")
            }

        val shareIntent =
            ShareFileNativeShell.createShareIntent(
                context,
                arrayOf(file.absolutePath),
                arrayOf("text/markdown"),
            )

        val sharedUri = shareIntent.getParcelableExtra(Intent.EXTRA_STREAM, android.net.Uri::class.java)
        assertNotNull(sharedUri)
        assertEquals("${context.packageName}.fileprovider", sharedUri?.authority)
        assertTrue(sharedUri?.lastPathSegment?.endsWith(".md") == true)
    }

    @Test
    fun createShareIntent_rejectsFilesOutsideShareStagingDirectory() {
        val otherFile =
            File(context.cacheDir.resolve("other-share"), "report.pdf").apply {
                parentFile?.mkdirs()
                writeText("pdf")
            }

        val error =
            assertThrows(IllegalArgumentException::class.java) {
                ShareFileNativeShell.createShareIntent(
                    context,
                    arrayOf(otherFile.absolutePath),
                    arrayOf("application/pdf"),
                )
            }

        assertEquals("File is outside the allowed staging directory", error.message)
    }
}
