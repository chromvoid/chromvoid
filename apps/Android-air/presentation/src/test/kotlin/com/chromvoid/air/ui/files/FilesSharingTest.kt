package com.chromvoid.air.ui.files

import android.content.Intent
import com.chromvoid.air.bridge.wire.CatalogListItem
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** Share, open in another app and save to the gallery, as the scope hands them to the screen. */
@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
public class FilesSharingTest {
    private class RecordingSharing : FileSharing {
        val shared = mutableListOf<List<String>>()
        val viewed = mutableListOf<String>()

        override fun share(files: List<CatalogListItem>, generation: ULong): Intent {
            shared += files.map { it.name }
            return Intent(Intent.ACTION_SEND)
        }

        override fun view(file: CatalogListItem, generation: ULong): Intent {
            viewed += file.name
            return Intent(Intent.ACTION_VIEW)
        }
    }

    private class GalleryDevice : FileDevice {
        val saved = mutableMapOf<String, MemoryDestination>()

        override fun source(document: android.net.Uri): FileSource = error("not used")

        override fun openImageNow(document: android.net.Uri): FileSource? = null

        override fun destination(document: android.net.Uri): FileDestination = error("not used")

        override fun destination(folder: android.net.Uri, name: String, mimeType: String?): FileDestination =
            error("not used")

        override fun gallery(name: String, mimeType: String?): FileDestination? =
            if (mimeType?.startsWith("image/") == true) MemoryDestination().also { saved[name] = it } else null
    }

    private fun TestScope.files(
        store: FakeFileStore,
        sharing: FileSharing? = RecordingSharing(),
        device: FileDevice? = null,
    ): FilesScope = FilesScope(
        store,
        generation = 1uL,
        settings = FileSettings(MemoryFilePreferences()),
        dispatcher = StandardTestDispatcher(testScheduler),
        device = device,
        sharing = sharing,
    ).also { advanceUntilIdle() }

    @Test
    public fun `sharing a selection offers its files and leaves folders out`(): Unit = runTest {
        val store = FakeFileStore().apply {
            folder("Docs")
            file("a.pdf")
            file("b.jpg")
        }
        val sharing = RecordingSharing()
        val files = files(store, sharing)
        files.top.beginSelection()
        files.top.state.value.items.forEach(files.top::toggleSelection)

        files.share()

        assertEquals(listOf(listOf("a.pdf", "b.jpg")), sharing.shared)
        assertEquals(Intent.ACTION_SEND, files.outgoing.value?.action)
        files.outgoingHandled(started = true)
        assertNull(files.outgoing.value)
        assertNull(files.issue.value)
    }

    @Test
    public fun `a file no app can open says so`(): Unit = runTest {
        val store = FakeFileStore().apply { file("model.step") }
        val sharing = RecordingSharing()
        val files = files(store, sharing)

        files.openElsewhere(files.top.state.value.items.single())
        files.outgoingHandled(started = false)

        assertEquals(listOf("model.step"), sharing.viewed)
        assertEquals(FileIssue.NO_APP, files.issue.value)
    }

    @Test
    public fun `without a provider nothing is offered`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a.pdf") }
        val files = files(store, sharing = null)

        files.share(files.top.state.value.items.single())

        assertFalse(files.canShare)
        assertNull(files.outgoing.value)
    }

    @Test
    public fun `an image goes to the gallery with its progress and result`(): Unit = runTest {
        val bytes = ByteArray(10) { it.toByte() }
        val store = FakeFileStore().apply {
            file("photo.jpg", bytes, mimeType = "image/jpeg")
            file("notes.md", mimeType = "text/markdown")
        }
        val device = GalleryDevice()
        val files = files(store, device = device)
        val (notes, photo) = files.top.state.value.items.sortedBy { it.name }

        assertFalse(files.savesToGallery(notes))
        assertTrue(files.savesToGallery(photo))
        files.saveToGallery(photo)
        advanceUntilIdle()

        val export = files.export.value!!
        assertTrue(export.gallery)
        assertEquals(FileExportModel.Phase.FINISHED, export.state.value.phase)
        assertArrayEquals(bytes, device.saved.getValue("photo.jpg").written.toByteArray())
        assertTrue(device.saved.getValue("photo.jpg").finished)
    }
}
