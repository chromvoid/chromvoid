package com.chromvoid.air.ui.documents

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.wire.CatalogFileLinkItem
import com.chromvoid.air.bridge.wire.MarkdownContentKind
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.credentials.modelScope
import com.chromvoid.air.ui.files.FakeFileStore
import com.chromvoid.air.ui.files.FileIssue
import com.chromvoid.air.ui.files.FileSettings
import com.chromvoid.air.ui.files.MemoryFilePreferences
import com.chromvoid.air.ui.files.MemorySource
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class DocumentModelTest {
    private val markdown = FakeMarkdown()

    private fun TestScope.document(
        store: FakeFileStore,
        name: String,
        anchor: String? = null,
        settings: FileSettings? = null,
        onSaved: () -> Unit = {},
    ): DocumentModel = DocumentModel(
        store,
        store.named(name).id,
        1uL,
        modelScope(),
        anchor,
        parse = markdown::parse,
        toggle = markdown::toggle,
        settings = settings,
        onSaved = onSaved,
    ).also {
        it.load()
        advanceUntilIdle()
    }

    private fun FakeFileStore.note(name: String, text: String, parent: String = "/"): FakeFileStore.Node =
        file(name, text.encodeToByteArray(), parent, if (name.endsWith(".md")) "text/markdown" else "text/plain")

    private val DocumentModel.phase: DocumentModel.Phase get() = state.value.phase

    @Test
    public fun `a note opens in preview with Core's parse and plain text opens as source`(): Unit = runTest {
        val store = FakeFileStore().apply {
            note("Plan.md", "# Trip\nPack bags")
            note("todo.txt", "milk")
        }

        val note = document(store, "Plan.md")
        assertEquals(DocumentModel.Phase.EDITING, note.phase)
        assertEquals(DocumentModel.Mode.PREVIEW, note.state.value.mode)
        assertTrue(note.state.value.markdown)
        assertEquals(listOf("# Trip\nPack bags"), markdown.parsed)
        assertEquals(2, note.state.value.preview?.roots?.size)

        val text = document(store, "todo.txt")
        assertEquals(DocumentModel.Mode.SOURCE, text.state.value.mode)
        assertFalse(text.state.value.markdown)
        assertNull(text.state.value.preview)
        assertEquals(1, markdown.parsed.size)
    }

    @Test
    public fun `an edit is saved at the revision it was read at and a clean save only confirms`(): Unit = runTest {
        val store = FakeFileStore().apply { note("todo.txt", "milk") }
        var saves = 0
        val model = document(store, "todo.txt") { saves++ }

        model.setText("milk, eggs")
        assertTrue(model.state.value.dirty)
        model.save()
        assertEquals(DocumentModel.Phase.SAVING, model.phase)
        advanceUntilIdle()

        assertEquals(DocumentModel.Phase.EDITING, model.phase)
        assertTrue(model.state.value.saved)
        assertFalse(model.state.value.dirty)
        assertEquals("milk, eggs", store.named("todo.txt").content.decodeToString())
        assertEquals(1, saves)

        model.save()
        advanceUntilIdle()
        assertEquals(1, store.calls.count { it.startsWith("save:") })
        assertTrue(model.state.value.saved)

        // The next save names the revision the last one produced.
        model.setText("bread")
        model.save()
        advanceUntilIdle()
        assertEquals(listOf("save:1:1", "save:1:2"), store.calls.filter { it.startsWith("save:") })
    }

    @Test
    public fun `a file changed elsewhere shows both versions and the person chooses`(): Unit = runTest {
        val store = FakeFileStore().apply { note("todo.txt", "milk") }
        val id = store.named("todo.txt").id
        val model = document(store, "todo.txt")

        model.setText("my draft")
        store.saveElsewhere(id, "their change")
        model.save()
        advanceUntilIdle()

        assertEquals(DocumentModel.Phase.CONFLICT, model.phase)
        assertEquals(DocumentModel.Issue.CONFLICT, model.state.value.issue)
        assertEquals("their change", model.state.value.conflict?.text)
        assertEquals("my draft", model.state.value.text)

        // Keep editing leaves the choice for later: the next save compares again.
        model.keepEditing()
        assertEquals(DocumentModel.Phase.EDITING, model.phase)
        model.save()
        advanceUntilIdle()
        assertEquals(DocumentModel.Phase.CONFLICT, model.phase)

        model.useMyDraft()
        advanceUntilIdle()
        assertEquals(DocumentModel.Phase.EDITING, model.phase)
        assertTrue(model.state.value.saved)
        assertEquals("my draft", store.named("todo.txt").content.decodeToString())
    }

    @Test
    public fun `the saved version can replace the draft`(): Unit = runTest {
        val store = FakeFileStore().apply { note("Plan.md", "# Trip") }
        val id = store.named("Plan.md").id
        var saves = 0
        val model = document(store, "Plan.md") { saves++ }

        model.setMode(DocumentModel.Mode.SOURCE)
        model.setText("# Mine")
        store.saveElsewhere(id, "# Theirs")
        model.save()
        advanceUntilIdle()
        model.setMode(DocumentModel.Mode.PREVIEW)
        assertEquals(DocumentModel.Mode.SOURCE, model.state.value.mode)

        model.useSavedVersion()
        advanceUntilIdle()
        assertEquals(DocumentModel.Phase.EDITING, model.phase)
        assertEquals("# Theirs", model.state.value.text)
        assertFalse(model.state.value.dirty)
        assertEquals(1, saves)
        assertEquals("# Theirs", store.named("Plan.md").content.decodeToString())

        // The saved version is now the base: a save after it is not a conflict.
        model.setText("# Theirs, edited")
        model.save()
        advanceUntilIdle()
        assertTrue(model.state.value.saved)
    }

    @Test
    public fun `a save Core never confirmed keeps the draft and offers the comparison`(): Unit = runTest {
        val store = FakeFileStore().apply { note("todo.txt", "milk") }
        val model = document(store, "todo.txt")

        model.setText("eggs")
        store.failNext = java.io.IOException("lost")
        model.save()
        advanceUntilIdle()

        assertEquals(DocumentModel.Phase.UNCERTAIN, model.phase)
        assertEquals(DocumentModel.Issue.UNCERTAIN, model.state.value.issue)
        assertEquals("eggs", model.state.value.text)
        assertFalse(model.requestClose().also { model.cancelClose() })

        model.compareSavedVersion()
        advanceUntilIdle()
        assertEquals(DocumentModel.Phase.CONFLICT, model.phase)
        assertEquals("milk", model.state.value.conflict?.text)
    }

    @Test
    public fun `a draft over the document limit is not sent`(): Unit = runTest {
        val store = FakeFileStore().apply { note("todo.txt", "milk") }
        val model = document(store, "todo.txt")

        model.setText("x".repeat(store.documentByteLimit.toInt() + 1))
        model.save()
        advanceUntilIdle()

        assertEquals(DocumentModel.Phase.EDITING, model.phase)
        assertEquals(DocumentModel.Issue.TOO_LARGE, model.state.value.issue)
        assertTrue(store.calls.none { it.startsWith("save:") })
    }

    @Test
    public fun `a read that fails says why and can be tried again`(): Unit = runTest {
        val store = FakeFileStore().apply {
            note("big.txt", "x".repeat(80))
            file("blob.txt", byteArrayOf(0, 1, 2), mimeType = "text/plain")
            note("gone.txt", "soon")
        }

        assertEquals(DocumentModel.Issue.TOO_LARGE, document(store, "big.txt").state.value.issue)
        assertEquals(DocumentModel.Issue.NOT_TEXT, document(store, "blob.txt").state.value.issue)

        store.failNext = CoreRefusal("NODE_NOT_FOUND", "catalog:file:read")
        val gone = document(store, "gone.txt")
        assertEquals(DocumentModel.Phase.FAILED, gone.phase)
        assertEquals(FileIssue.MISSING, gone.state.value.refusal)

        gone.load()
        advanceUntilIdle()
        assertEquals(DocumentModel.Phase.EDITING, gone.phase)
        assertEquals("soon", gone.state.value.text)
    }

    @Test
    public fun `a lock during the read revokes the document`(): Unit = runTest {
        val store = FakeFileStore().apply { note("todo.txt", "milk") }
        store.failNext = BridgeException.SessionRevoked()

        val model = document(store, "todo.txt")

        assertEquals(DocumentModel.Phase.REVOKED, model.phase)
        assertEquals("", model.state.value.text)
    }

    @Test
    public fun `a task ticks through Core's task editor and stays unsaved`(): Unit = runTest {
        val store = FakeFileStore().apply { note("List.md", "- [ ] milk\n- [x] eggs") }
        val model = document(store, "List.md")
        val tasks = model.state.value.preview!!.nodes.withIndex()
            .filter { it.value.content.kind == MarkdownContentKind.Task }
            .map { it.index }

        model.toggleTask(tasks[0])
        advanceUntilIdle()
        assertEquals("- [x] milk\n- [x] eggs", model.state.value.text)
        assertTrue(model.state.value.dirty)

        val second = model.state.value.preview!!.nodes.withIndex()
            .filter { it.value.content.kind == MarkdownContentKind.Task }
            .map { it.index }[1]
        model.toggleTask(second)
        advanceUntilIdle()
        assertEquals("- [x] milk\n- [ ] eggs", model.state.value.text)
        assertEquals("- [ ] milk\n- [x] eggs", store.named("List.md").content.decodeToString())
    }

    @Test
    public fun `source edits drop the preview until preview is chosen again`(): Unit = runTest {
        val store = FakeFileStore().apply { note("Plan.md", "# Trip") }
        val model = document(store, "Plan.md")

        model.setMode(DocumentModel.Mode.SOURCE)
        model.setText("# Trip\nBags")
        assertNull(model.state.value.preview)

        model.setMode(DocumentModel.Mode.PREVIEW)
        advanceUntilIdle()
        assertEquals(2, model.state.value.preview?.roots?.size)
        assertEquals("# Trip\nBags", markdown.parsed.last())
    }

    @Test
    public fun `external links go to the system and headings scroll`(): Unit = runTest {
        val store = FakeFileStore().apply {
            note("Plan.md", "# Trip\n[site](https://example.com)\n[top](#trip)\n[x](#nowhere)")
        }
        val model = document(store, "Plan.md")
        val links = model.linkNodes()

        assertEquals("https://example.com", model.activateLink(links[0]))

        assertNull(model.activateLink(links[1]))
        val jump = model.state.value.anchorJump
        assertEquals(0, jump?.node)
        model.activateLink(links[1])
        assertEquals((jump?.serial ?: 0) + 1, model.state.value.anchorJump?.serial)

        model.activateLink(links[2])
        assertEquals(DocumentModel.PreviewIssue.NO_ANCHOR, model.state.value.previewIssue)
    }

    @Test
    public fun `a note link is resolved by Core and handed on, and a missing one is explained`(): Unit = runTest {
        val store = FakeFileStore().apply {
            note("Plan.md", "[p](note:Packing)\n[l](note:Lost)\n[s](Plan.md#trip)\n# Trip")
            note("Packing.md", "socks", parent = "/Lists")
            links["Packing"] = named("Packing.md").id
            links["Plan.md"] = named("Plan.md").id
        }
        val model = document(store, "Plan.md")
        val opened = mutableListOf<Pair<CatalogFileLinkItem, String?>>()
        model.onNavigate = { item, anchor -> opened += item to anchor }
        val links = model.linkNodes()

        model.activateLink(links[0])
        assertTrue(model.state.value.resolvingLink)
        advanceUntilIdle()
        assertEquals(listOf("Packing.md"), opened.map { it.first.name })
        assertFalse(model.state.value.resolvingLink)

        model.activateLink(links[1])
        advanceUntilIdle()
        assertEquals(DocumentModel.PreviewIssue.LINK_MISSING, model.state.value.previewIssue)

        // A link back into the same document with a heading scrolls instead of opening it again.
        model.activateLink(links[2])
        advanceUntilIdle()
        assertEquals(1, opened.size)
        assertNotNull(model.state.value.anchorJump)
    }

    @Test
    public fun `a document opened at a heading jumps to it`(): Unit = runTest {
        val store = FakeFileStore().apply { note("Plan.md", "Intro\n# Packing") }

        val model = document(store, "Plan.md", anchor = "packing")

        assertEquals(
            1,
            model.state.value.anchorJump?.node?.let { model.state.value.preview!!.roots.indexOf(it.toLong()) },
        )
    }

    @Test
    public fun `closing a changed draft asks first`(): Unit = runTest {
        val store = FakeFileStore().apply { note("todo.txt", "milk") }
        val model = document(store, "todo.txt")
        assertTrue(model.requestClose())

        model.setText("eggs")
        assertFalse(model.requestClose())
        assertTrue(model.state.value.confirmingClose)
        model.cancelClose()
        assertFalse(model.state.value.confirmingClose)

        model.close()
        assertEquals(DocumentModel.Phase.REVOKED, model.phase)
        assertEquals("", model.state.value.text)
    }

    @Test
    public fun `supported documents are text and Markdown`() {
        assertTrue(DocumentModel.supports("a.md", null))
        assertTrue(DocumentModel.supports("a.TXT", null))
        assertTrue(DocumentModel.supports("readme", "text/plain"))
        assertFalse(DocumentModel.supports("a.pdf", "application/pdf"))
        assertTrue(DocumentModel.isMarkdown("a", "text/markdown"))
        assertFalse(DocumentModel.isMarkdown("a.txt", "text/plain"))
    }

    private fun png(name: String): MemorySource = MemorySource(name, ByteArray(10) { it.toByte() }, "image/png")

    private fun TestScope.inSource(
        store: FakeFileStore,
        settings: FileSettings,
        onSaved: () -> Unit = {},
    ): DocumentModel =
        document(store, "Plan.md", settings = settings, onSaved = onSaved).also {
            it.setMode(DocumentModel.Mode.SOURCE)
            advanceUntilIdle()
        }

    @Test
    public fun `images are imported into the attachment folder and linked where the cursor was`(): Unit = runTest {
        val store = FakeFileStore().apply { note("Plan.md", "# Trip\nBags") }
        val settings = FileSettings(MemoryFilePreferences(attachmentFolder = "/Photos"))
        var saves = 0
        val model = inSource(store, settings) { saves++ }
        model.setSelection(7, 7)
        assertTrue(model.chooseImage())
        // The cursor may move while the picker is open; the images go where it was.
        model.setSelection(0, 0)

        val first = png("beach.png")
        val second = png("hotel.png")
        model.receiveImages(listOf(first, second))
        assertTrue(model.state.value.importingImage)
        assertFalse(model.requestClose())
        advanceUntilIdle()

        val state = model.state.value
        assertFalse(state.importingImage)
        assertNull(state.issue)
        assertEquals(
            listOf("attachment:/Photos:beach.png", "attachment:/Photos:hotel.png"),
            store.calls.filter { it.startsWith("attachment:") },
        )
        val links = store.nodes.filter { it.parent == "/Photos" }
            .map { "![${it.name.substringBefore('-')}](/Photos/${it.name})" }
        assertEquals("# Trip\n" + links.joinToString("\n") + "Bags", state.text)
        assertEquals(7 + links.joinToString("\n").length, state.selectionStart)
        assertTrue(state.dirty)
        assertTrue(first.closed && second.closed)
        assertEquals(1, saves)
    }

    @Test
    public fun `images are offered only in a note's source where they can be imported`(): Unit = runTest {
        val settings = FileSettings(MemoryFilePreferences())
        val store = FakeFileStore().apply {
            note("Plan.md", "# Trip")
            note("todo.txt", "milk")
        }

        val preview = document(store, "Plan.md", settings = settings)
        assertTrue(preview.state.value.canInsertImage)
        assertFalse(preview.chooseImage())
        assertFalse(document(store, "todo.txt", settings = settings).state.value.canInsertImage)
        val elsewhere = document(store, "Plan.md")
        elsewhere.setMode(DocumentModel.Mode.SOURCE)
        assertFalse(elsewhere.chooseImage())
    }

    @Test
    public fun `a failed image stops the rest and keeps the links before it`(): Unit = runTest {
        val store = FakeFileStore().apply { note("Plan.md", "") }
        val model = inSource(store, FileSettings(MemoryFilePreferences()))
        val refused = MemorySource("notes.txt", ByteArray(4), "text/plain")
        val last = png("last.png")

        model.receiveImages(listOf(png("first.png"), refused, last))
        advanceUntilIdle()

        assertEquals(DocumentModel.Issue.IMAGE_FAILED, model.state.value.issue)
        assertTrue(model.state.value.text.startsWith("![first](/attachments/first-"))
        assertFalse(model.state.value.text.contains("last"))
        assertTrue(refused.closed && last.closed)
        assertEquals(2, store.calls.count { it.startsWith("attachment:") })
    }

    @Test
    public fun `stop keeps the images already imported and links them`(): Unit = runTest {
        val store = FakeFileStore().apply { note("Plan.md", "") }
        val model = inSource(store, FileSettings(MemoryFilePreferences()))
        store.onAttachment = { name -> if (name == "first.png") model.cancelImageImport() }
        val second = png("second.png")
        val third = png("third.png")

        model.receiveImages(listOf(png("first.png"), second, third))
        advanceUntilIdle()

        assertEquals(DocumentModel.Issue.IMAGE_CANCELED, model.state.value.issue)
        assertTrue(model.state.value.text.startsWith("![first]"))
        assertEquals(1, store.nodes.count { it.parent == "/attachments" })
        assertTrue(second.closed && third.closed)
        assertEquals(DocumentModel.Phase.EDITING, model.phase)
    }

    @Test
    public fun `a lock during an import drops the draft and the rest`(): Unit = runTest {
        val store = FakeFileStore().apply { note("Plan.md", "") }
        val model = inSource(store, FileSettings(MemoryFilePreferences()))
        val second = png("second.png")
        store.onAttachment = { store.failNext = BridgeException.SessionRevoked() }

        model.receiveImages(listOf(png("first.png"), second))
        advanceUntilIdle()

        assertEquals(DocumentModel.Phase.REVOKED, model.phase)
        assertTrue(second.closed)
    }

    @Test
    public fun `a picker that hands nothing over says so`(): Unit = runTest {
        val store = FakeFileStore().apply { note("Plan.md", "") }
        val model = inSource(store, FileSettings(MemoryFilePreferences()))

        assertTrue(model.chooseImage())
        model.receiveImages(emptyList())
        assertNull(model.state.value.issue)
        model.imagePickerFailed()
        assertEquals(DocumentModel.Issue.IMAGE_UNREADABLE, model.state.value.issue)
    }

    private fun DocumentModel.linkNodes(): List<Int> = state.value.preview!!.nodes.withIndex()
        .filter { it.value.content.kind == MarkdownContentKind.Link }
        .map { it.index }
}
