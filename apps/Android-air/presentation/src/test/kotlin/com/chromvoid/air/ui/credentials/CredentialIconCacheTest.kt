package com.chromvoid.air.ui.credentials

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.ImageBitmapConfig
import androidx.compose.ui.graphics.colorspace.ColorSpace
import androidx.compose.ui.graphics.colorspace.ColorSpaces
import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class CredentialIconCacheTest {
    private val store = FakeCredentialStore(listOf(summary("mail", "Mail")))

    /** What the injected decoder returns; the cache never looks inside an image. */
    private val decoded: ImageBitmap = StubImage

    private fun TestScope.cache(
        decode: (ByteArray) -> ImageBitmap? = { decoded },
    ): CredentialIconCache = CredentialIconCache(store, generation = 1uL, scope = modelScope(), decode = decode)

    @Test
    public fun `icons are read once and kept for the session`(): Unit = runTest {
        store.icons["a"] = "AAAA"
        val cache = cache()

        cache.request(listOf("a", "a"))
        advanceUntilIdle()
        cache.request(listOf("a"))
        advanceUntilIdle()

        assertEquals(listOf(listOf("a")), store.iconRequests)
        assertEquals(decoded, cache.icons.value["a"]?.image)
        assertEquals(Color(0x10 / 255f, 0x20 / 255f, 0x30 / 255f), cache.icons.value["a"]?.background)
    }

    @Test
    public fun `a digest Core does not have is never asked for again`(): Unit = runTest {
        val cache = cache()

        cache.request(listOf("gone"))
        advanceUntilIdle()
        cache.request(listOf("gone"))
        advanceUntilIdle()

        assertEquals(1, store.iconRequests.size)
        assertNull(cache.icons.value["gone"])
    }

    @Test
    public fun `an image that does not decode is remembered as missing`(): Unit = runTest {
        store.icons["bad"] = "AAAA"
        val cache = cache(decode = { null })

        cache.request(listOf("bad"))
        advanceUntilIdle()
        cache.request(listOf("bad"))
        advanceUntilIdle()

        assertEquals(1, store.iconRequests.size)
        assertTrue(cache.icons.value.isEmpty())
    }

    @Test
    public fun `a batch holds at most what Core accepts`(): Unit = runTest {
        val refs = (1..CredentialIconCache.BATCH_SIZE + 10).map { "icon-$it" }
        val cache = cache()

        cache.request(refs)
        advanceUntilIdle()

        assertEquals(2, store.iconRequests.size)
        assertEquals(CredentialIconCache.BATCH_SIZE, store.iconRequests[0].size)
        assertEquals(10, store.iconRequests[1].size)
    }

    @Test
    public fun `a failed batch is asked for again rather than remembered as missing`(): Unit = runTest {
        store.icons["a"] = "AAAA"
        store.failWith = CoreRefusal("INTERNAL", "passmanager:icon:getMany")
        val cache = cache()

        cache.request(listOf("a"))
        advanceUntilIdle()
        store.failWith = null
        cache.request(listOf("a"))
        advanceUntilIdle()

        assertEquals(2, store.iconRequests.size)
        assertEquals(decoded, cache.icons.value["a"]?.image)
    }

    @Test
    public fun `a lock drops every image`(): Unit = runTest {
        store.icons["a"] = "AAAA"
        val cache = cache()
        cache.request(listOf("a"))
        advanceUntilIdle()

        cache.close()

        assertTrue(cache.icons.value.isEmpty())
        cache.request(listOf("a"))
        advanceUntilIdle()
        assertEquals("a closed cache asks Core for nothing", 1, store.iconRequests.size)
    }

    @Test
    public fun `a background colour is read as the store writes it`() {
        assertEquals(Color(1f, 1f, 1f, 1f), CredentialIconCache.parseColor("#FFFFFF"))
        assertEquals(Color(0f, 0f, 0f, 0.5f), CredentialIconCache.parseColor("#00000080"))
        assertNull(CredentialIconCache.parseColor(null))
        assertNull(CredentialIconCache.parseColor("teal"))
    }

    private object StubImage : ImageBitmap {
        override val width: Int = 1
        override val height: Int = 1
        override val config: ImageBitmapConfig = ImageBitmapConfig.Argb8888
        override val colorSpace: ColorSpace = ColorSpaces.Srgb
        override val hasAlpha: Boolean = false

        override fun prepareToDraw(): Unit = Unit

        override fun readPixels(
            buffer: IntArray,
            startX: Int,
            startY: Int,
            width: Int,
            height: Int,
            bufferOffset: Int,
            stride: Int,
        ): Unit = Unit
    }
}
