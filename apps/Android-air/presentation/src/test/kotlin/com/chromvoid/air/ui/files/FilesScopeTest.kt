package com.chromvoid.air.ui.files

import com.chromvoid.air.ffi.BridgeException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** An in-memory stand-in for the app's stored Files settings. */
internal class MemoryFilePreferences(
    override var showHidden: Boolean = false,
    override var confirmDeletion: Boolean = true,
    override var attachmentFolder: String = FileSettings.DEFAULT_ATTACHMENT_FOLDER,
) : FilePreferenceStore

@OptIn(ExperimentalCoroutinesApi::class)
public class FilesScopeTest {
    private fun TestScope.files(
        store: FakeFileStore,
        settings: FileSettings = FileSettings(MemoryFilePreferences()),
    ): FilesScope = FilesScope(
        store,
        generation = 1uL,
        settings = settings,
        dispatcher = StandardTestDispatcher(testScheduler),
        searchDelayMillis = 0,
    ).also { advanceUntilIdle() }

    private fun FolderModel.names(): List<String> = state.value.items.map { it.name }

    @Test
    public fun `a folder opens as a level and back returns to the one below`(): Unit = runTest {
        val store = FakeFileStore().apply {
            folder("Trips")
            file("Plan.md", parent = "/Trips")
        }
        val files = files(store)

        files.open(files.top.state.value.items.single())
        advanceUntilIdle()

        assertEquals(listOf("/", "/Trips"), files.levels.value.map { it.path })
        assertEquals(listOf("Plan.md"), files.top.names())
        files.closeFolder()
        assertEquals(listOf("/"), files.levels.value.map { it.path })
        files.closeFolder()
        assertEquals(1, files.levels.value.size)
    }

    @Test
    public fun `a file shows its information and where it is`(): Unit = runTest {
        val store = FakeFileStore().apply {
            folder("Docs")
            file("Scans.zip", parent = "/Docs", size = 2048, mimeType = "application/zip")
        }
        val files = files(store)
        files.open(files.top.state.value.items.single())
        advanceUntilIdle()

        files.open(files.top.state.value.items.single())
        advanceUntilIdle()

        val info = files.info.value
        assertNotNull(info)
        assertEquals("Scans.zip", info?.metadata?.name)
        assertEquals("application/zip", info?.metadata?.mimeType)
        assertEquals("/Docs", info?.location)
        files.closeInfo()
        assertNull(files.info.value)
    }

    @Test
    public fun `a text file opens as a document and a save refreshes the folder`(): Unit = runTest {
        val store = FakeFileStore().apply { file("todo.txt", "milk".encodeToByteArray(), mimeType = "text/plain") }
        val files = files(store)
        val item = files.top.state.value.items.single()
        assertTrue(files.opensViewer(item))

        files.open(item)
        val model = files.document.value?.stack?.value?.single()
        assertNotNull(model)
        model!!.load()
        advanceUntilIdle()
        val pages = store.pageRequests.size
        model.setText("eggs")
        model.save()
        advanceUntilIdle()
        assertTrue(store.pageRequests.size > pages)

        // Nothing else opens over a document.
        files.beginCreateFolder()
        assertNull(files.edit.value)

        files.close()
        assertNull(files.document.value)
        assertEquals(com.chromvoid.air.ui.documents.DocumentModel.Phase.REVOKED, model.state.value.phase)
    }

    @Test
    public fun `the attachment folder is chosen by browsing, never the root`(): Unit = runTest {
        val preferences = MemoryFilePreferences()
        val settings = FileSettings(preferences)
        val store = FakeFileStore().apply { folder("Trips") }
        val files = files(store, settings)

        files.chooseAttachmentFolder()
        val picker = files.attachmentFolder.value!!
        advanceUntilIdle()
        picker.select()
        assertEquals(FolderChooserModel.Issue.ROOT, picker.issue.value)

        // A new folder in the one shown, then into it.
        picker.beginCreateFolder()
        picker.setName("Photos")
        picker.saveName()
        advanceUntilIdle()
        assertNull(picker.edit.value)
        val photos = picker.folders.value.last().state.value.items.first { it.name == "Photos" }
        picker.openFolder(photos)
        picker.select()
        assertEquals(FolderChooserModel.Issue.WAIT_FOR_FOLDER, picker.issue.value)
        advanceUntilIdle()
        picker.select()

        assertNull(files.attachmentFolder.value)
        assertEquals("/Photos", settings.state.value.attachmentFolder)
        assertEquals("/Photos", preferences.attachmentFolder)
    }

    @Test
    public fun `a lock closes the attachment folder picker`(): Unit = runTest {
        val files = files(FakeFileStore())
        files.chooseAttachmentFolder()
        val picker = files.attachmentFolder.value!!

        files.close()

        assertNull(files.attachmentFolder.value)
        assertEquals(FolderModel.Status.REVOKED, picker.folders.value.single().state.value.status)
    }

    @Test
    public fun `a new folder needs a name and lands in the folder on screen`(): Unit = runTest {
        val store = FakeFileStore().apply { folder("Trips") }
        val files = files(store)
        files.open(files.top.state.value.items.single())
        advanceUntilIdle()

        files.beginCreateFolder()
        files.saveName()
        assertEquals(FileIssue.EMPTY_NAME, files.edit.value?.issue)

        files.setName("Tickets")
        files.saveName()
        advanceUntilIdle()

        assertNull(files.edit.value)
        assertEquals(listOf("create:/Trips:Tickets"), store.calls)
        assertEquals(listOf("Tickets"), files.top.names())
    }

    @Test
    public fun `a taken name keeps the editor open with its reason`(): Unit = runTest {
        val store = FakeFileStore().apply {
            folder("Work")
            folder("Home")
        }
        val files = files(store)
        val home = files.top.state.value.items.first { it.name == "Home" }

        files.beginRename(home)
        files.setName("Work")
        files.saveName()
        advanceUntilIdle()

        val edit = files.edit.value
        assertEquals(FileIssue.NAME_TAKEN, edit?.issue)
        assertFalse(edit?.saving ?: true)
        assertEquals(1, edit?.attempts)
        files.setName("House")
        files.saveName()
        advanceUntilIdle()
        assertNull(files.edit.value)
        assertEquals(listOf("House", "Work"), files.top.names())
    }

    @Test
    public fun `a renamed note keeps its Markdown suffix`(): Unit = runTest {
        val store = FakeFileStore().apply { file("Trip.md") }
        val files = files(store)

        files.beginRename(files.top.state.value.items.single())
        files.setName("Holiday")
        files.saveName()
        advanceUntilIdle()

        assertEquals(listOf("Holiday.md"), files.top.names())
    }

    @Test
    public fun `a delete asks first unless Settings says not to`(): Unit = runTest {
        val store = FakeFileStore().apply {
            file("a")
            file("b")
        }
        val settings = FileSettings(MemoryFilePreferences())
        val files = files(store, settings)
        val (a, b) = files.top.state.value.items

        files.requestDelete(a)
        assertEquals(a, files.deleting.value)
        assertTrue(store.calls.isEmpty())
        files.confirmDelete()
        advanceUntilIdle()
        assertEquals(listOf("b"), files.top.names())

        settings.setConfirmDeletion(false)
        files.requestDelete(b)
        assertNull(files.deleting.value)
        advanceUntilIdle()
        assertTrue(files.top.names().isEmpty())
        assertFalse(files.busy.value)
    }

    @Test
    public fun `a failed delete says why and keeps the item`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a") }
        val files = files(store, FileSettings(MemoryFilePreferences(confirmDeletion = false)))
        store.refusals[store.named("a").id] = "SYSTEM_SHARD_DENIED"

        files.requestDelete(files.top.state.value.items.single())
        advanceUntilIdle()

        assertEquals(FileIssue.MANAGED, files.issue.value)
        assertEquals(listOf("a"), files.top.names())
        files.dismissIssue()
        assertNull(files.issue.value)
    }

    @Test
    public fun `a selection is moved into another folder and leaves nothing chosen`(): Unit = runTest {
        val store = FakeFileStore().apply {
            folder("Archive")
            file("a")
            file("b")
        }
        val files = files(store)
        val folder = files.top
        val (_, a, b) = folder.state.value.items
        folder.beginSelection(a)
        folder.toggleSelection(b)

        files.beginOperation(FileOperationModel.Kind.MOVE)
        val operation = files.operation.value!!
        advanceUntilIdle()
        operation.openFolder(operation.folders.value.last().state.value.items.first { it.isDir })
        advanceUntilIdle()
        operation.start()
        advanceUntilIdle()

        assertEquals(FileOperationModel.Phase.FINISHED, operation.state.value.phase)
        assertEquals(2, operation.state.value.completed)
        files.closeOperation()
        assertNull(files.operation.value)
        assertNull(folder.state.value.selection)
        assertEquals(listOf("Archive"), folder.names())
    }

    @Test
    public fun `a batch delete without confirmation starts at once`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a") }
        val files = files(store, FileSettings(MemoryFilePreferences(confirmDeletion = false)))
        files.top.beginSelection(files.top.state.value.items.single())

        files.beginOperation(FileOperationModel.Kind.DELETE)
        advanceUntilIdle()

        assertEquals(FileOperationModel.Phase.FINISHED, files.operation.value?.state?.value?.phase)
        assertTrue(files.top.names().isEmpty())
    }

    @Test
    public fun `the hidden-items setting reaches every open folder still on its default`(): Unit = runTest {
        val store = FakeFileStore().apply {
            file(".profile")
            file("notes")
        }
        val settings = FileSettings(MemoryFilePreferences())
        val files = files(store, settings)
        assertEquals(listOf("notes"), files.top.names())

        settings.setShowHidden(true)
        advanceUntilIdle()

        assertEquals(listOf(".profile", "notes"), files.top.names())
    }

    @Test
    public fun `a change reported by the runtime reads every open folder again`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a") }
        val files = files(store)
        files.synchronize(5uL)
        advanceUntilIdle()
        store.pageRequests.clear()

        files.synchronize(5uL)
        advanceUntilIdle()
        assertTrue(store.pageRequests.isEmpty())

        store.file("b")
        files.synchronize(6uL)
        advanceUntilIdle()
        assertEquals(listOf("a", "b"), files.top.names())
    }

    @Test
    public fun `a revoked session closes everything the scope held`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a") }
        val files = files(store)
        val root = files.top

        files.beginRename(root.state.value.items.single())
        files.setName("b")
        store.failNext = BridgeException.SessionRevoked()
        files.saveName()
        advanceUntilIdle()

        assertNull(files.edit.value)
        assertEquals(FolderModel.Status.REVOKED, root.state.value.status)
    }

    @Test
    public fun `closing drops folders, sheets and selection`(): Unit = runTest {
        val store = FakeFileStore().apply {
            folder("Trips")
            file("a")
        }
        val files = files(store)
        val root = files.top
        root.beginSelection(root.state.value.items.last())
        files.beginOperation(FileOperationModel.Kind.MOVE)
        advanceUntilIdle()
        val operation = files.operation.value!!

        files.close()

        assertNull(files.operation.value)
        assertEquals(FileOperationModel.Phase.REVOKED, operation.state.value.phase)
        assertEquals(FolderModel.Status.REVOKED, root.state.value.status)
        assertNull(root.state.value.selection)
    }
}
