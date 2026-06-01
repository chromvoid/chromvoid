package com.chromvoid.app

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.datasource.DataSpec
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
            ChromVoidVaultVideoDataSource(video(size = ChromVoidVaultVideoDataSource.MAX_READ_BYTES + 16L)) { token, offset, length ->
                calls.add(ReadCall(token, offset, length))
                ByteArray(length) { 7 }
            }
        val output = ByteArray(ChromVoidVaultVideoDataSource.MAX_READ_BYTES + 8)

        val opened = source.open(dataSpec(position = 4, length = output.size.toLong()))
        val firstRead = source.read(output, 0, output.size)

        assertEquals(output.size.toLong(), opened)
        assertEquals(ChromVoidVaultVideoDataSource.MAX_READ_BYTES, firstRead)
        assertEquals(ReadCall("video-token", 4, ChromVoidVaultVideoDataSource.MAX_READ_BYTES), calls.single())
    }

    @Test
    fun prefetchesFullVideoRangeForSmallExoReads() {
        val calls = mutableListOf<ReadCall>()
        val source =
            ChromVoidVaultVideoDataSource(video(size = ChromVoidVaultVideoDataSource.MAX_READ_BYTES + 16L)) { token, offset, length ->
                calls.add(ReadCall(token, offset, length))
                ByteArray(length) { 7 }
            }
        val output = ByteArray(1)

        source.open(dataSpec(position = 0, length = C.LENGTH_UNSET.toLong()))

        assertEquals(1, source.read(output, 0, output.size))
        assertEquals(ReadCall("video-token", 0, ChromVoidVaultVideoDataSource.MAX_READ_BYTES), calls.single())
    }

    @Test
    fun buffersSmallReadsIntoSingleNativeRange() {
        val bytes = ByteArray(16) { it.toByte() }
        val calls = mutableListOf<ReadCall>()
        val source =
            ChromVoidVaultVideoDataSource(video(size = bytes.size.toLong())) { token, offset, length ->
                calls.add(ReadCall(token, offset, length))
                bytes.copyOfRange(offset.toInt(), (offset + length).toInt())
            }
        val output = ByteArray(2)

        source.open(dataSpec(position = 0, length = C.LENGTH_UNSET.toLong()))

        assertEquals(1, source.read(output, 0, 1))
        assertEquals(1, source.read(output, 1, 1))
        assertArrayEquals(byteArrayOf(0, 1), output)
        assertEquals(listOf(ReadCall("video-token", 0, bytes.size)), calls)
    }

    @Test
    fun acceptsShortNativeReadsBeforeSourceEnd() {
        val bytes = byteArrayOf(1, 2, 3, 4)
        val calls = mutableListOf<ReadCall>()
        val source =
            ChromVoidVaultVideoDataSource(video(size = bytes.size.toLong())) { token, offset, length ->
                calls.add(ReadCall(token, offset, length))
                val start = offset.toInt()
                bytes.copyOfRange(start, minOf(start + 1, bytes.size))
            }
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
                ReadCall("video-token", 0, bytes.size),
                ReadCall("video-token", 1, bytes.size - 1),
                ReadCall("video-token", 2, bytes.size - 2),
                ReadCall("video-token", 3, bytes.size - 3),
            ),
            calls,
        )
    }

    @Test
    fun returnsEndOfInputOnlyAtSourceEnd() {
        val source =
            ChromVoidVaultVideoDataSource(video(size = 4)) { _, _, _ ->
                byteArrayOf(1, 2)
            }
        val output = ByteArray(4)

        source.open(dataSpec(position = 2, length = C.LENGTH_UNSET.toLong()))

        assertEquals(2, source.read(output, 0, output.size))
        assertEquals(C.RESULT_END_OF_INPUT, source.read(output, 0, output.size))
        assertArrayEquals(byteArrayOf(1, 2, 0, 0), output)
    }

    @Test
    fun throwsStableErrorCodeForNativeReadFailure() {
        val source =
            ChromVoidVaultVideoDataSource(video()) { _, _, _ ->
                null
            }

        source.open(dataSpec(position = 0, length = 4))

        try {
            source.read(ByteArray(4), 0, 4)
            fail("read should fail")
        } catch (error: ChromVoidVaultVideoDataSource.VideoSourceIOException) {
            assertEquals(ChromVoidVaultVideoDataSource.ERR_SOURCE_READ, error.code)
        }
    }

    @Test
    fun rejectsUnsatisfiableOpenRange() {
        val source =
            ChromVoidVaultVideoDataSource(video(size = 8)) { _, _, _ ->
                null
            }

        try {
            source.open(dataSpec(position = 9, length = 1))
            fail("open should fail")
        } catch (error: ChromVoidVaultVideoDataSource.VideoSourceIOException) {
            assertEquals(ChromVoidVaultVideoDataSource.ERR_RANGE_INVALID, error.code)
        }
    }

    private data class ReadCall(
        val token: String,
        val offset: Long,
        val length: Int,
    )

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
            token = "video-token",
            nodeId = 41L,
            name = "movie.mp4",
            mimeType = "video/mp4",
            size = size,
            sourceRevision = 77L,
        )
}
