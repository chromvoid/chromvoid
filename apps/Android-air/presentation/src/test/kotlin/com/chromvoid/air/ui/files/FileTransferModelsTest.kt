package com.chromvoid.air.ui.files

import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.credentials.modelScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class FileTransferModelsTest {
    @Test
    public fun `each picked file is imported into the folder with its own result`(): Unit = runTest {
        val store = FakeFileStore().apply { folder("Docs") }
        store.importRefusals["taken.pdf"] = "NAME_EXIST"
        var finished = 0
        val import = FileImportModel(store, "/Docs", generation = 1uL, scope = modelScope()) { finished++ }
        val scan = MemorySource("scan.pdf", ByteArray(10) { it.toByte() }, "application/pdf")
        val taken = MemorySource("taken.pdf", ByteArray(3))
        val gone = MemorySource("gone.jpg", ByteArray(3), unreadable = true)

        import.receive(listOf(scan, taken, gone))
        advanceUntilIdle()

        val state = import.state.value
        assertEquals(FileImportModel.Phase.FINISHED, state.phase)
        assertEquals(
            listOf(
                FileImportModel.Outcome.Imported,
                FileImportModel.Outcome.Failed(FileIssue.NAME_TAKEN),
                FileImportModel.Outcome.Failed(FileIssue.DEVICE),
            ),
            state.items.map { it.outcome },
        )
        assertEquals(1, state.imported)
        assertEquals(10L, state.items.first().total)
        assertEquals(1, finished)
        assertTrue("every picked document is closed", listOf(scan, taken, gone).all { it.closed })
        assertArrayEquals(ByteArray(10) { it.toByte() }, store.named("scan.pdf").content)
        assertEquals("/Docs", store.named("scan.pdf").parent)
    }

    private class Camera(private val answer: PhotoCapture.Result) : PhotoCapture {
        override val available: Boolean = true

        override suspend fun capture(): PhotoCapture.Result = answer
    }

    @Test
    public fun `a photo taken with the camera is imported into the folder by the name iOS gives it`(): Unit =
        runTest {
            val store = FakeFileStore().apply { folder("Photos") }
            val jpeg = ByteArray(12) { (it + 1).toByte() }
            val takenAt = 1_790_000_000_000L
            val camera = Camera(PhotoCapture.Result.Taken(jpeg, takenAt))
            val import = FileImportModel(store, "/Photos", generation = 1uL, scope = modelScope(), camera = camera)
            assertTrue(import.canTakePhoto)

            import.takePhoto()
            advanceUntilIdle()

            val name = photoName(takenAt)
            assertTrue(name, Regex("""Photo \d{4}-\d{2}-\d{2} \d{2}\.\d{2}\.\d{2}\.jpg""").matches(name))
            assertEquals(listOf(FileImportModel.Outcome.Imported), import.state.value.items.map { it.outcome })
            assertArrayEquals(ByteArray(12) { (it + 1).toByte() }, store.named(name).content)
            assertEquals("image/jpeg", store.named(name).mimeType)
            assertTrue("the photo in memory is cleared once imported", jpeg.all { it == 0.toByte() })
            assertFalse(import.state.value.capturing)
        }

    @Test
    public fun `a refused or missing camera says why and imports nothing, and no camera means no Take Photo`(): Unit =
        runTest {
            val store = FakeFileStore()
            val denied = FileImportModel(
                store, "/", generation = 1uL, scope = modelScope(),
                camera = Camera(PhotoCapture.Result.PermissionDenied),
            )
            denied.takePhoto()
            advanceUntilIdle()
            assertEquals(FileImportModel.CameraIssue.DENIED, denied.state.value.cameraIssue)
            assertTrue(denied.state.value.items.isEmpty())

            val broken = FileImportModel(
                store, "/", generation = 1uL, scope = modelScope(),
                camera = Camera(PhotoCapture.Result.Unavailable),
            )
            broken.takePhoto()
            advanceUntilIdle()
            assertEquals(FileImportModel.CameraIssue.UNAVAILABLE, broken.state.value.cameraIssue)

            val cancelled = FileImportModel(
                store, "/", generation = 1uL, scope = modelScope(),
                camera = Camera(PhotoCapture.Result.Cancelled),
            )
            cancelled.takePhoto()
            advanceUntilIdle()
            assertNull(cancelled.state.value.cameraIssue)
            assertEquals(FileImportModel.Phase.CHOOSING, cancelled.state.value.phase)

            assertFalse(FileImportModel(store, "/", generation = 1uL, scope = modelScope()).canTakePhoto)
        }

    @Test
    public fun `another batch can be chosen once one finished, and a revoked session closes the import`(): Unit =
        runTest {
            val store = FakeFileStore()
            val import = FileImportModel(store, "/", generation = 1uL, scope = modelScope())
            import.receive(listOf(MemorySource("a.txt", ByteArray(2))))
            advanceUntilIdle()
            assertTrue(import.state.value.canChoose)

            store.failNext = BridgeException.SessionRevoked()
            import.receive(listOf(MemorySource("b.txt", ByteArray(2))))
            advanceUntilIdle()

            assertEquals(FileImportModel.Phase.REVOKED, import.state.value.phase)
            assertTrue(import.state.value.items.isEmpty())
        }

    @Test
    public fun `a note gets its Markdown suffix and lands in the folder`(): Unit = runTest {
        val store = FakeFileStore().apply { folder("Trips") }
        var saved = 0
        val note = NoteCreationModel(store, "/Trips", generation = 1uL, scope = modelScope()) { saved++ }

        note.save()
        assertEquals(NoteCreationModel.Issue.EMPTY_NAME, note.state.value.issue)
        note.setName(".hidden")
        note.save()
        assertEquals(NoteCreationModel.Issue.DOT_NAME, note.state.value.issue)
        note.setName("Packing")
        note.setText("- [ ] Passport")
        note.save()
        advanceUntilIdle()

        assertEquals(1, saved)
        assertEquals(NoteCreationModel.Phase.REVOKED, note.state.value.phase)
        assertEquals("- [ ] Passport", store.named("Packing.md").content.decodeToString())
        assertEquals("/Trips", store.named("Packing.md").parent)
    }

    @Test
    public fun `a note too large for the editor is refused before anything is written`(): Unit = runTest {
        val store = FakeFileStore()
        val note = NoteCreationModel(store, "/", generation = 1uL, scope = modelScope())
        note.setName("Long")
        note.setText("x".repeat(store.documentByteLimit.toInt() + 1))

        note.save()

        assertEquals(NoteCreationModel.Issue.TOO_LARGE, note.state.value.issue)
        assertTrue(store.calls.isEmpty())
    }

    @Test
    public fun `a taken note name keeps the draft for another name`(): Unit = runTest {
        val store = FakeFileStore().apply { file("Ideas.md") }
        val note = NoteCreationModel(store, "/", generation = 1uL, scope = modelScope())
        note.setName("Ideas")
        note.setText("draft")

        note.save()
        advanceUntilIdle()

        val state = note.state.value
        assertEquals(NoteCreationModel.Phase.EDITING, state.phase)
        assertEquals(FileIssue.NAME_TAKEN, state.refusal)
        assertEquals("draft", state.text)
        assertEquals(1, state.attempts)
    }

    @Test
    public fun `closing a note with anything in it asks first`(): Unit = runTest {
        val note = NoteCreationModel(FakeFileStore(), "/", generation = 1uL, scope = modelScope())
        assertTrue(note.requestDismiss())

        note.setText("draft")
        assertFalse(note.requestDismiss())
        assertTrue(note.state.value.confirmingDiscard)
        note.cancelDiscard()
        assertFalse(note.state.value.confirmingDiscard)
    }

    @Test
    public fun `an export streams each file into its destination and skips folders`(): Unit = runTest {
        val store = FakeFileStore().apply {
            folder("Docs")
            file("a.bin", ByteArray(9) { (it * 3).toByte() })
            file("b.bin", ByteArray(5) { 7 })
        }
        val items = listOf("Docs", "a.bin", "b.bin").map { store.item(store.named(it)) }
        val export = FileExportModel(items, store, generation = 1uL, scope = modelScope())
        assertTrue(export.intoFolder)
        assertNull(export.single)
        val destinations = mutableMapOf<String, MemoryDestination>()

        export.exportTo { item -> MemoryDestination().also { destinations[item.name] = it } }
        advanceUntilIdle()

        val state = export.state.value
        assertEquals(FileExportModel.Phase.FINISHED, state.phase)
        assertEquals(
            listOf(FileExportModel.Outcome.Skipped, FileExportModel.Outcome.Exported, FileExportModel.Outcome.Exported),
            state.items.map { it.outcome },
        )
        assertArrayEquals(ByteArray(9) { (it * 3).toByte() }, destinations.getValue("a.bin").written.toByteArray())
        assertTrue(destinations.getValue("b.bin").finished)
        assertEquals(setOf("a.bin", "b.bin"), destinations.keys)
    }

    @Test
    public fun `a copy the device refuses is abandoned and reported`(): Unit = runTest {
        val store = FakeFileStore().apply { file("big.bin", ByteArray(20)) }
        val export = FileExportModel(listOf(store.item(store.named("big.bin"))), store, 1uL, modelScope())
        assertFalse(export.intoFolder)
        val destination = MemoryDestination(failAfter = 8)

        export.exportTo { destination }
        advanceUntilIdle()

        assertEquals(FileExportModel.Outcome.Failed(FileIssue.DEVICE), export.state.value.items.single().outcome)
        assertTrue(destination.abandoned)
        assertFalse(destination.finished)
    }

    @Test
    public fun `a failed destination picker keeps the entire export draft for retry`(): Unit = runTest {
        val store = FakeFileStore().apply {
            folder("Docs")
            file("a.txt")
            file("b.txt")
        }
        val items = store.nodes.map(store::item)
        val export = FileExportModel(items, store, generation = 1uL, scope = modelScope())
        val draft = export.state.value.items

        FileExportModel.PickerIssue.entries.forEach { issue ->
            assertTrue(export.beginDestinationChoice())
            export.pickerFailed(issue)

            assertEquals(FileExportModel.Phase.REVIEW, export.state.value.phase)
            assertEquals(issue, export.state.value.pickerIssue)
            assertEquals(draft, export.state.value.items)
            assertTrue(export.intoFolder)
            assertTrue(store.calls.isEmpty())
        }

        assertTrue(export.beginDestinationChoice())
        assertNull(export.state.value.pickerIssue)
        assertEquals(draft, export.state.value.items)
        export.exportTo { MemoryDestination() }
        advanceUntilIdle()

        assertEquals(FileExportModel.Phase.FINISHED, export.state.value.phase)
        assertEquals(2, export.state.value.exported)
        export.pickerFailed(FileExportModel.PickerIssue.NOT_OPENED)
        assertNull(export.state.value.pickerIssue)
        assertFalse(export.beginDestinationChoice())
    }

    @Test
    public fun `picker failure and cancelling export preserve the folder selection`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a.txt") }
        val files = FilesScope(
            store,
            generation = 1uL,
            settings = FileSettings(MemoryFilePreferences()),
            dispatcher = StandardTestDispatcher(testScheduler),
        )
        advanceUntilIdle()
        files.top.beginSelection()
        files.top.toggleSelection(files.top.state.value.items.single())
        val selected = files.top.state.value.selection
        files.beginExport()
        val export = files.export.value!!
        val draft = export.state.value.items

        export.pickerFailed(FileExportModel.PickerIssue.UNAVAILABLE)

        assertEquals(export, files.export.value)
        assertEquals(selected, files.top.state.value.selection)
        assertEquals(draft, export.state.value.items)
        files.closeExport()

        assertNull(files.export.value)
        assertEquals(selected, files.top.state.value.selection)
        assertTrue(store.calls.isEmpty())
        files.close()
    }

    @Test
    public fun `revoking an export clears its picker issue and rejects late picker events`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a.txt") }
        val export = FileExportModel(listOf(store.item(store.nodes.single())), store, 1uL, modelScope())
        export.pickerFailed(FileExportModel.PickerIssue.UNAVAILABLE)

        export.close()
        export.pickerFailed(FileExportModel.PickerIssue.NOT_OPENED)
        assertFalse(export.beginDestinationChoice())
        export.exportTo { error("a revoked export must not open a destination") }
        advanceUntilIdle()

        assertEquals(FileExportModel.Phase.REVOKED, export.state.value.phase)
        assertNull(export.state.value.pickerIssue)
        assertTrue(export.state.value.items.isEmpty())
        assertTrue(store.calls.isEmpty())
    }
}
