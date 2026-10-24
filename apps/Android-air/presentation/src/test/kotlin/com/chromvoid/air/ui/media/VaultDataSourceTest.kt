package com.chromvoid.air.ui.media

import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSourceException
import androidx.media3.datasource.DataSpec
import com.chromvoid.air.ui.files.FakeFileStore
import java.io.ByteArrayOutputStream
import java.io.IOException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@OptIn(UnstableApi::class)
@RunWith(RobolectricTestRunner::class)
public class VaultDataSourceTest {
    private val content = ByteArray(23) { (it * 7).toByte() }
    private val store = FakeFileStore().apply { file("clip.mp4", content, mimeType = "video/mp4") }
    private val id = store.named("clip.mp4").id
    private val metadata = runBlocking { store.fileInfo(id, 1uL) }

    private fun source() = VaultDataSource(store, id, 1uL, metadata)

    private fun readAll(source: VaultDataSource, buffer: Int = 3): ByteArray {
        val out = ByteArrayOutputStream()
        val bytes = ByteArray(buffer)
        while (true) {
            val count = source.read(bytes, 0, bytes.size)
            if (count == C.RESULT_END_OF_INPUT) break
            out.write(bytes, 0, count)
        }
        return out.toByteArray()
    }

    @Test
    public fun `a range is read chunk by chunk and each open has its own reader`() {
        val source = source()

        assertEquals(23L, source.open(DataSpec(Uri.parse("chromvoid-vault://1"))))
        assertArrayEquals(content, readAll(source))
        source.close()

        assertEquals(
            8L,
            source.open(DataSpec.Builder().setUri("chromvoid-vault://1").setPosition(10).setLength(8).build()),
        )
        assertArrayEquals(content.copyOfRange(10, 18), readAll(source, buffer = 4))
        source.close()

        assertEquals(2, store.readersOpened)
        assertEquals("every reader is cancelled on close", 0, store.readersOpen)
    }

    @Test(expected = DataSourceException::class)
    public fun `a position past the end is refused`() {
        source().open(DataSpec.Builder().setUri("chromvoid-vault://1").setPosition(24).build())
    }

    @Test
    public fun `a file that changed while it played fails the read`() {
        val source = source()
        source.open(DataSpec(Uri.parse("chromvoid-vault://1")))
        val changed = VaultDataSource(store, id, 1uL, metadata.copy(sourceRevision = metadata.sourceRevision + 1))
        changed.open(DataSpec(Uri.parse("chromvoid-vault://1")))
        try {
            changed.read(ByteArray(4), 0, 4)
            error("a chunk from another revision was accepted")
        } catch (_: IOException) {
            Unit
        } finally {
            changed.close()
            source.close()
        }
        assertEquals(0, store.readersOpen)
    }
}
