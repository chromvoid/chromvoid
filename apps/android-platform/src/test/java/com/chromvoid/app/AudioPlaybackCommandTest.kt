package com.chromvoid.app

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AudioPlaybackCommandTest {
    @Test
    fun parsesStartSessionWithPreparedSourceToken() {
        val command = AudioPlaybackCommand.fromJson(startSessionJson(index = 0))

        assertTrue(command is AudioPlaybackCommand.StartSession)
        val start = command as AudioPlaybackCommand.StartSession
        assertEquals("native-1", start.nativeSessionId)
        assertEquals(1, start.tracks.size)
        assertEquals(41L, start.tracks[0].trackId)
        assertEquals("ChromVoid audio", start.tracks[0].systemTitle)
        assertEquals("audio/mpeg", start.tracks[0].mimeType)
        assertEquals(1234L, start.tracks[0].size)
        assertEquals(77L, start.tracks[0].sourceRevision)
        assertEquals("opaque-token", start.tracks[0].sourceToken)
        assertTrue(start.autoplay)
        assertNull(start.dispatchId)
    }

    @Test
    fun parsesOptionalDispatchIdWithoutChangingCommandSchema() {
        val command =
            AudioPlaybackCommand.fromJson(
                JSONObject(startSessionJson(index = 0))
                    .put("dispatchId", "dispatch-1")
                    .toString(),
            )

        assertTrue(command is AudioPlaybackCommand.StartSession)
        assertEquals("dispatch-1", (command as AudioPlaybackCommand.StartSession).dispatchId)
    }

    @Test
    fun preservesBackwardCompatibilityForCommandsWithoutDispatchId() {
        val command =
            AudioPlaybackCommand.fromJson(
                JSONObject()
                    .put("command", "pause")
                    .put("nativeSessionId", "native-1")
                    .toString(),
            )

        assertTrue(command is AudioPlaybackCommand.Pause)
        assertNull((command as AudioPlaybackCommand.Pause).dispatchId)
    }

    @Test
    fun extractsDispatchIdFromInvalidCommandPayload() {
        val dispatchId =
            AudioPlaybackCommand.dispatchIdFromJson(
                JSONObject()
                    .put("dispatchId", "dispatch-1")
                    .put("command", "unknown")
                    .toString(),
            )

        assertEquals("dispatch-1", dispatchId)
    }

    @Test
    fun rejectsMalformedStartSessionWithoutTokenData() {
        val command =
            AudioPlaybackCommand.fromJson(
                startSessionJson(track = validTrack().apply { remove("sourceToken") }),
            )

        assertNull(command)
    }

    @Test
    fun rejectsMalformedStartSessionWithBlankSourceToken() {
        val command =
            AudioPlaybackCommand.fromJson(
                startSessionJson(track = validTrack().put("sourceToken", "   ")),
            )

        assertNull(command)
    }

    @Test
    fun rejectsInvalidIndexAndSeekPosition() {
        assertNull(AudioPlaybackCommand.fromJson(startSessionJson(index = 2)))
        assertNull(
            AudioPlaybackCommand.fromJson(
                JSONObject()
                    .put("command", "seekTo")
                    .put("nativeSessionId", "native-1")
                    .put("positionMs", -1)
                    .toString(),
            ),
        )
    }

    @Test
    fun parsesSessionBoundCommands() {
        val seek =
            AudioPlaybackCommand.fromJson(
                JSONObject()
                    .put("command", "seekTo")
                    .put("nativeSessionId", "native-1")
                    .put("positionMs", 42000)
                    .toString(),
            )

        assertNotNull(seek)
        assertTrue(seek is AudioPlaybackCommand.SeekTo)
        assertEquals(42000L, (seek as AudioPlaybackCommand.SeekTo).positionMs)
    }

    @Test
    fun diagnosticsRedactsIdentifiersWithLengthAndHash() {
        assertNull(AudioPlaybackDiagnostics.redactIdentifier(null))
        assertNull(AudioPlaybackDiagnostics.redactIdentifier("   "))

        val redacted = AudioPlaybackDiagnostics.redactIdentifier("native-session-42")

        assertEquals(redacted, AudioPlaybackDiagnostics.redactIdentifier("native-session-42"))
        assertTrue(redacted!!.startsWith("17:"))
        assertFalse(redacted.contains("session"))
        assertFalse(redacted.contains("42"))
    }

    @Test
    fun diagnosticsCommandNamesMatchCommandPayloadStrings() {
        val track = audioTrack()
        val commands =
            listOf(
                AudioPlaybackCommand.StartSession(
                    "native-1",
                    listOf(track),
                    index = 0,
                    autoplay = true,
                ) to "startSession",
                AudioPlaybackCommand.Play("native-1") to "play",
                AudioPlaybackCommand.Pause("native-1") to "pause",
                AudioPlaybackCommand.Stop("native-1") to "stop",
                AudioPlaybackCommand.NextTrack("native-1") to "nextTrack",
                AudioPlaybackCommand.PreviousTrack("native-1") to "previousTrack",
                AudioPlaybackCommand.SeekTo("native-1", 42_000L) to "seekTo",
                AudioPlaybackCommand.SelectTrack("native-1", 0) to "selectTrack",
            )

        commands.forEach { (command, expected) ->
            assertEquals(expected, AudioPlaybackDiagnostics.commandName(command))
        }
    }

    @Test
    fun diagnosticsTrackMetadataContainsOnlyPublicTraceIds() {
        val metadata = AudioPlaybackDiagnostics.trackMeta(audioTrack())

        assertEquals(setOf("trackId", "sourceRevision"), metadata.keys)
        assertEquals(41L, metadata["trackId"])
        assertEquals(77L, metadata["sourceRevision"])
        assertFalse(metadata.toString().contains("opaque-token"))
    }

    private fun startSessionJson(
        index: Int = 0,
        track: JSONObject = validTrack(),
    ): String =
        JSONObject()
            .put("command", "startSession")
            .put("nativeSessionId", "native-1")
            .put("tracks", JSONArray().put(track))
            .put("index", index)
            .put("autoplay", true)
            .toString()

    private fun validTrack(): JSONObject =
        JSONObject()
            .put("trackId", 41)
            .put("systemTitle", "ChromVoid audio")
            .put("mimeType", "audio/mpeg")
            .put("size", 1234)
            .put("sourceRevision", 77)
            .put("sourceToken", "opaque-token")

    private fun audioTrack(): AudioPlaybackCommand.AudioTrack =
        AudioPlaybackCommand.AudioTrack(
            trackId = 41L,
            systemTitle = "ChromVoid audio",
            mimeType = "audio/mpeg",
            size = 1234L,
            sourceRevision = 77L,
            sourceToken = "opaque-token",
        )
}
