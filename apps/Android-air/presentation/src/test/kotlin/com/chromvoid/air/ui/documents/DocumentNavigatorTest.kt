package com.chromvoid.air.ui.documents

import com.chromvoid.air.ui.credentials.modelScope
import com.chromvoid.air.ui.files.FakeFileStore
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
public class DocumentNavigatorTest {
    private val markdown = FakeMarkdown()

    private val store = FakeFileStore().apply {
        file("Plan.md", "[a](note:Packing)\n[b](scan.png)\n[c](a.pdf)\n[d](a.zip)".encodeToByteArray())
        file("Packing.md", "# Socks\n[e](note:Packing)".encodeToByteArray(), parent = "/Lists")
        file("scan.png", size = 12, mimeType = "image/png")
        file("a.pdf", size = 12, mimeType = "application/pdf")
        file("a.zip", size = 12, mimeType = "application/zip")
        listOf("Packing" to "Packing.md", "scan.png" to "scan.png", "a.pdf" to "a.pdf", "a.zip" to "a.zip")
            .forEach { (link, name) -> links[link] = named(name).id }
    }

    private fun TestScope.navigator(): DocumentNavigator {
        val scope = modelScope()
        return DocumentNavigator(store, store.named("Plan.md").id, 1uL, scope) { id, anchor ->
            DocumentModel(store, id, 1uL, scope, anchor, parse = markdown::parse, toggle = markdown::toggle)
        }.also { navigator ->
            navigator.stack.value.single().load()
            advanceUntilIdle()
        }
    }

    private fun TestScope.follow(model: DocumentModel, link: Int) {
        val nodes = model.state.value.preview!!.nodes.withIndex()
            .filter { it.value.content.kind == com.chromvoid.air.bridge.wire.MarkdownContentKind.Link }
        model.activateLink(nodes[link].index)
        advanceUntilIdle()
    }

    @Test
    public fun `a note link opens the note over the document and back returns`(): Unit = runTest {
        val navigator = navigator()
        val root = navigator.stack.value.single()

        follow(root, 0)
        val linked = navigator.stack.value.last()
        assertEquals(2, navigator.stack.value.size)
        linked.load()
        advanceUntilIdle()
        assertEquals("Packing.md", linked.state.value.name)

        // Only the document on top follows its links.
        follow(root, 0)
        assertEquals(2, navigator.stack.value.size)

        navigator.pop()
        assertEquals(listOf(root), navigator.stack.value)
        assertEquals(DocumentModel.Phase.REVOKED, linked.state.value.phase)
        navigator.pop()
        assertEquals(1, navigator.stack.value.size)
    }

    @Test
    public fun `linked images, PDFs and other files open their viewer over the stack`(): Unit = runTest {
        val navigator = navigator()
        val root = navigator.stack.value.single()

        follow(root, 1)
        assertTrue(navigator.viewer.value is DocumentNavigator.Viewer.Images)
        // A link under an open viewer does nothing.
        follow(root, 2)
        assertTrue(navigator.viewer.value is DocumentNavigator.Viewer.Images)
        navigator.closeViewer()

        follow(root, 2)
        assertTrue(navigator.viewer.value is DocumentNavigator.Viewer.Pdf)
        navigator.closeViewer()

        follow(root, 3)
        val info = navigator.viewer.value as DocumentNavigator.Viewer.Information
        assertEquals("a.zip", info.item.name)
        navigator.closeViewer()
        assertNull(navigator.viewer.value)
        assertEquals(1, navigator.stack.value.size)
    }

    @Test
    public fun `closing drops every document and viewer`(): Unit = runTest {
        val navigator = navigator()
        val root = navigator.stack.value.single()
        follow(root, 1)
        root.setMode(DocumentModel.Mode.SOURCE)
        root.setText("changed")
        assertTrue(navigator.hasUnsavedChanges)

        navigator.close()

        assertTrue(navigator.stack.value.isEmpty())
        assertNull(navigator.viewer.value)
        assertEquals(DocumentModel.Phase.REVOKED, root.state.value.phase)
        assertFalse(navigator.hasUnsavedChanges)
    }
}
