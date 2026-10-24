package com.chromvoid.air

import android.app.Activity
import android.app.Instrumentation
import android.content.Intent
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.net.Uri
import android.os.Build
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithTag
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performImeAction
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTouchInput
import androidx.test.espresso.intent.Intents
import androidx.test.espresso.intent.Intents.intended
import androidx.test.espresso.intent.Intents.intending
import androidx.test.espresso.intent.matcher.IntentMatchers.hasAction
import androidx.test.espresso.intent.matcher.IntentMatchers.hasData
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.chromvoid.air.session.AirAppGraph
import com.chromvoid.air.session.SafFileDevice
import com.chromvoid.air.ui.AccessOutcome
import com.chromvoid.air.ui.AirSessionState
import com.chromvoid.air.ui.files.fileRowTag
import com.chromvoid.air.ui.media.PDF_CLOSE_TAG
import com.chromvoid.air.ui.media.PDF_FIND_COUNT_TAG
import com.chromvoid.air.ui.media.PDF_FIND_DONE_TAG
import com.chromvoid.air.ui.media.PDF_FIND_FIELD_TAG
import com.chromvoid.air.ui.media.PDF_FIND_NEXT_TAG
import com.chromvoid.air.ui.media.PDF_FIND_TAG
import com.chromvoid.air.ui.media.PDF_ISSUE_TAG
import com.chromvoid.air.ui.media.PDF_PAGE_TAG
import com.chromvoid.air.ui.media.pdfDrawnTag
import com.chromvoid.air.ui.media.pdfPageTag
import java.io.ByteArrayOutputStream
import java.io.File
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

/**
 * Route A29 for PDFs against real Core: a three-page PDF imported into the
 * vault opens from Files, its first page is drawn by the platform renderer
 * from an anonymous memory file, the reader sees where they are, and Done
 * returns to the folder.
 */
@RunWith(AndroidJUnit4::class)
public class PdfRouteInstrumentationTest {
    @get:Rule
    public val rule = createAndroidComposeRule<MainActivity>()

    private val session get() = AirAppGraph.of(rule.activity).session

    @Test
    public fun aPdfOpensAndItsPagesAreDrawn() {
        assumeTrue(
            "the preview renders from an anonymous memory file, which Android 11 added",
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.R,
        )
        openImported()
        awaitNode(pdfDrawnTag(0), DRAW_TIMEOUT_MILLIS)
        rule.onNodeWithTag(PDF_PAGE_TAG).assertTextEquals("Page 1 of $PAGES")

        rule.onNodeWithTag(PDF_CLOSE_TAG).performClick()
        awaitNode(fileRowTag(NAME))
        assertEquals(0, rule.onAllNodesWithTag(pdfDrawnTag(0)).fetchSemanticsNodes().size)
    }

    /** Below Android 11 the preview says why it is not offered and where to open the PDF instead. */
    @Test
    public fun belowAndroid11ThePreviewSaysWhy() {
        assumeTrue("Android 11 and later preview the PDF", Build.VERSION.SDK_INT < Build.VERSION_CODES.R)
        openImported()
        awaitNode(PDF_ISSUE_TAG)
        assertEquals(0, rule.onAllNodesWithTag(pdfDrawnTag(0)).fetchSemanticsNodes().size)
    }

    /** The test's PDF, imported into Files and opened from its row. */
    private fun openImported() {
        val generation = unlocked()
        val picked = File(rule.activity.cacheDir, NAME).apply { writeBytes(pdf(PAGES)) }
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
    }

    /**
     * Find in PDF and its links, where the device reads a PDF's text (Android 15 and later): the
     * word is found on two pages and each match brings its page on screen; a link to another page
     * turns to it; a web link goes to the system to open.
     */
    @Test
    public fun findGoesThroughTheMatchesAndLinksTurnOrOpen() {
        assumeTrue(
            "PDF text and links need Android 15",
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM,
        )
        val generation = unlocked()
        val picked = File(rule.activity.cacheDir, LINKED).apply { writeBytes(linkedPdf()) }
        try {
            runBlocking {
                val source = SafFileDevice(rule.activity).source(Uri.fromFile(picked))
                session.files.importFile(source, "/", generation) { _, _ -> }
            }
        } finally {
            picked.delete()
        }
        rule.onNodeWithTag("root-files").performClick()
        awaitNode(fileRowTag(LINKED))
        rule.onNodeWithTag(fileRowTag(LINKED)).performClick()
        awaitNode(pdfDrawnTag(0), DRAW_TIMEOUT_MILLIS)

        rule.onNodeWithTag(PDF_FIND_TAG).performClick()
        awaitNode(PDF_FIND_FIELD_TAG)
        rule.onNodeWithTag(PDF_FIND_FIELD_TAG).performTextInput("vault")
        rule.onNodeWithTag(PDF_FIND_FIELD_TAG).performImeAction()
        awaitText(PDF_FIND_COUNT_TAG, "1 of 2")
        rule.onNodeWithTag(PDF_FIND_NEXT_TAG).performClick()
        awaitText(PDF_FIND_COUNT_TAG, "2 of 2")
        awaitText(PDF_PAGE_TAG, "Page 3 of 5")
        rule.onNodeWithTag(PDF_FIND_DONE_TAG).performClick()

        // Back on the first page, the link below the heading turns to the third.
        rule.onNodeWithTag(PDF_FIND_TAG).performClick()
        rule.onNodeWithTag(PDF_FIND_FIELD_TAG).performTextInput("ChromVoid")
        rule.onNodeWithTag(PDF_FIND_FIELD_TAG).performImeAction()
        awaitText(PDF_FIND_COUNT_TAG, "1 of 1")
        awaitText(PDF_PAGE_TAG, "Page 1 of 5")
        rule.onNodeWithTag(PDF_FIND_DONE_TAG).performClick()
        Intents.init()
        try {
            val opened = Instrumentation.ActivityResult(Activity.RESULT_OK, null)
            intending(hasAction(Intent.ACTION_VIEW)).respondWith(opened)
            tapOnFirstPage(LINK_X, WEB_LINK_Y)
            rule.waitUntil(NODE_TIMEOUT_MILLIS) {
                runCatching { intended(hasData("https://example.com/")) }.isSuccess
            }
            tapOnFirstPage(LINK_X, PAGE_LINK_Y)
            awaitText(PDF_PAGE_TAG, "Page 3 of 5")
        } finally {
            Intents.release()
        }
    }

    /** A tap at [x], [y] points from the first page's top left, as the page is drawn now. */
    private fun tapOnFirstPage(x: Float, y: Float) {
        rule.onNodeWithTag(pdfPageTag(0)).performTouchInput {
            click(Offset(width * x / PAGE_WIDTH, height * y / PAGE_HEIGHT))
        }
    }

    private fun awaitText(tag: String, text: String) {
        rule.waitUntil(NODE_TIMEOUT_MILLIS) {
            rule.onAllNodesWithTag(tag).fetchSemanticsNodes().any { node ->
                node.config.getOrNull(SemanticsProperties.Text)?.joinToString("") == text
            }
        }
    }

    /**
     * Five pages of Helvetica text with "vault" on the first and the third; on the first a web link
     * over its heading and, below it, a link to the third page. Written by hand: the platform's
     * PDF writer adds no links. Link rectangles are in PDF points from the bottom left. The page
     * link is a GoTo action: Android's PDF reader reports those, not a bare /Dest.
     */
    private fun linkedPdf(): ByteArray {
        val texts = listOf("ChromVoid vault", "Page two", "Third vault page", "Page four", "Page five")
        val pages = texts.indices.map { 3 + it }
        val font = 3 + texts.size
        val contents = font + 1
        val links = contents + texts.size
        val objects = mutableListOf(
            "<< /Type /Catalog /Pages 2 0 R >>",
            "<< /Type /Pages /Kids [${pages.joinToString(" ") { "$it 0 R" }}] /Count ${texts.size} >>",
        )
        texts.indices.forEach { index ->
            val annots = if (index == 0) " /Annots [$links 0 R ${links + 1} 0 R]" else ""
            objects += "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] " +
                "/Resources << /Font << /F1 $font 0 R >> >> /Contents ${contents + index} 0 R$annots >>"
        }
        objects += "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
        texts.forEachIndexed { index, text ->
            val next = if (index == 0) "BT /F1 24 Tf 72 600 Td (Third page) Tj ET\n" else ""
            val stream = "BT /F1 24 Tf 72 700 Td ($text) Tj ET\n$next"
            objects += "<< /Length ${stream.length} >>\nstream\n${stream}endstream"
        }
        objects += "<< /Type /Annot /Subtype /Link /Rect [72 690 320 724] /Border [0 0 0] " +
            "/A << /S /URI /URI (https://example.com/) >> >>"
        objects += "<< /Type /Annot /Subtype /Link /Rect [72 590 320 624] /Border [0 0 0] " +
            "/A << /S /GoTo /D [${pages[2]} 0 R /XYZ 0 792 0] >> >>"
        val out = StringBuilder("%PDF-1.4\n")
        val offsets = objects.mapIndexed { index, body ->
            out.length.also { out.append("${index + 1} 0 obj\n$body\nendobj\n") }
        }
        val xref = out.length
        out.append("xref\n0 ${objects.size + 1}\n0000000000 65535 f \n")
        offsets.forEach { out.append("%010d 00000 n \n".format(it)) }
        out.append("trailer\n<< /Size ${objects.size + 1} /Root 1 0 R >>\nstartxref\n$xref\n%%EOF\n")
        return out.toString().toByteArray(Charsets.US_ASCII)
    }

    private fun pdf(pages: Int): ByteArray {
        val document = PdfDocument()
        val paint = Paint().apply { textSize = 28f }
        repeat(pages) { index ->
            val page = document.startPage(PdfDocument.PageInfo.Builder(595, 842, index + 1).create())
            page.canvas.drawText("ChromVoid page ${index + 1}", 72f, 120f, paint)
            document.finishPage(page)
        }
        return ByteArrayOutputStream().use { out ->
            document.writeTo(out)
            document.close()
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

    private fun awaitNode(tag: String, timeout: Long = NODE_TIMEOUT_MILLIS) {
        rule.waitUntil(timeout) { rule.onAllNodesWithTag(tag).fetchSemanticsNodes().isNotEmpty() }
    }

    private fun awaitState(accept: (AirSessionState) -> Boolean) {
        val deadline = System.nanoTime() + STATE_TIMEOUT_NANOS
        while (!accept(session.state.value)) {
            check(System.nanoTime() < deadline) { "session still ${session.state.value}" }
            Thread.sleep(POLL_MILLIS)
        }
    }

    private companion object {
        const val LINKED = "linked.pdf"
        const val PAGE_WIDTH = 612f
        const val PAGE_HEIGHT = 792f
        const val LINK_X = 150f

        /** The middles of the two links, in points from the page's top left: 792 - 707 and 792 - 607. */
        const val WEB_LINK_Y = 85f
        const val PAGE_LINK_Y = 185f
        const val ADMINISTRATOR = "air-instrumentation-administrator"
        const val VAULT = "air-instrumentation-vault"
        const val NAME = "Statement.pdf"
        const val PAGES = 3
        const val NODE_TIMEOUT_MILLIS = 15_000L
        const val DRAW_TIMEOUT_MILLIS = 30_000L
        const val STATE_TIMEOUT_NANOS = 15_000_000_000L
        const val POLL_MILLIS = 50L
    }
}
