package com.chromvoid.app

import android.content.Intent
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChromVoidVideoActivityTest {
    @Test
    fun backgroundStopReleasesPlaybackAndFinishes() {
        val controller =
            Robolectric.buildActivity(ChromVoidVideoActivity::class.java, sourceIntent()).setup()
        val activity = controller.get()
        assertFalse(activity.isFinishing)

        controller.pause().stop()

        assertTrue(activity.isFinishing)
    }

    @Test
    fun stopWhileAlreadyFinishingKeepsFinishingState() {
        val controller =
            Robolectric.buildActivity(ChromVoidVideoActivity::class.java, sourceIntent()).setup()
        val activity = controller.get()
        activity.finish()

        controller.pause().stop()

        assertTrue(activity.isFinishing)
    }

    @Test
    fun missingSourceJsonFinishesWithoutBackgroundRelease() {
        val controller = Robolectric.buildActivity(ChromVoidVideoActivity::class.java, Intent()).setup()
        val activity = controller.get()

        assertTrue(activity.isFinishing)
    }

    private fun sourceIntent(): Intent =
        Intent().putExtra(
            ChromVoidVideoActivity.EXTRA_SOURCE_JSON,
            """
            {
              "nativeSourceToken": "test-native-source-token",
              "streamId": "test-stream-id",
              "nodeId": 7,
              "name": "clip.mp4",
              "mimeType": "video/mp4",
              "size": 1024,
              "sourceRevision": 3,
              "mediaSourceGeneration": 2,
              "appForegroundEpoch": 1
            }
            """.trimIndent(),
        )
}
