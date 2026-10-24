package com.chromvoid.app

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.datasource.DataSpec
import com.chromvoid.app.nativebridge.AudioSourceReadResult
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ChromVoidVaultAudioDataSourceTest {
    @Test
    fun readsRequestedRangeAndCapsChunkSize() {
        val calls = mutableListOf<ReadCall>()
        val source =
            ChromVoidVaultAudioDataSource(track(size = ChromVoidVaultAudioDataSource.MAX_READ_BYTES + 16L)) { token, offset, length ->
                calls.add(ReadCall(token, offset, length))
                AudioSourceReadResult(ByteArray(length) { 7 }, null)
            }
        val output = ByteArray(ChromVoidVaultAudioDataSource.MAX_READ_BYTES + 8)

        val opened = source.open(dataSpec(position = 4, length = output.size.toLong()))
        val firstRead = source.read(output, 0, output.size)

        assertEquals(output.size.toLong(), opened)
        assertEquals(ChromVoidVaultAudioDataSource.MAX_READ_BYTES, firstRead)
        assertEquals(ReadCall("opaque-token", 4, ChromVoidVaultAudioDataSource.MAX_READ_BYTES), calls.single())
    }

    @Test
    fun buffersSmallReadsIntoSingleNativeRange() {
        val bytes = ByteArray(16) { it.toByte() }
        val calls = mutableListOf<ReadCall>()
        val source =
            ChromVoidVaultAudioDataSource(track(size = bytes.size.toLong())) { token, offset, length ->
                calls.add(ReadCall(token, offset, length))
                AudioSourceReadResult(bytes.copyOfRange(offset.toInt(), (offset + length).toInt()), null)
            }
        val output = ByteArray(2)

        source.open(dataSpec(position = 0, length = C.LENGTH_UNSET.toLong()))

        assertEquals(1, source.read(output, 0, 1))
        assertEquals(1, source.read(output, 1, 1))
        assertArrayEquals(byteArrayOf(0, 1), output)
        assertEquals(listOf(ReadCall("opaque-token", 0, bytes.size)), calls)
    }

    @Test
    fun returnsEndOfInputOnlyAtSourceEnd() {
        val source =
            ChromVoidVaultAudioDataSource(track(size = 4)) { _, _, _ ->
                AudioSourceReadResult(byteArrayOf(1, 2), null)
            }
        val output = ByteArray(4)

        source.open(dataSpec(position = 2, length = C.LENGTH_UNSET.toLong()))

        assertEquals(2, source.read(output, 0, output.size))
        assertEquals(C.RESULT_END_OF_INPUT, source.read(output, 0, output.size))
        assertArrayEquals(byteArrayOf(1, 2, 0, 0), output)
    }

    @Test
    fun throwsStableErrorCodeForUnexpectedShortReadBeforeSourceEnd() {
        val source =
            ChromVoidVaultAudioDataSource(track(size = 8)) { _, _, _ ->
                AudioSourceReadResult(byteArrayOf(1), null)
            }

        source.open(dataSpec(position = 0, length = 4))

        try {
            source.read(ByteArray(4), 0, 4)
            fail("read should fail")
        } catch (error: ChromVoidVaultAudioDataSource.AudioSourceIOException) {
            assertEquals(ChromVoidVaultAudioDataSource.ERR_SOURCE_READ, error.code)
        }
    }

    @Test
    fun propagatesNativeErrorCodeThroughIOException() {
        val source =
            ChromVoidVaultAudioDataSource(track()) { _, _, _ ->
                AudioSourceReadResult(null, ChromVoidVaultAudioDataSource.ERR_VAULT_LOCKED)
            }

        source.open(dataSpec(position = 0, length = 4))

        try {
            source.read(ByteArray(4), 0, 4)
            fail("read should fail")
        } catch (error: ChromVoidVaultAudioDataSource.AudioSourceIOException) {
            assertEquals(ChromVoidVaultAudioDataSource.ERR_VAULT_LOCKED, error.code)
        }
    }

    @Test
    fun propagatesStaleSourceCodeThroughIOException() {
        val source =
            ChromVoidVaultAudioDataSource(track()) { _, _, _ ->
                AudioSourceReadResult(null, ChromVoidVaultAudioDataSource.ERR_SOURCE_STALE)
            }

        source.open(dataSpec(position = 0, length = 4))

        try {
            source.read(ByteArray(4), 0, 4)
            fail("read should fail")
        } catch (error: ChromVoidVaultAudioDataSource.AudioSourceIOException) {
            assertEquals(ChromVoidVaultAudioDataSource.ERR_SOURCE_STALE, error.code)
        }
    }

    @Test
    fun rejectsUnsatisfiableOpenRange() {
        val source =
            ChromVoidVaultAudioDataSource(track(size = 8)) { _, _, _ ->
                AudioSourceReadResult(null, null)
            }

        try {
            source.open(dataSpec(position = 9, length = 1))
            fail("open should fail")
        } catch (error: ChromVoidVaultAudioDataSource.AudioSourceIOException) {
            assertEquals(ChromVoidVaultAudioDataSource.ERR_RANGE_INVALID, error.code)
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
            .setUri(Uri.parse("chromvoid-audio://test"))
            .setPosition(position)
            .setLength(length)
            .build()

    private fun track(size: Long = 8L): AudioPlaybackCommand.AudioTrack =
        AudioPlaybackCommand.AudioTrack(
            trackId = 41L,
            systemTitle = "ChromVoid audio",
            mimeType = "audio/mpeg",
            size = size,
            sourceRevision = 77L,
            sourceToken = "opaque-token",
        )
}
