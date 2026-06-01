package com.chromvoid.app

import android.content.Intent
import android.net.Uri
import android.os.Build
import com.chromvoid.app.nativebridge.AndroidShareImportNativeShell
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [Build.VERSION_CODES.TIRAMISU])
class ShareImportActivityTest {
    @After
    fun tearDown() {
        AndroidShareImportNativeShell.resetForTests()
    }

    @Test
    fun actionSendWithStream_stagesPendingHandoffAndStartsMainActivity() {
        val activity = launchShareProxy(
            Intent(Intent.ACTION_SEND)
                .putExtra(
                    Intent.EXTRA_STREAM,
                    Uri.parse("content://com.example.files/raw/report.pdf"),
                ),
        )

        val handoff = AndroidShareImportNativeShell.pendingHandoffForTests()
        assertNotNull(handoff)
        assertEquals(1, handoff!!.files.size)
        assertStartsMainActivityAndFinishes(activity)
    }

    @Test
    fun textOnlyActionSend_doesNotStageHandoffButStillStartsMainActivity() {
        val activity = launchShareProxy(
            Intent(Intent.ACTION_SEND)
                .putExtra(Intent.EXTRA_TEXT, "hello"),
        )

        assertNull(AndroidShareImportNativeShell.pendingHandoffForTests())
        assertStartsMainActivityAndFinishes(activity)
    }

    @Test
    fun actionSendMultiple_stagesAllStreamUrisInOneSession() {
        val activity = launchShareProxy(
            Intent(Intent.ACTION_SEND_MULTIPLE)
                .putParcelableArrayListExtra(
                    Intent.EXTRA_STREAM,
                    arrayListOf(
                        Uri.parse("content://com.example.files/raw/one.jpg"),
                        Uri.parse("content://com.example.files/raw/two.jpg"),
                    ),
                ),
        )

        val handoff = AndroidShareImportNativeShell.pendingHandoffForTests()
        assertNotNull(handoff)
        assertEquals(2, handoff!!.files.size)
        assertStartsMainActivityAndFinishes(activity)
    }

    private fun launchShareProxy(intent: Intent): ShareImportActivity =
        Robolectric.buildActivity(ShareImportActivity::class.java, intent)
            .setup()
            .get()

    private fun assertStartsMainActivityAndFinishes(activity: ShareImportActivity) {
        val shadow = shadowOf(activity)
        val started = shadow.nextStartedActivity
        assertNotNull(started)
        assertEquals(MainActivity::class.java.name, started.component?.className)
        assertEquals(Intent.ACTION_MAIN, started.action)
        assertTrue(started.categories.orEmpty().contains(Intent.CATEGORY_LAUNCHER))
        assertTrue(started.flags and Intent.FLAG_ACTIVITY_CLEAR_TOP != 0)
        assertTrue(started.flags and Intent.FLAG_ACTIVITY_SINGLE_TOP != 0)
        assertTrue(activity.isFinishing)
    }
}
