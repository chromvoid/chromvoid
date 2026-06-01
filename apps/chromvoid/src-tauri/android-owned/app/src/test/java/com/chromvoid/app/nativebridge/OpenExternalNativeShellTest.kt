package com.chromvoid.app.nativebridge

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.io.File

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class OpenExternalNativeShellTest {
    private val context: Context = ApplicationProvider.getApplicationContext()

    @After
    fun tearDown() {
        resetFileProviderCache()
    }

    @Test
    fun createChooserIntent_wrapsViewIntentWithFileProviderUriAndFlags() {
        val file =
            File(context.cacheDir.resolve("chromvoid-open"), "report.pdf").apply {
                parentFile?.mkdirs()
                writeText("pdf")
            }

        val chooserIntent = OpenExternalNativeShell.createChooserIntent(context, file.absolutePath, "application/pdf")
        assertEquals(Intent.ACTION_CHOOSER, chooserIntent.action)
        assertTrue(chooserIntent.flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)
        assertTrue(chooserIntent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        assertNotNull(chooserIntent.clipData)

        val viewIntent = chooserIntent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
        assertNotNull(viewIntent)
        assertEquals(Intent.ACTION_VIEW, viewIntent?.action)
        assertEquals("${context.packageName}.fileprovider", viewIntent?.data?.authority)
        assertEquals("application/pdf", viewIntent?.type)
        assertTrue(viewIntent!!.flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)
        assertTrue(viewIntent.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)
        assertTrue(viewIntent.categories?.contains(Intent.CATEGORY_DEFAULT) == true)
        assertNotNull(viewIntent.clipData)
    }

    @Test
    fun openFileInSystem_startsChooserWithOpenAlternatesAfterPreparingFile() {
        val file =
            File(context.cacheDir.resolve("chromvoid-open"), "report.pdf").apply {
                parentFile?.mkdirs()
                writeText("pdf")
            }
        val recordingContext = RecordingContext(context)

        val error =
            OpenExternalNativeShell.openFileInSystem(
                recordingContext,
                file.absolutePath,
                "application/pdf",
            )

        assertNull(error)
        val chooserIntent = recordingContext.startedIntent
        assertNotNull(chooserIntent)
        assertEquals(Intent.ACTION_CHOOSER, chooserIntent?.action)
        assertTrue(chooserIntent!!.flags and Intent.FLAG_ACTIVITY_NEW_TASK != 0)

        val viewIntent = chooserIntent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
        assertNotNull(viewIntent)
        assertEquals(Intent.ACTION_VIEW, viewIntent?.action)
        assertEquals("application/pdf", viewIntent?.type)
        assertTrue(viewIntent!!.categories?.contains(Intent.CATEGORY_DEFAULT) == true)

        val alternateIntents =
            chooserIntent.getParcelableArrayExtra(Intent.EXTRA_ALTERNATE_INTENTS, Intent::class.java)
        assertNotNull(alternateIntents)
        assertEquals(2, alternateIntents?.size)

        val wildcardViewIntent = alternateIntents!![0]
        assertEquals(Intent.ACTION_VIEW, wildcardViewIntent.action)
        assertEquals("*/*", wildcardViewIntent.type)
        assertEquals(viewIntent.data, wildcardViewIntent.data)
        assertTrue(wildcardViewIntent.categories?.contains(Intent.CATEGORY_DEFAULT) == true)
        assertNotNull(wildcardViewIntent.clipData)

        val typelessViewIntent = alternateIntents[1]
        assertEquals(Intent.ACTION_VIEW, typelessViewIntent.action)
        assertNull(typelessViewIntent.type)
        assertEquals(viewIntent.data, typelessViewIntent.data)
        assertTrue(typelessViewIntent.categories?.contains(Intent.CATEGORY_DEFAULT) == true)
        assertNotNull(typelessViewIntent.clipData)
    }

    @Test
    fun openFileInSystem_suppressesActivityNotFoundWhenSystemChooserCannotLaunch() {
        val file =
            File(context.cacheDir.resolve("chromvoid-open"), "opaque.bin").apply {
                parentFile?.mkdirs()
                writeText("data")
            }
        val recordingContext = ThrowingStartActivityContext(context, failuresBeforeSuccess = 1)

        val error =
            OpenExternalNativeShell.openFileInSystem(
                recordingContext,
                file.absolutePath,
                "application/octet-stream",
            )

        assertNull(error)
        assertEquals(1, recordingContext.startedIntents.size)
        assertEquals(Intent.ACTION_CHOOSER, recordingContext.startedIntents.single().action)
    }

    @Test
    fun openFileInSystem_acceptsFilesFromExternalOpenCacheDirectory() {
        val externalCacheDir = requireNotNull(context.externalCacheDir)
        val file =
            File(externalCacheDir.resolve("chromvoid-open"), "1780296744_4.bin").apply {
                parentFile?.mkdirs()
                writeText("data")
            }
        val recordingContext = RecordingContext(context)

        val error =
            OpenExternalNativeShell.openFileInSystem(
                recordingContext,
                file.absolutePath,
                "application/octet-stream",
            )

        assertNull(error)
        val chooserIntent = recordingContext.startedIntent
        assertNotNull(chooserIntent)
        val viewIntent = chooserIntent?.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
        assertEquals("${context.packageName}.fileprovider", viewIntent?.data?.authority)
    }

    @Test
    fun createViewIntent_rejectsFilesOutsideOpenStagingDirectory() {
        val otherFile =
            File(context.cacheDir.resolve("other-open"), "report.pdf").apply {
                parentFile?.mkdirs()
                writeText("pdf")
            }

        val error =
            assertThrows(IllegalArgumentException::class.java) {
                OpenExternalNativeShell.createViewIntent(context, otherFile.absolutePath, "application/pdf")
            }

        assertEquals("File is outside the allowed staging directory", error.message)
    }

    private class RecordingContext(
        base: Context,
    ) : ContextWrapper(base) {
        var startedIntent: Intent? = null

        override fun startActivity(intent: Intent) {
            startedIntent = intent
        }
    }

    private class ThrowingStartActivityContext(
        base: Context,
        private var failuresBeforeSuccess: Int,
    ) : ContextWrapper(base) {
        val startedIntents = mutableListOf<Intent>()

        override fun startActivity(intent: Intent) {
            startedIntents.add(intent)
            if (failuresBeforeSuccess > 0) {
                failuresBeforeSuccess -= 1
                throw ActivityNotFoundException("No matching activity")
            }
        }
    }
}
