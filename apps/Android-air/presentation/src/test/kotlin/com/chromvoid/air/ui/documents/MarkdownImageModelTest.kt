package com.chromvoid.air.ui.documents

import com.chromvoid.air.bridge.wire.MarkdownContentKind
import com.chromvoid.air.ui.credentials.modelScope
import com.chromvoid.air.ui.files.FakeFileStore
import com.chromvoid.air.ui.media.ImagePreviewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
public class MarkdownImageModelTest {
    private val markdown = FakeMarkdown()

    private val store = FakeFileStore().apply {
        documentByteLimit = 4096
        file("Plan.md", "![Beach](/attachments/beach.png)\n![Gone](/gone.png)\n![Doc](/a.pdf)".encodeToByteArray())
        file("beach.png", size = 12, parent = "/attachments", mimeType = "image/png")
        file("a.pdf", size = 12, mimeType = "application/pdf")
        links["/attachments/beach.png"] = named("beach.png").id
        links["/a.pdf"] = named("a.pdf").id
    }

    private fun TestScope.note(): DocumentModel = DocumentModel(
        store,
        store.named("Plan.md").id,
        1uL,
        modelScope(),
        parse = markdown::parse,
        toggle = markdown::toggle,
    ).also {
        it.load()
        advanceUntilIdle()
    }

    private fun DocumentModel.images(): List<Int> = state.value.preview!!.nodes.withIndex()
        .filter { it.value.content.kind == MarkdownContentKind.Image }
        .map { it.index }

    @Test
    public fun `an image the note names is resolved by Core and read once`(): Unit = runTest {
        val model = note()
        val digest = model.state.value.preview!!.sourceDigest
        val (beach, gone, pdf) = model.images()

        val image = model.inlineImage(beach, digest)
        assertNotNull(image)
        advanceUntilIdle()
        val preview = image!!.state.value.preview
        assertEquals(store.named("beach.png").id, preview?.nodeId)
        assertSame(image, model.inlineImage(beach, digest))
        assertEquals(1, store.calls.count { it == "link:/attachments/beach.png" })

        val missing = model.inlineImage(gone, digest)
        val notImage = model.inlineImage(pdf, digest)
        advanceUntilIdle()
        assertTrue(missing!!.state.value.unavailable)
        assertTrue(notImage!!.state.value.unavailable)
    }

    @Test
    public fun `only images of the preview on screen are admitted, and leaving releases them`(): Unit = runTest {
        val model = note()
        val digest = model.state.value.preview!!.sourceDigest
        val beach = model.images().first()

        assertNull(model.inlineImage(beach, "another preview"))
        // Node 0 is the paragraph around the first image.
        assertNull(model.inlineImage(0, digest))

        val image = model.inlineImage(beach, digest)!!
        advanceUntilIdle()
        val preview = image.state.value.preview!!
        model.releaseInlineImage(beach, digest)
        assertEquals(ImagePreviewModel.Status.REVOKED, preview.state.value.status)

        val again = model.inlineImage(beach, digest)!!
        advanceUntilIdle()
        model.setMode(DocumentModel.Mode.SOURCE)
        assertNull(again.state.value.preview)
        assertFalse(again.state.value.unavailable)
        assertNull(model.inlineImage(beach, digest))
    }
}
