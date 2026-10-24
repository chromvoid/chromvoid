package com.chromvoid.air.ui.media

import android.graphics.Bitmap
import androidx.activity.ComponentActivity
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.platform.UriHandler
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.assertContentDescriptionEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.click
import androidx.compose.ui.test.doubleClick
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performSemanticsAction
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import com.chromvoid.air.ui.AirTheme
import com.chromvoid.air.ui.files.FakeFileStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** The PDF's gestures and accessibility actions reach the same model state. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], qualifiers = "w411dp-h891dp")
public class PdfPreviewScreenTest {
    @get:Rule
    public val rule = createAndroidComposeRule<ComponentActivity>()

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val opened = mutableListOf<String>()
    private val uriHandler = object : UriHandler {
        override fun openUri(uri: String) {
            opened += uri
        }
    }

    private class FakePdf(
        override val readsText: Boolean = true,
        private val pageText: List<String> = listOf("First page text", "Second page text", "Third page text"),
        private val pageLinks: Map<Int, List<PdfLink>> = emptyMap(),
    ) : PdfDocument {
        override val pageCount: Int = pageText.size
        val renders = mutableListOf<Pair<Int, Int>>()

        override fun pageSize(index: Int): Pair<Int, Int> = 595 to 842

        override fun text(index: Int): String = pageText[index]

        override fun links(index: Int): List<PdfLink> = pageLinks[index].orEmpty()

        override fun find(index: Int, query: String): List<List<PdfRect>> =
            if (pageText[index].contains(query, ignoreCase = true)) {
                listOf(listOf(PdfRect(20f, 20f, 200f, 40f)))
            } else {
                emptyList()
            }

        override fun renderRegion(
            index: Int,
            pagePixelWidth: Int,
            left: Int,
            top: Int,
            width: Int,
            height: Int,
        ): Bitmap {
            renders += index to pagePixelWidth
            return Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        }

        fun renderCount(index: Int): Int = renders.count { it.first == index }

        override fun close() = Unit
    }

    @After
    public fun cancelWork() {
        scope.cancel()
    }

    private fun createModel(open: (ByteArray, String?) -> PdfDocument): PdfPreviewModel {
        val store = FakeFileStore().apply { file("a.pdf", ByteArray(8), mimeType = "application/pdf") }
        return PdfPreviewModel(
            store,
            store.named("a.pdf").id,
            1uL,
            "a.pdf",
            scope,
            open = open,
            background = Dispatchers.Main.immediate,
        )
    }

    private fun show(open: (ByteArray, String?) -> PdfDocument): PdfPreviewModel {
        val model = createModel(open)
        rule.setContent {
            CompositionLocalProvider(LocalUriHandler provides uriHandler) {
                AirTheme { PdfPreviewScreen(model, onClose = {}, onLock = {}) }
            }
        }
        rule.waitUntil(5_000) {
            model.state.value.status !in setOf(PdfPreviewModel.Status.IDLE, PdfPreviewModel.Status.LOADING)
        }
        rule.waitForIdle()
        if (model.state.value.status == PdfPreviewModel.Status.READY) waitForPage(0)
        return model
    }

    private fun show(pdf: PdfDocument = FakePdf()): PdfPreviewModel = show { _, _ -> pdf }

    private fun showPageSurface(): Pair<PdfPreviewModel, LazyListState> {
        val model = createModel { _, _ -> FakePdf() }
        val list = LazyListState()
        rule.setContent {
            CompositionLocalProvider(LocalUriHandler provides uriHandler) {
                AirTheme {
                    val state by model.state.collectAsState()
                    LaunchedEffect(model) { model.load() }
                    BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
                        val width = with(LocalDensity.current) { (maxWidth - 32.dp).roundToPx() }
                        LazyColumn(state = list, modifier = Modifier.fillMaxSize()) {
                            itemsIndexed(state.pageSizes) { index, (pageWidth, pageHeight) ->
                                PdfPageSurface(
                                    model, state, index, pageWidth, pageHeight, width, list, emptyList(), null,
                                )
                            }
                        }
                    }
                }
            }
        }
        waitForPage(0)
        return model to list
    }

    /** No animated scroll remains to consume the next down as a request to stop scrolling. */
    private fun moveListWithoutAnimation(list: LazyListState): Float {
        val before = rule.runOnIdle { list.firstVisibleItemScrollOffset }
        val consumed = rule.runOnIdle { runBlocking { list.scrollBy(12f) } }
        rule.mainClock.advanceTimeByFrame()
        rule.waitForIdle()
        rule.runOnIdle {
            assertTrue(
                "the page visibility changes during the held gesture", list.firstVisibleItemScrollOffset > before,
            )
        }
        return consumed
    }

    private fun waitForPage(index: Int) {
        rule.waitUntil(5_000) {
            rule.onAllNodesWithTag(pdfDrawnTag(index), useUnmergedTree = true).fetchSemanticsNodes().isNotEmpty()
        }
        rule.waitForIdle()
    }

    private fun actions(index: Int): List<String> =
        rule.onNodeWithTag(pdfPageTag(index)).fetchSemanticsNode().config[SemanticsActions.CustomActions]
            .map { it.label }

    private fun performPageAction(index: Int, label: String) {
        val action = rule.onNodeWithTag(pdfPageTag(index)).fetchSemanticsNode()
            .config[SemanticsActions.CustomActions].single { it.label == label }
        rule.runOnIdle { assertTrue("$label is handled", action.action()) }
        rule.waitForIdle()
    }

    private fun scrollPdfBy(pixels: Float) {
        val list = rule.onNode(hasScrollAction())
        val before = list.fetchSemanticsNode().config[SemanticsProperties.VerticalScrollAxisRange].value()
        list.performSemanticsAction(SemanticsActions.ScrollBy) {
            assertTrue("the PDF list handles scrolling", it(0f, pixels))
        }
        rule.mainClock.advanceTimeBy(64)
        rule.waitForIdle()
        val after = list.fetchSemanticsNode().config[SemanticsProperties.VerticalScrollAxisRange].value()
        assertTrue(
            "the PDF list scrolls in the requested direction", if (pixels > 0f) after > before else after < before,
        )
    }

    @Test
    public fun `scrolling a fitted page reuses its single full-page render`() {
        val pdf = FakePdf()
        val model = show(pdf)
        assertEquals(1, pdf.renderCount(0))

        repeat(12) { scrollPdfBy(40f) }
        repeat(12) { scrollPdfBy(-40f) }

        assertEquals(1f, model.state.value.viewport(0).zoom, 0f)
        assertEquals("scrolling never rerenders an already displayed fitted page", 1, pdf.renderCount(0))
    }

    @Test
    public fun `a continuous pan only requests a sharp region after it settles`() {
        val pdf = FakePdf()
        val model = show(pdf)
        val fittedWidth = pdf.renders.first { it.first == 0 }.second
        performPageAction(0, "Zoom in")
        rule.waitUntil(5_000) { pdf.renders.any { it.first == 0 && it.second > fittedWidth } }
        rule.waitForIdle()
        val rendersBeforePan = pdf.renderCount(0)
        val panBefore = model.state.value.viewport(0).panX
        rule.mainClock.autoAdvance = false

        rule.onNodeWithTag(pdfPageTag(0)).performTouchInput { down(center) }
        repeat(8) { step ->
            rule.onNodeWithTag(pdfPageTag(0)).performTouchInput {
                moveTo(center - Offset(12f * (step + 1), 4f * (step + 1)), delayMillis = 16)
            }
            rule.mainClock.advanceTimeByFrame()
            rule.waitForIdle()
        }
        rule.onNodeWithTag(pdfPageTag(0)).performTouchInput { up() }
        assertTrue("the pan reaches the model", model.state.value.viewport(0).panX > panBefore)
        assertTrue("pan events reproject the old raster", pdf.renderCount(0) - rendersBeforePan <= 1)

        rule.mainClock.advanceTimeBy(160)
        rule.waitUntil(5_000) { pdf.renderCount(0) > rendersBeforePan }
        rule.waitForIdle()
        assertTrue("eight pan events need at most two sharp renders", pdf.renderCount(0) - rendersBeforePan in 1..2)
        rule.mainClock.autoAdvance = true
    }

    @Test
    public fun `a double tap survives list movement between its taps`() {
        val (model, list) = showPageSurface()
        rule.mainClock.autoAdvance = false

        rule.onNodeWithTag(pdfPageTag(0)).performTouchInput { click() }
        val moved = moveListWithoutAnimation(list)
        rule.onNodeWithTag(pdfPageTag(0)).performTouchInput {
            advanceEventTime(80)
            click(center + Offset(0f, moved))
        }
        rule.mainClock.advanceTimeByFrame()
        rule.waitForIdle()

        assertEquals(2.5f, model.state.value.viewport(0).zoom, 0f)
        rule.mainClock.autoAdvance = true
    }

    @Test
    public fun `a pinch survives list movement while both fingers are down`() {
        val (model, list) = showPageSurface()
        rule.mainClock.autoAdvance = false

        rule.onNodeWithTag(pdfPageTag(0)).performTouchInput {
            down(0, center - Offset(width * 0.1f, 0f))
            down(1, center + Offset(width * 0.1f, 0f))
        }
        moveListWithoutAnimation(list)
        rule.onNodeWithTag(pdfPageTag(0)).performTouchInput {
            updatePointerTo(0, center - Offset(width * 0.3f, 0f))
            updatePointerTo(1, center + Offset(width * 0.3f, 0f))
            move()
            up(0)
            up(1)
        }
        rule.mainClock.advanceTimeByFrame()
        rule.waitForIdle()

        assertTrue(model.state.value.viewport(0).zoom > 1f)
        rule.mainClock.autoAdvance = true
    }

    @Test
    public fun `double tap zooms the page and a second double tap fits it to width`() {
        val model = show()

        rule.onNodeWithTag(pdfPageTag(0)).performTouchInput { doubleClick() }
        rule.waitForIdle()
        assertEquals(2.5f, model.state.value.viewport(0).zoom, 0f)
        rule.onNodeWithTag(pdfPageTag(0)).assert(
            SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Zoom 250%"),
        )

        rule.onNodeWithTag(pdfPageTag(0)).performTouchInput { doubleClick() }
        rule.waitForIdle()
        assertEquals(1f, model.state.value.viewport(0).zoom, 0f)
        rule.onNodeWithTag(pdfPageTag(0)).assert(
            SemanticsMatcher.expectValue(SemanticsProperties.StateDescription, "Zoom 100%"),
        )
    }

    @Test
    public fun `a pinch zooms and dragging the magnified page stops at its edges`() {
        val model = show()
        rule.onNodeWithTag(pdfPageTag(0)).performTouchInput {
            down(0, center - Offset(width * 0.1f, 0f))
            down(1, center + Offset(width * 0.1f, 0f))
            updatePointerTo(0, center - Offset(width * 0.3f, 0f))
            updatePointerTo(1, center + Offset(width * 0.3f, 0f))
            move()
            up(0)
            up(1)
        }
        rule.waitForIdle()
        val magnified = model.state.value.viewport(0)
        assertTrue(magnified.zoom > 1f && magnified.zoom <= 5f)
        assertTrue(magnified.panX > 0f && magnified.panY > 0f)

        repeat(3) {
            rule.onNodeWithTag(pdfPageTag(0)).performTouchInput {
                down(Offset(width * 0.1f, height * 0.1f))
                moveTo(Offset(width * 0.9f, height * 0.9f))
                up()
            }
            rule.waitForIdle()
        }

        val moved = model.state.value.viewport(0)
        assertEquals(magnified.zoom, moved.zoom, 0f)
        assertTrue(moved.panX < magnified.panX && moved.panY < magnified.panY)
        assertEquals(0f, moved.panX, 0f)
        assertEquals(0f, moved.panY, 0f)
    }

    @Test
    public fun `TalkBack can zoom and fit the page without a coordinate gesture`() {
        val model = show()

        performPageAction(0, "Zoom in")
        assertTrue(model.state.value.viewport(0).zoom > 1f)

        performPageAction(0, "Fit to width")
        assertEquals(1f, model.state.value.viewport(0).zoom, 0f)
    }

    @Test
    public fun `a page names its position and exposes its text before its links`() {
        show(
            FakePdf(pageLinks = mapOf(0 to listOf(PdfLink.Page(2, listOf(PdfRect(10f, 50f, 200f, 80f)))))),
        )

        rule.onNodeWithTag(pdfPageTag(0)).assertContentDescriptionEquals("Page 1 of 3")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.IsTraversalGroup, true))
        rule.onNodeWithTag(pdfTextTag(0), useUnmergedTree = true).assertTextEquals("First page text")
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.TraversalIndex, 0f))
        rule.onNodeWithTag(pdfLinkTag(0, 0), useUnmergedTree = true)
            .assert(SemanticsMatcher.expectValue(SemanticsProperties.TraversalIndex, 1f))
    }

    @Test
    public fun `a scan explains that it has no accessible page text`() {
        show(FakePdf(pageText = listOf("", "", "")))

        rule.onNodeWithTag(pdfPageTag(0))
            .assertContentDescriptionEquals("Page 1 of 3, No text on this page (scan).")
        rule.onNodeWithTag(pdfTextTag(0), useUnmergedTree = true).assertDoesNotExist()
    }

    @Test
    @Config(sdk = [34])
    public fun `an older Android explains that page text is unavailable`() {
        show(FakePdf(readsText = false))

        rule.onNodeWithTag(pdfPageTag(0))
            .assertContentDescriptionEquals("Page 1 of 3, Page text requires Android 15 or later.")
        rule.onNodeWithTag(pdfTextTag(0), useUnmergedTree = true).assertDoesNotExist()
        rule.onNodeWithTag(PDF_FIND_TAG).assertDoesNotExist()
    }

    @Test
    public fun `links are named buttons with their own actions and reading order`() {
        val model = show(
            FakePdf(
                pageLinks = mapOf(
                    0 to listOf(
                        PdfLink.External("https://example.com/a", listOf(PdfRect(10f, 10f, 200f, 40f))),
                        PdfLink.Page(2, listOf(PdfRect(10f, 50f, 200f, 80f))),
                        PdfLink.External("file:///other.pdf", listOf(PdfRect(10f, 90f, 200f, 120f))),
                    ),
                ),
            ),
        )

        listOf("https://example.com/a", "Go to page 3", "file:///other.pdf").forEachIndexed { index, name ->
            rule.onNodeWithTag(pdfLinkTag(0, index), useUnmergedTree = true)
                .assertContentDescriptionEquals(name)
                .assert(SemanticsMatcher.expectValue(SemanticsProperties.Role, Role.Button))
                .assert(SemanticsMatcher.expectValue(SemanticsProperties.TraversalIndex, (index + 1).toFloat()))
        }
        rule.onNodeWithTag(pdfLinkTag(0, 0), useUnmergedTree = true)
            .performSemanticsAction(SemanticsActions.OnClick) { assertTrue(it()) }
        rule.waitForIdle()
        assertEquals(listOf("https://example.com/a"), opened)

        rule.onNodeWithTag(pdfLinkTag(0, 2), useUnmergedTree = true)
            .performSemanticsAction(SemanticsActions.OnClick) { assertTrue(it()) }
        rule.waitForIdle()
        assertTrue(model.state.value.linkRefused)
        rule.onNodeWithTag(PDF_LINK_REFUSED_TAG).assertIsDisplayed()
        assertEquals("a refused scheme never reaches Android", 1, opened.size)

        rule.onNodeWithTag(pdfLinkTag(0, 1), useUnmergedTree = true)
            .performSemanticsAction(SemanticsActions.OnClick) { assertTrue(it()) }
        rule.waitForIdle()
        assertEquals(2, model.state.value.pageRequest?.index)
        waitForPage(2)
    }

    @Test
    public fun `a coordinate tap follows the same link before and after zooming`() {
        val uri = "https://example.com/a"
        val model = show(
            FakePdf(
                pageLinks = mapOf(
                    0 to listOf(PdfLink.External(uri, listOf(PdfRect(240f, 380f, 340f, 460f)))),
                ),
            ),
        )

        rule.onNodeWithTag(pdfPageTag(0)).performTouchInput {
            click(Offset(width * 290f / 595, width * 420f / 595))
        }
        rule.mainClock.advanceTimeBy(400)
        rule.waitUntil(5_000) { opened.size == 1 }
        assertEquals(listOf(uri), opened)

        rule.onNodeWithTag(pdfPageTag(0)).performTouchInput { doubleClick() }
        rule.waitForIdle()
        val viewport = model.state.value.viewport(0)
        assertEquals(2.5f, viewport.zoom, 0f)
        rule.mainClock.advanceTimeBy(400)
        assertEquals("double tap changes zoom without following the link", 1, opened.size)

        rule.onNodeWithTag(pdfPageTag(0)).performTouchInput {
            click(
                Offset(
                    width * viewport.zoom * 290f / 595 - viewport.panX,
                    width * viewport.zoom * 420f / 595 - viewport.panY,
                ),
            )
        }
        rule.mainClock.advanceTimeBy(400)
        rule.waitUntil(5_000) { opened.size == 2 }
        assertEquals(listOf(uri, uri), opened)
    }

    @Test
    public fun `page buttons navigate without coordinates and stop at the document boundaries`() {
        val model = show()
        rule.onNodeWithTag(PDF_PREVIOUS_PAGE_TAG).assertIsNotEnabled()
        rule.onNodeWithTag(PDF_NEXT_PAGE_TAG).assertIsEnabled().performClick()
        rule.waitForIdle()

        assertEquals(1, model.state.value.pageRequest?.index)
        rule.onNodeWithTag(PDF_PAGE_TAG).assertTextEquals("Page 2 of 3")
        rule.onNodeWithTag(PDF_PREVIOUS_PAGE_TAG).assertIsEnabled().performClick()
        rule.waitForIdle()
        assertEquals(0, model.state.value.pageRequest?.index)

        rule.onNodeWithTag(PDF_NEXT_PAGE_TAG).performClick()
        rule.waitForIdle()
        rule.onNodeWithTag(PDF_NEXT_PAGE_TAG).performClick()
        rule.waitForIdle()
        assertEquals(2, model.state.value.pageRequest?.index)
        rule.onNodeWithTag(PDF_NEXT_PAGE_TAG).assertIsNotEnabled()
        rule.onNodeWithTag(PDF_PAGE_TAG).assertTextEquals("Page 3 of 3")
    }

    @Test
    public fun `TalkBack offers only valid page navigation actions`() {
        val model = show()
        assertFalse(actions(0).contains("Previous page"))
        assertTrue(actions(0).contains("Next page"))

        performPageAction(0, "Next page")
        assertEquals(1, model.state.value.pageRequest?.index)
        waitForPage(1)
        assertTrue(actions(1).contains("Previous page"))
        performPageAction(1, "Next page")
        waitForPage(2)
        assertEquals(2, model.state.value.pageRequest?.index)
        assertFalse(actions(2).contains("Next page"))
    }

    @Test
    public fun `find still searches text and brings the next matching page on screen`() {
        val model = show(FakePdf(pageText = listOf("Vault on one", "ordinary page", "Vault on three")))

        rule.onNodeWithTag(PDF_FIND_TAG).performClick()
        rule.onNodeWithTag(PDF_FIND_FIELD_TAG).performTextReplacement("vault")
        rule.onNodeWithTag(PDF_FIND_FIELD_TAG).performImeAction()
        rule.waitForIdle()
        rule.onNodeWithTag(PDF_FIND_COUNT_TAG).assertTextEquals("1 of 2")

        rule.onNodeWithTag(PDF_FIND_NEXT_TAG).performClick()
        rule.waitForIdle()
        assertEquals(2, model.state.value.pageRequest?.index)
        rule.onNodeWithTag(PDF_FIND_COUNT_TAG).assertTextEquals("2 of 2")
        rule.onNodeWithTag(PDF_FIND_DONE_TAG).performClick()
        rule.onNodeWithTag(PDF_FIND_FIELD_TAG).assertDoesNotExist()
    }

    @Test
    public fun `a wrong password is explained and the corrected password opens the PDF`() {
        val model = show { _, password ->
            when (password) {
                null -> throw PdfProtected()
                "secret" -> FakePdf()
                else -> throw PdfWrongPassword()
            }
        }

        rule.onNodeWithTag(PDF_PASSWORD_TAG).performTextReplacement("wrong")
        rule.onNodeWithTag(PDF_OPEN_TAG).performClick()
        rule.waitForIdle()
        assertEquals(PdfPreviewModel.Issue.WRONG_PASSWORD, model.state.value.issue)

        rule.onNodeWithTag(PDF_PASSWORD_TAG).performTextReplacement("secret")
        rule.onNodeWithTag(PDF_OPEN_TAG).performClick()
        waitForPage(0)
        rule.onNodeWithTag(PDF_PASSWORD_TAG).assertDoesNotExist()
        rule.onNodeWithTag(pdfPageTag(0)).assertContentDescriptionEquals("Page 1 of 3")
    }

    @Test
    public fun `a damaged PDF keeps its explanation instead of showing an empty page`() {
        show { _, _ -> throw PdfDamaged(null) }

        rule.onNodeWithTag(PDF_ISSUE_TAG)
            .assertTextEquals("This PDF could not be opened. The file may be damaged or incomplete.")
            .assertIsDisplayed()
        rule.onNodeWithTag(pdfPageTag(0)).assertDoesNotExist()
    }
}
