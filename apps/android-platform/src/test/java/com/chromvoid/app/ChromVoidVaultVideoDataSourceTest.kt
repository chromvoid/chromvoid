package com.chromvoid.app

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.datasource.DataSpec
import com.chromvoid.app.nativebridge.VideoSourceReadHandleResult
import com.chromvoid.app.nativebridge.VideoSourceReadResult
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChromVoidVaultVideoDataSourceTest {
    @Test
    fun readsRequestedRangeAndCapsChunkSize() {
        val calls = mutableListOf<ReadCall>()
        val source =
            ChromVoidVaultVideoDataSource(
                video(size = ChromVoidVaultVideoDataSource.MAX_READ_BYTES + 16L),
                cursorReader { readSource, offset, length ->
                    calls.add(readCall(readSource, offset, length))
                    readOk(ByteArray(length) { 7 })
                },
            )
        val output = ByteArray(ChromVoidVaultVideoDataSource.MAX_READ_BYTES + 8)

        val opened = source.open(dataSpec(position = 4, length = output.size.toLong()))
        val firstRead = source.read(output, 0, output.size)

        assertEquals(output.size.toLong(), opened)
        assertEquals(ChromVoidVaultVideoDataSource.MAX_READ_BYTES, firstRead)
        assertEquals(ReadCall("video-token", 4, ChromVoidVaultVideoDataSource.MAX_READ_BYTES), calls.single())
    }

    @Test
    fun parsesNativeSourceTokenPayload() {
        val source =
            VideoSource.fromJson(
                """
                {
                  "streamId": "stream-1",
                  "nativeSourceToken": "native-token-1",
                  "nodeId": 41,
                  "name": "movie.mp4",
                  "mimeType": "video/mp4",
                  "size": 8,
                  "sourceRevision": 77,
                  "mediaSourceGeneration": 3,
                  "transportSessionGeneration": 12,
                  "appForegroundEpoch": 4
                }
                """.trimIndent(),
            )

        assertEquals("stream-1", source.streamId)
        assertEquals("native-token-1", source.nativeSourceToken)
        assertEquals(3L, source.mediaSourceGeneration)
        assertEquals(12L, source.transportSessionGeneration)
        assertEquals(4L, source.appForegroundEpoch)
    }

    @Test
    fun parsesLegacyTokenPayloadAsNativeSourceToken() {
        val source =
            VideoSource.fromJson(
                """
                {
                  "token": "legacy-token-1",
                  "nodeId": 41,
                  "name": "movie.mp4",
                  "mimeType": "video/mp4",
                  "size": 8,
                  "sourceRevision": 77
                }
                """.trimIndent(),
            )

        assertEquals("legacy-token-1", source.streamId)
        assertEquals("legacy-token-1", source.nativeSourceToken)
        assertEquals(1L, source.mediaSourceGeneration)
        assertEquals(null, source.transportSessionGeneration)
        assertEquals(1L, source.appForegroundEpoch)
    }

    @Test
    fun doesNotForceFixedTwoMegabyteMinimumForSmallReads() {
        val calls = mutableListOf<ReadCall>()
        val source =
            ChromVoidVaultVideoDataSource(
                video(size = ChromVoidVaultVideoDataSource.MAX_READ_BYTES + 16L),
                cursorReader { readSource, offset, length ->
                    calls.add(readCall(readSource, offset, length))
                    readOk(ByteArray(length) { 7 })
                },
            )
        val output = ByteArray(1)

        source.open(dataSpec(position = 0, length = C.LENGTH_UNSET.toLong()))

        assertEquals(1, source.read(output, 0, output.size))
        assertEquals(ReadCall("video-token", 0, 1), calls.single())
    }

    @Test
    fun usesCursorBackpressureForSmallReads() {
        val bytes = ByteArray(16) { it.toByte() }
        val calls = mutableListOf<ReadCall>()
        val source =
            ChromVoidVaultVideoDataSource(
                video(size = bytes.size.toLong()),
                cursorReader { readSource, offset, length ->
                    calls.add(readCall(readSource, offset, length))
                    readOk(bytes.copyOfRange(offset.toInt(), (offset + length).toInt()))
                },
            )
        val output = ByteArray(2)

        source.open(dataSpec(position = 0, length = C.LENGTH_UNSET.toLong()))

        assertEquals(1, source.read(output, 0, 1))
        assertEquals(1, source.read(output, 1, 1))
        assertArrayEquals(byteArrayOf(0, 1), output)
        assertEquals(
            listOf(ReadCall("video-token", 0, 1), ReadCall("video-token", 1, 1)),
            calls,
        )
    }

    @Test
    fun acceptsShortNativeReadsBeforeSourceEnd() {
        val bytes = byteArrayOf(1, 2, 3, 4)
        val calls = mutableListOf<ReadCall>()
        val source =
            ChromVoidVaultVideoDataSource(
                video(size = bytes.size.toLong()),
                cursorReader { readSource, offset, length ->
                    calls.add(readCall(readSource, offset, length))
                    val start = offset.toInt()
                    readOk(bytes.copyOfRange(start, minOf(start + 1, bytes.size)))
                },
            )
        val output = ByteArray(4)

        source.open(dataSpec(position = 0, length = C.LENGTH_UNSET.toLong()))

        assertEquals(1, source.read(output, 0, output.size))
        assertEquals(1, source.read(output, 1, output.size - 1))
        assertEquals(1, source.read(output, 2, output.size - 2))
        assertEquals(1, source.read(output, 3, output.size - 3))
        assertEquals(C.RESULT_END_OF_INPUT, source.read(output, 0, output.size))
        assertArrayEquals(bytes, output)
        assertEquals(
            listOf(
                ReadCall("video-token", 0, 4),
                ReadCall("video-token", 1, 3),
                ReadCall("video-token", 2, 2),
                ReadCall("video-token", 3, 1),
            ),
            calls,
        )
    }

    @Test
    fun returnsEndOfInputOnlyAtSourceEnd() {
        val source =
            ChromVoidVaultVideoDataSource(
                video(size = 4),
                cursorReader { _, _, _ -> readOk(byteArrayOf(1, 2)) },
            )
        val output = ByteArray(4)

        source.open(dataSpec(position = 2, length = C.LENGTH_UNSET.toLong()))

        assertEquals(2, source.read(output, 0, output.size))
        assertEquals(C.RESULT_END_OF_INPUT, source.read(output, 0, output.size))
        assertArrayEquals(byteArrayOf(1, 2, 0, 0), output)
    }

    @Test
    fun throwsStableErrorCodeForNativeReadFailure() {
        val source =
            ChromVoidVaultVideoDataSource(
                video(),
                cursorReader { _, _, _ -> VideoSourceReadResult(bytes = null, errorCode = null) },
            )

        source.open(dataSpec(position = 0, length = 4))

        try {
            source.read(ByteArray(4), 0, 4)
            fail("read should fail")
        } catch (error: ChromVoidVaultVideoDataSource.VideoSourceIOException) {
            assertEquals(ChromVoidVaultVideoDataSource.ERR_SOURCE_READ, error.code)
        }
    }

    @Test
    fun throwsTypedNativeErrorCodeWhenBridgeReturnsOne() {
        val source =
            ChromVoidVaultVideoDataSource(
                video(),
                cursorReader { _, _, _ -> readError("ERR_NATIVE_VIDEO_SOURCE_STALE") },
            )

        source.open(dataSpec(position = 0, length = 4))

        try {
            source.read(ByteArray(4), 0, 4)
            fail("read should fail")
        } catch (error: ChromVoidVaultVideoDataSource.VideoSourceIOException) {
            assertEquals("ERR_NATIVE_VIDEO_SOURCE_STALE", error.code)
        }
    }

    @Test
    fun rejectsUnsatisfiableOpenRange() {
        val source =
            ChromVoidVaultVideoDataSource(
                video(size = 8),
                cursorReader { _, _, _ -> readError(ChromVoidVaultVideoDataSource.ERR_SOURCE_READ) },
            )

        try {
            source.open(dataSpec(position = 9, length = 1))
            fail("open should fail")
        } catch (error: ChromVoidVaultVideoDataSource.VideoSourceIOException) {
            assertEquals(ChromVoidVaultVideoDataSource.ERR_RANGE_INVALID, error.code)
        }
    }

    @Test
    fun passesSourceIdentityToNativeReader() {
        val calls = mutableListOf<ReadCall>()
        val sourceIdentity =
            video(size = 1)
                .copy(
                    sourceRevision = 88L,
                    mediaSourceGeneration = 9L,
                    transportSessionGeneration = null,
                    appForegroundEpoch = 5L,
                )
        val source =
            ChromVoidVaultVideoDataSource(
                sourceIdentity,
                cursorReader { readSource, offset, length ->
                    calls.add(readCall(readSource, offset, length))
                    readOk(ByteArray(length) { 7 })
                },
            )

        source.open(dataSpec(position = 0, length = 1))

        assertEquals(1, source.read(ByteArray(1), 0, 1))
        assertEquals(
            ReadCall(
                token = "video-token",
                offset = 0,
                length = 1,
                sourceRevision = 88L,
                mediaSourceGeneration = 9L,
                transportSessionGeneration = null,
                appForegroundEpoch = 5L,
            ),
            calls.single(),
        )
    }

    @Test
    fun closesNativeCursorExactlyOnce() {
        val closes = mutableListOf<Long>()
        val source =
            ChromVoidVaultVideoDataSource(
                video(),
                cursorReader(
                    onRead = { _, _, length -> readOk(ByteArray(length) { 7 }) },
                    onClose = { _, handle -> closes.add(handle) },
                ),
            )

        source.open(dataSpec(position = 0, length = 4))
        source.close()
        source.close()

        assertEquals(listOf(1L), closes)
    }

    @Test
    fun closesNativeCursorAfterReadError() {
        val closes = mutableListOf<Long>()
        val source =
            ChromVoidVaultVideoDataSource(
                video(),
                cursorReader(
                    onRead = { _, _, _ -> readError("ERR_NATIVE_VIDEO_PROVIDER_TIMEOUT") },
                    onClose = { _, handle -> closes.add(handle) },
                ),
            )

        source.open(dataSpec(position = 0, length = 4))
        try {
            source.read(ByteArray(4), 0, 4)
            fail("read should fail")
        } catch (_: ChromVoidVaultVideoDataSource.VideoSourceIOException) {
            source.close()
        }

        assertEquals(listOf(1L), closes)
    }

    private data class ReadCall(
        val token: String,
        val offset: Long,
        val length: Int,
        val sourceRevision: Long = 77L,
        val mediaSourceGeneration: Long = 3L,
        val transportSessionGeneration: Long? = 12L,
        val appForegroundEpoch: Long = 4L,
    )

    private fun readCall(
        source: VideoSource,
        offset: Long,
        length: Int,
    ): ReadCall =
        ReadCall(
            token = source.nativeSourceToken,
            offset = offset,
            length = length,
            sourceRevision = source.sourceRevision,
            mediaSourceGeneration = source.mediaSourceGeneration,
            transportSessionGeneration = source.transportSessionGeneration,
            appForegroundEpoch = source.appForegroundEpoch,
        )

    private fun cursorReader(
        handle: Long = 1L,
        onOpen: (VideoSource, Long, Long) -> VideoSourceReadHandleResult = { _, _, _ ->
            VideoSourceReadHandleResult(handle = handle, errorCode = null)
        },
        onClose: (VideoSource, Long) -> Unit = { _, _ -> },
        onRead: (VideoSource, Long, Int) -> VideoSourceReadResult,
    ): ChromVoidVaultVideoDataSource.VideoSourceReader =
        object : ChromVoidVaultVideoDataSource.VideoSourceReader {
            private var cursorOffset = 0L

            override fun open(
                source: VideoSource,
                offset: Long,
                length: Long,
            ): VideoSourceReadHandleResult {
                cursorOffset = offset
                return onOpen(source, offset, length)
            }

            override fun read(
                source: VideoSource,
                handle: Long,
                maxLength: Int,
            ): VideoSourceReadResult {
                val result = onRead(source, cursorOffset, maxLength)
                result.bytes?.let { cursorOffset += it.size }
                return result
            }

            override fun close(
                source: VideoSource,
                handle: Long,
            ) = onClose(source, handle)
        }

    private fun dataSpec(
        position: Long,
        length: Long,
    ): DataSpec =
        DataSpec.Builder()
            .setUri(Uri.parse("chromvoid-video://test"))
            .setPosition(position)
            .setLength(length)
            .build()

    private fun video(size: Long = 8L): VideoSource =
        VideoSource(
            streamId = "video-stream",
            nativeSourceToken = "video-token",
            nodeId = 41L,
            name = "movie.mp4",
            mimeType = "video/mp4",
            size = size,
            sourceRevision = 77L,
            mediaSourceGeneration = 3L,
            transportSessionGeneration = 12L,
            appForegroundEpoch = 4L,
        )

    private fun readOk(bytes: ByteArray): VideoSourceReadResult =
        VideoSourceReadResult(bytes = bytes, errorCode = null)

    private fun readError(code: String): VideoSourceReadResult =
        VideoSourceReadResult(bytes = null, errorCode = code)
}
