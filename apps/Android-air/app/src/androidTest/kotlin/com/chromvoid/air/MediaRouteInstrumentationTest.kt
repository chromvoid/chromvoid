package com.chromvoid.air

import android.net.Uri
import android.util.Log
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.lifecycle.ViewModelProvider
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.mediacodec.MediaCodecUtil
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.session.SafFileDevice
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.ShellViewModel
import com.chromvoid.air.ui.files.fileRowTag
import com.chromvoid.air.ui.media.MEDIA_CLOSE_TAG
import com.chromvoid.air.ui.media.MEDIA_PLAYER_TAG
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.sin
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Route A29 against real Core. Audio: a WAV imported into the vault opens in
 * the player without starting, reaches ready with its duration read through
 * the vault reader, plays when asked and advances, and Done releases the
 * player. Video: a recording made by the device's own encoder, as its camera
 * makes one, decodes through the vault reader, stands upright, plays, and
 * seeks forward and back.
 */
@RunWith(AndroidJUnit4::class)
@androidx.annotation.OptIn(UnstableApi::class)
public class MediaRouteInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun audioPlaysFromTheVaultOnlyWhenAsked() {
        val generation = unlocked()
        val picked = File(rule.activity.cacheDir, NAME).apply { writeBytes(wav(SECONDS)) }
        try {
            runBlocking {
                val source = SafFileDevice(rule.activity).source(Uri.fromFile(picked))
                session.files.importFile(source, "/", generation) { _, _ -> }
            }
        } finally {
            picked.delete()
        }
        rule.onNodeWithTag("root-files").performClick()
        awaitNode(fileRowTag(NAME))

        rule.onNodeWithTag(fileRowTag(NAME)).performClick()
        awaitNode(MEDIA_PLAYER_TAG)
        val player = checkNotNull(currentPlayer())
        rule.waitUntil(READY_TIMEOUT_MILLIS) { onMain { player.playbackState == Player.STATE_READY } }
        onMain {
            assertFalse("nothing starts on its own", player.isPlaying)
            val duration = player.duration
            assertTrue("duration $duration read through the vault", duration in 2_900L..3_100L)
            player.play()
        }
        rule.waitUntil(READY_TIMEOUT_MILLIS) { onMain { player.currentPosition > 300 } }

        rule.onNodeWithTag(MEDIA_CLOSE_TAG).performClick()
        awaitNode(fileRowTag(NAME))
        assertEquals("closing releases the player", Player.STATE_IDLE, onMain { player.playbackState })
    }

    @Test
    public fun aDeviceRecordingPlaysUprightAndSeeksFromTheVault() {
        val generation = unlocked()
        val picked = File(rule.activity.cacheDir, VIDEO)
        val made = try {
            DeviceRecording.make(picked, VIDEO_SECONDS).also { made ->
                Log.i(LOG_TAG, "recorded $made, ${picked.length()} bytes")
                runBlocking {
                    val source = SafFileDevice(rule.activity).source(Uri.fromFile(picked))
                    session.files.importFile(source, "/", generation) { _, _ -> }
                }
            }
        } finally {
            picked.delete()
        }
        val decoder = MediaCodecUtil.getDecoderInfos(made.mime, false, false).first()
        Log.i(LOG_TAG, "decoder ${decoder.name}, hardware ${decoder.hardwareAccelerated}")
        rule.onNodeWithTag("root-files").performClick()
        awaitNode(fileRowTag(VIDEO))

        rule.onNodeWithTag(fileRowTag(VIDEO)).performClick()
        awaitNode(MEDIA_PLAYER_TAG)
        val player = checkNotNull(currentPlayer()) as ExoPlayer
        rule.waitUntil(READY_TIMEOUT_MILLIS) { onMain { player.playbackState == Player.STATE_READY } }
        onMain {
            assertFalse("nothing starts on its own", player.isPlaying)
            assertEquals(made.mime, player.videoFormat?.sampleMimeType)
            // Stored landscape with a 90° hint, as an upright phone records: it plays upright.
            val size = player.videoSize
            assertEquals("upright", made.height to made.width, size.width to size.height)
            val duration = player.duration
            assertTrue("duration $duration read through the vault", duration in VIDEO_DURATION_MILLIS)
            player.play()
        }
        rule.waitUntil(READY_TIMEOUT_MILLIS) {
            onMain { player.currentPosition > PLAYED_MILLIS && rendered(player) > PLAYED_FRAMES }
        }

        // Forward past what played: new frames from the new place.
        val beforeSeek = onMain { rendered(player) }
        onMain { player.seekTo(FORWARD_MILLIS) }
        rule.waitUntil(READY_TIMEOUT_MILLIS) {
            onMain { player.currentPosition > FORWARD_MILLIS + PLAYED_MILLIS / 2 && rendered(player) > beforeSeek }
        }
        // And back to the start.
        onMain { player.seekTo(0) }
        rule.waitUntil(READY_TIMEOUT_MILLIS) {
            onMain { player.playbackState == Player.STATE_READY && player.currentPosition < FORWARD_MILLIS }
        }
        onMain {
            val counters = checkNotNull(player.videoDecoderCounters).apply { ensureUpdated() }
            Log.i(
                LOG_TAG,
                "rendered ${counters.renderedOutputBufferCount}, dropped ${counters.droppedBufferCount}, " +
                    "skipped ${counters.skippedOutputBufferCount}",
            )
        }

        rule.onNodeWithTag(MEDIA_CLOSE_TAG).performClick()
        awaitNode(fileRowTag(VIDEO))
        assertEquals("closing releases the player", Player.STATE_IDLE, onMain { player.playbackState })
    }

    private fun rendered(player: ExoPlayer): Int =
        player.videoDecoderCounters?.run {
            ensureUpdated()
            renderedOutputBufferCount
        } ?: 0

    private fun currentPlayer(): Player? = onMain {
        ViewModelProvider(rule.activity)[ShellViewModel::class.java].files.value?.media?.value?.state?.value?.player
    }

    private fun <T> onMain(block: () -> T): T {
        var result: Result<T>? = null
        rule.runOnUiThread { result = runCatching(block) }
        return checkNotNull(result).getOrThrow()
    }

    /** A mono 16-bit tone of [seconds] seconds. */
    private fun wav(seconds: Int): ByteArray {
        val rate = 16_000
        val samples = rate * seconds
        val data = ByteBuffer.allocate(samples * 2).order(ByteOrder.LITTLE_ENDIAN)
        repeat(samples) { data.putShort((sin(2 * PI * 440 * it / rate) * 8_000).toInt().toShort()) }
        val header = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN).apply {
            put("RIFF".toByteArray())
            putInt(36 + samples * 2)
            put("WAVEfmt ".toByteArray())
            putInt(16)
            putShort(1)
            putShort(1)
            putInt(rate)
            putInt(rate * 2)
            putShort(2)
            putShort(16)
            put("data".toByteArray())
            putInt(samples * 2)
        }
        return ByteArrayOutputStream().use { out ->
            out.write(header.array())
            out.write(data.array())
            out.toByteArray()
        }
    }

    private fun unlocked(): ULong {
        awaitState { it == AirSessionState.NeedsAdministrator }
        runBlocking {
            assertEquals(AccessOutcome.Accepted, session.setUpAdministrator(ADMINISTRATOR, ADMINISTRATOR))
            assertEquals(AccessOutcome.Accepted, session.unlock(VAULT))
        }
        awaitState { it is AirSessionState.Unlocked }
        return (session.state.value as AirSessionState.Unlocked).generation
    }

    private fun awaitNode(tag: String) {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) { rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun awaitState(accept: (AirSessionState) -> Boolean) {
        val deadline = System.nanoTime() + STATE_TIMEOUT_NANOS
        while (!accept(session.state.value)) {
            check(System.nanoTime() < deadline) { "session still ${session.state.value}" }
            Thread.sleep(POLL_MILLIS)
        }
    }

    private companion object {
        const val ADMINISTRATOR = "air-instrumentation-administrator"
        const val VAULT = "air-instrumentation-vault"
        const val NAME = "Tone.wav"
        const val SECONDS = 3
        const val VIDEO = "Recording.mp4"
        const val VIDEO_SECONDS = 5
        val VIDEO_DURATION_MILLIS = 4_800L..5_200L
        const val PLAYED_MILLIS = 1_000L
        const val PLAYED_FRAMES = 20
        const val FORWARD_MILLIS = 3_000L
        const val LOG_TAG = "AirMediaRoute"
        const val NODE_TIMEOUT_MILLIS = 15_000L
        const val READY_TIMEOUT_MILLIS = 20_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
