package com.chromvoid.air.ui.media

import android.graphics.Bitmap
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.credentials.modelScope
import com.chromvoid.air.ui.files.FakeFileStore
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
public class PdfPreviewModelTest {
    private data class Region(
        val page: Int,
        val pagePixelWidth: Int,
        val left: Int,
        val top: Int,
        val width: Int,
        val height: Int,
    )

    private class FakePdf(
        override val pageCount: Int,
        override val readsText: Boolean = false,
        /** Each page's text, found by plain substring. */
        private val text: List<String> = emptyList(),
        private val pageLinks: Map<Int, List<PdfLink>> = emptyMap(),
    ) : PdfDocument {
        var closed = false
        val regions = mutableListOf<Region>()
        var textReads = 0

        override fun pageSize(index: Int): Pair<Int, Int> = 595 to 842

        override fun find(index: Int, query: String): List<List<PdfRect>> {
            val page = text.getOrNull(index) ?: return emptyList()
            return Regex(Regex.escape(query), RegexOption.IGNORE_CASE).findAll(page)
                .map { listOf(PdfRect(it.range.first * 10f, 100f, (it.range.last + 1) * 10f, 112f)) }.toList()
        }

        override fun links(index: Int): List<PdfLink> = pageLinks[index].orEmpty()

        override fun text(index: Int): String {
            textReads += 1
            return text.getOrNull(index).orEmpty()
        }

        override fun renderRegion(
            index: Int,
            pagePixelWidth: Int,
            left: Int,
            top: Int,
            width: Int,
            height: Int,
        ): Bitmap {
            regions += Region(index, pagePixelWidth, left, top, width, height)
            return Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        }

        override fun close() {
            closed = true
        }
    }

    private val opened = mutableListOf<ByteArray>()

    private fun TestScope.model(
        store: FakeFileStore,
        open: (ByteArray, String?) -> PdfDocument,
    ): PdfPreviewModel = PdfPreviewModel(
        store,
        store.named("a.pdf").id,
        1uL,
        "a.pdf",
        modelScope(),
        open = { bytes, password ->
            opened += bytes
            open(bytes, password)
        },
        background = StandardTestDispatcher(testScheduler),
    )

    @Test
    public fun `a PDF opens with its page sizes and draws only requested regions`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a.pdf", ByteArray(20) { 7 }, mimeType = "application/pdf") }
        val pdf = FakePdf(3)
        val model = model(store) { _, _ -> pdf }

        model.load()
        advanceUntilIdle()

        val state = model.state.value
        assertEquals(PdfPreviewModel.Status.READY, state.status)
        assertEquals(3, state.pageCount)
        assertEquals(List(3) { 595 to 842 }, state.pageSizes)
        assertTrue(
            "the bytes read are cleared once the renderer holds its copy",
            opened.single().all { it == 0.toByte() },
        )
        assertNotNull(model.renderRegion(1, 300, 0, 0, 300, 400))
        assertEquals(listOf(Region(1, 300, 0, 0, 300, 400)), pdf.regions)
        assertNull(model.renderRegion(5, 300, 0, 0, 300, 400))
    }

    @Test
    public fun `fitted pages render once per width even for concurrent requests`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a.pdf", ByteArray(8)) }
        val pdf = FakePdf(2)
        val model = model(store) { _, _ -> pdf }
        assertNull(model.renderPage(0, 300))
        model.load()
        advanceUntilIdle()

        val first = async { model.renderPage(0, 300) }
        val duplicate = async { model.renderPage(0, 300) }
        val fitted = checkNotNull(first.await())
        assertSame(fitted, duplicate.await())
        repeat(10) { assertSame(fitted, model.renderPage(0, 300)) }
        val wider = checkNotNull(model.renderPage(0, 600))
        assertNotSame(fitted, wider)
        assertSame(fitted, model.renderPage(0, 300))
        assertEquals(listOf(Region(0, 300, 0, 0, 300, 425), Region(0, 600, 0, 0, 600, 849)), pdf.regions)
        assertNull(model.renderPage(2, 300))
        assertNull(model.renderPage(-1, 300))
        assertNull(model.renderPage(0, 0))
    }

    @Test
    public fun `fitted page cache retains eight most recently shown pages`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a.pdf", ByteArray(8)) }
        val pdf = FakePdf(10)
        val model = model(store) { _, _ -> pdf }
        model.load()
        advanceUntilIdle()

        val pages = (0 until 8).map { checkNotNull(model.renderPage(it, 100)) }
        assertSame(pages[0], model.renderPage(0, 100))
        model.renderPage(8, 100)
        assertSame(pages[0], model.renderPage(0, 100))
        assertNotSame(pages[1], model.renderPage(1, 100))
        assertEquals((0 until 8).toList() + listOf(8, 1), pdf.regions.map { it.page })
    }

    @Test
    public fun `fitted page cache also evicts by bitmap bytes and bounds a single render`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a.pdf", ByteArray(8)) }
        val pdf = FakePdf(3)
        val model = model(store) { _, _ -> pdf }
        model.load()
        advanceUntilIdle()

        val first = checkNotNull(model.renderPage(0, 1_700))
        val second = checkNotNull(model.renderPage(1, 1_700))
        model.renderPage(2, 1_700)
        assertSame(second, model.renderPage(1, 1_700))
        assertNotSame(first, model.renderPage(0, 1_700))
        assertEquals(listOf(0, 1, 2, 0), pdf.regions.map { it.page })

        val bounded = checkNotNull(model.renderPage(0, 20_000))
        assertTrue(bounded.width.toLong() * bounded.height <= PdfPreviewModel.MAXIMUM_RENDER_PIXELS)
    }

    @Test
    public fun `pinch preserves its centroid and clamps zoom and page edges`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a.pdf", ByteArray(8)) }
        val model = model(store) { _, _ -> FakePdf(2) }
        model.load()
        advanceUntilIdle()

        model.transformPage(0, 2f, 0f, 0f, 100f, 200f, 300f, 400f)
        assertEquals(PdfViewport(2f, 100f, 200f), model.state.value.viewport(0))

        model.transformPage(0, 10f, 0f, 0f, 100f, 200f, 300f, 400f)
        assertEquals(PdfViewport(5f, 400f, 800f), model.state.value.viewport(0))

        model.transformPage(0, 1f, 10_000f, -10_000f, 100f, 200f, 300f, 400f)
        assertEquals(PdfViewport(5f, 0f, 1_600f), model.state.value.viewport(0))
        model.transformPage(0, 1f, -10_000f, 10_000f, 100f, 200f, 300f, 400f)
        assertEquals(PdfViewport(5f, 1_200f, 0f), model.state.value.viewport(0))

        model.transformPage(0, 0.01f, 0f, 0f, 100f, 200f, 300f, 400f)
        assertEquals(PdfViewport(), model.state.value.viewport(0))
        assertTrue(model.state.value.viewports.isEmpty())
    }

    @Test
    public fun `a partly visible magnified page can pan from its first to its last line`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a.pdf", ByteArray(8)) }
        val model = model(store) { _, _ -> FakePdf(2) }
        model.load()
        advanceUntilIdle()

        model.toggleZoom(0, 150f, 300f, 300f, 400f, visibleTop = 200f, visibleHeight = 200f)
        assertEquals(PdfViewport(2.5f, 225f, 450f), model.state.value.viewport(0))
        model.transformPage(0, 1f, 0f, 10_000f, 150f, 300f, 300f, 400f, 200f, 200f)
        assertEquals(-200f, model.state.value.viewport(0).panY, 0f)
        model.transformPage(0, 1f, 0f, -10_000f, 150f, 300f, 300f, 400f, 200f, 200f)
        assertEquals(600f, model.state.value.viewport(0).panY, 0f)

        model.toggleZoom(0, 150f, 300f, 300f, 400f, 200f, 200f)
        assertEquals(PdfViewport(), model.state.value.viewport(0))
    }

    @Test
    public fun `only one page is magnified and page navigation resets magnification`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a.pdf", ByteArray(8)) }
        val model = model(store) { _, _ -> FakePdf(2) }
        model.load()
        advanceUntilIdle()

        model.toggleZoom(0, 150f, 200f, 300f, 400f)
        model.toggleZoom(1, 150f, 200f, 300f, 400f)
        assertEquals(setOf(1), model.state.value.viewports.keys)
        assertEquals(PdfViewport(), model.state.value.viewport(0))
        model.goToPage(0)
        assertTrue(model.state.value.viewports.isEmpty())
        assertEquals(0, model.state.value.pageRequest?.index)
        val request = model.state.value.pageRequest
        model.goToPage(0)
        assertTrue(checkNotNull(model.state.value.pageRequest).serial > checkNotNull(request).serial)
        val valid = model.state.value
        model.goToPage(4)
        model.transformPage(0, Float.NaN, 0f, 0f, 150f, 200f, 300f, 400f)
        assertEquals(valid, model.state.value)
    }

    @Test
    public fun `magnified rendering requests only its region and retains no high resolution cache`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a.pdf", ByteArray(8)) }
        val pdf = FakePdf(2)
        val model = model(store) { _, _ -> pdf }
        model.load()
        advanceUntilIdle()

        val first = model.renderRegion(0, 1_500, 300, 500, 300, 400)
        val second = model.renderRegion(0, 1_500, 300, 500, 300, 400)
        assertNotSame(first, second)
        assertEquals(List(2) { Region(0, 1_500, 300, 500, 300, 400) }, pdf.regions)
        assertNull(model.renderRegion(2, 1_500, 0, 0, 300, 400))
        assertNull(model.renderRegion(0, 1_500, -1, 0, 300, 400))

        val bounded = checkNotNull(model.renderRegion(1, 20_000, 1_000, 2_000, 4_000, 4_000))
        assertTrue(bounded.width.toLong() * bounded.height <= PdfPreviewModel.MAXIMUM_RENDER_PIXELS)
        assertEquals(Region(1, 10_240, 512, 1_024, 2_048, 2_048), pdf.regions.last())
        val narrow = checkNotNull(model.renderRegion(1, Int.MAX_VALUE, 0, 0, Int.MAX_VALUE, 1))
        assertTrue(narrow.width.toLong() * narrow.height <= PdfPreviewModel.MAXIMUM_RENDER_PIXELS)
        model.close()
        advanceUntilIdle()
        assertNull(model.renderRegion(0, 1_500, 0, 0, 300, 400))
    }

    @Test
    public fun `page content exposes extracted text and links and preserves an empty scan`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a.pdf", ByteArray(8)) }
        val link = PdfLink.External("https://example.com", listOf(PdfRect(0f, 0f, 10f, 10f)))
        val pdf = FakePdf(2, readsText = true, text = listOf("Page text", ""), pageLinks = mapOf(0 to listOf(link)))
        val model = model(store) { _, _ -> pdf }
        model.load()
        advanceUntilIdle()

        assertEquals(PdfPageContent("Page text", listOf(link)), model.content(0))
        assertEquals(PdfPageContent(), model.content(1))
        assertEquals(PdfPageContent(), model.content(2))
        assertEquals(2, pdf.textReads)
        assertEquals("https://example.com", model.activateLink(link))
        model.toggleZoom(0, 150f, 200f, 300f, 400f)
        assertNull(model.activateLink(PdfLink.Page(1, emptyList())))
        assertEquals(1, model.state.value.pageRequest?.index)
        assertTrue(model.state.value.viewports.isEmpty())
        model.close()
        advanceUntilIdle()
        assertEquals(PdfPageContent(), model.content(0))
        assertNull(model.activateLink(link))
    }

    @Test
    public fun `find goes through every match in page order and brings each page on screen`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a.pdf", ByteArray(20) { 7 }, mimeType = "application/pdf") }
        val pdf = FakePdf(3, readsText = true, text = listOf("vault key", "nothing here", "Vault and vault"))
        val model = model(store) { _, _ -> pdf }
        model.load()
        advanceUntilIdle()
        assertTrue(model.state.value.readsText)

        model.startFind()
        model.toggleZoom(0, 150f, 200f, 300f, 400f)
        model.find("vault")
        advanceUntilIdle()
        val search = checkNotNull(model.state.value.search)
        assertEquals(listOf(0, 2, 2), search.matches.map { it.page })
        assertEquals(0, search.current)
        assertEquals(0, model.state.value.pageRequest?.index)
        assertTrue("a found match returns to the fitted page", model.state.value.viewports.isEmpty())

        model.nextMatch()
        assertEquals(2, model.state.value.pageRequest?.index)
        model.nextMatch()
        model.nextMatch()
        assertEquals("past the last it goes round", 0, model.state.value.search?.current)
        model.previousMatch()
        assertEquals(2, model.state.value.search?.current)

        model.find("absent")
        advanceUntilIdle()
        assertTrue(model.state.value.search!!.searched && model.state.value.search!!.matches.isEmpty())
        model.endFind()
        assertNull(model.state.value.search)
    }

    @Test
    public fun `a link opens a web or mail address, turns to its page, and anything else is refused`(): Unit =
        runTest {
            val store = FakeFileStore().apply { file("a.pdf", ByteArray(20) { 7 }, mimeType = "application/pdf") }
            val box = listOf(PdfRect(10f, 10f, 100f, 30f))
            val lower = listOf(PdfRect(10f, 50f, 100f, 70f))
            val further = listOf(PdfRect(10f, 90f, 100f, 110f))
            val pdf = FakePdf(
                3,
                readsText = true,
                pageLinks = mapOf(
                    0 to listOf(
                        PdfLink.External("https://example.com/a", box),
                        PdfLink.Page(2, lower),
                        PdfLink.External("file:///other.pdf", further),
                    ),
                ),
            )
            val model = model(store) { _, _ -> pdf }
            model.load()
            advanceUntilIdle()

            assertEquals("https://example.com/a", model.linkAt(0, 50f, 20f))
            assertNull(model.linkAt(0, 50f, 60f))
            assertEquals(2, model.state.value.pageRequest?.index)
            assertNull("no link there", model.linkAt(0, 300f, 300f))
            assertFalse(model.state.value.linkRefused)
            assertNull(model.linkAt(0, 50f, 100f))
            assertTrue("another PDF is not opened from the vault preview", model.state.value.linkRefused)
            model.dismissLinkRefusal()
            assertFalse(model.state.value.linkRefused)
        }

    @Test
    public fun `a device that reads no text offers no find and follows no link`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a.pdf", ByteArray(20) { 7 }, mimeType = "application/pdf") }
        val pdf = FakePdf(2, text = listOf("Unavailable below API 35"))
        val model = model(store) { _, _ -> pdf }
        model.load()
        advanceUntilIdle()

        model.startFind()
        assertNull(model.state.value.search)
        assertNull(model.linkAt(0, 1f, 1f))
        assertEquals(PdfPageContent(), model.content(0))
        assertEquals(0, pdf.textReads)
    }

    @Test
    public fun `a damaged or too large PDF says why`(): Unit = runTest {
        val damaged = FakeFileStore().apply { file("a.pdf", ByteArray(4), mimeType = "application/pdf") }
        val model = model(damaged) { _, _ -> throw PdfDamaged(null) }
        model.load()
        advanceUntilIdle()
        assertEquals(PdfPreviewModel.Issue.DAMAGED, model.state.value.issue)

        val large = FakeFileStore().apply { file("a.pdf", size = PdfPreviewModel.MAXIMUM_SOURCE_BYTES + 1) }
        val tooLarge = model(large) { _, _ -> error("not opened") }
        tooLarge.load()
        advanceUntilIdle()
        assertEquals(PdfPreviewModel.Issue.TOO_LARGE, tooLarge.state.value.issue)
    }

    @Test
    @Config(sdk = [34])
    public fun `a protected PDF is explained where the platform takes no password`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a.pdf", ByteArray(8) { 1 }) }
        val model = model(store) { _, _ -> throw PdfProtected() }

        model.load()
        advanceUntilIdle()

        assertEquals(PdfPreviewModel.Status.FAILED, model.state.value.status)
        assertEquals(PdfPreviewModel.Issue.PROTECTED, model.state.value.issue)
    }

    @Test
    @Config(sdk = [35])
    public fun `a protected PDF asks for its password and keeps its bytes for the next try`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a.pdf", ByteArray(8) { 1 }) }
        val pdf = FakePdf(1)
        val model = model(store) { _, password ->
            when (password) {
                null -> throw PdfProtected()
                "secret" -> pdf
                else -> throw PdfWrongPassword()
            }
        }

        model.load()
        advanceUntilIdle()
        assertEquals(PdfPreviewModel.Status.PASSWORD_REQUIRED, model.state.value.status)
        assertNull(model.state.value.issue)

        model.load("wrong")
        advanceUntilIdle()
        assertEquals(PdfPreviewModel.Issue.WRONG_PASSWORD, model.state.value.issue)

        model.load("secret")
        advanceUntilIdle()
        assertEquals(PdfPreviewModel.Status.READY, model.state.value.status)
        assertEquals("the file was read once", 1, store.calls.count { it.startsWith("read:") })
    }

    @Test
    public fun `closing drops the document and a revoked session closes the preview`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a.pdf", ByteArray(8) { 1 }) }
        val pdf = FakePdf(2)
        val model = model(store) { _, _ -> pdf }
        model.load()
        advanceUntilIdle()
        assertNotNull(model.renderRegion(0, 100, 0, 0, 100, 100))
        assertNotNull(model.renderPage(0, 100))

        model.close()
        assertNull("a cached page is unavailable as soon as the session closes", model.renderPage(0, 100))
        advanceUntilIdle()
        assertTrue(pdf.closed)
        assertNull(model.renderRegion(0, 100, 0, 0, 100, 100))
        assertNull(model.renderPage(0, 100))

        val revoked = model(store) { _, _ -> pdf }
        store.failNext = BridgeException.SessionRevoked()
        revoked.load()
        advanceUntilIdle()
        assertEquals(PdfPreviewModel.Status.REVOKED, revoked.state.value.status)
        assertNull(revoked.renderPage(0, 100))
    }
}
