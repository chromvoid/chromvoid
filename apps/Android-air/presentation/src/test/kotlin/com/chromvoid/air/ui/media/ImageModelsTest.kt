package com.chromvoid.air.ui.media

import android.graphics.Bitmap
import com.chromvoid.air.bridge.wire.CatalogFolderFilter
import com.chromvoid.air.bridge.wire.CatalogFolderPageRequest
import com.chromvoid.air.bridge.wire.CatalogFolderSort
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.credentials.modelScope
import com.chromvoid.air.ui.files.FakeFileStore
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
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
public class ImageModelsTest {
    private val decoded = mutableListOf<Int>()

    private val decode: suspend (ByteArray) -> DecodedImage = { bytes ->
        if (bytes.firstOrNull() == BROKEN) throw ImageDecodeFailed(IllegalStateException("broken"))
        decoded += bytes.size
        DecodedImage(
            Bitmap.createBitmap(4, 3, Bitmap.Config.ARGB_8888),
            ImageDetails(pixelWidth = 4000, pixelHeight = 3000),
        )
    }

    private fun TestScope.preview(
        store: FakeFileStore,
        name: String,
        posters: ImagePosterCache? = null,
    ): ImagePreviewModel {
        val node = store.named(name)
        return ImagePreviewModel(
            store,
            node.id,
            generation = 1uL,
            name = name,
            sourceRevision = 1,
            facts = ImageFacts("/$name", node.size, node.mimeType, 0, 0),
            scope = modelScope(),
            posters = posters,
            decode = decode,
            thumbnail = { null },
        )
    }

    @Test
    public fun `an image is read, decoded and kept for the session`(): Unit = runTest {
        val store = FakeFileStore().apply { file("photo.jpg", ByteArray(40) { 1 }, mimeType = "image/jpeg") }
        val posters = ImagePosterCache()
        val first = preview(store, "photo.jpg", posters)

        first.load()
        advanceUntilIdle()

        assertEquals(ImagePreviewModel.Status.READY, first.state.value.status)
        assertNotNull(first.state.value.image)
        assertEquals(4000, first.state.value.details?.pixelWidth)
        assertEquals(1, store.calls.count { it.startsWith("read:") })
        assertTrue("a small image needs no stored preview", store.derivativeRequests.isEmpty())

        val again = preview(store, "photo.jpg", posters)
        again.load()
        assertEquals("a decoded image shows at once", ImagePreviewModel.Status.READY, again.state.value.status)
        assertEquals(1, store.calls.count { it.startsWith("read:") })
    }

    @Test
    public fun `a large still asks Core to store its preview once shown, and later reads it and its details`(): Unit =
        runTest {
            val store = FakeFileStore().apply {
                file("scan.jpg", ByteArray(2 * 1024 * 1024) { 2 }, mimeType = "image/jpeg")
            }

            val first = preview(store, "scan.jpg")
            first.load()
            advanceUntilIdle()
            assertEquals(
                "none is stored: the original is read, then Core is asked to store a preview",
                listOf("preview:1:false", "preview:1:true"),
                store.derivativeRequests,
            )
            assertEquals(1, store.calls.count { it.startsWith("read:") })

            val later = preview(store, "scan.jpg")
            later.load()
            advanceUntilIdle()
            assertEquals(ImagePreviewModel.Status.READY, later.state.value.status)
            assertEquals(
                "the stored preview is read, not the original",
                1,
                store.calls.count { it.startsWith("read:") },
            )
            val ensured = store.derivativeRequests.count { it.endsWith(":true") }
            assertEquals("a stored preview asks for no other", 1, ensured)
            assertNull(later.state.value.details)

            later.loadDetails()
            advanceUntilIdle()
            assertNotNull("details come from the original's head", later.state.value.details)
        }

    @Test
    public fun `an animated format never uses a stored preview`(): Unit = runTest {
        val store = FakeFileStore().apply { file("clip.gif", ByteArray(2 * 1024 * 1024) { 3 }, mimeType = "image/gif") }

        preview(store, "clip.gif").load()
        advanceUntilIdle()

        assertTrue(store.derivativeRequests.isEmpty())
    }

    @Test
    public fun `what cannot be shown says why and can be tried again`(): Unit = runTest {
        val store = FakeFileStore().apply {
            file("broken.jpg", byteArrayOf(BROKEN, 1, 2), mimeType = "image/jpeg")
            file("huge.jpg", size = ImageDecoding.MAXIMUM_SOURCE_BYTES + 1, mimeType = "image/jpeg")
        }
        val broken = preview(store, "broken.jpg")
        val huge = preview(store, "huge.jpg")

        broken.load()
        huge.load()
        advanceUntilIdle()

        assertEquals(ImagePreviewModel.Issue.UNDECODABLE, broken.state.value.issue)
        assertEquals(ImagePreviewModel.Issue.TOO_LARGE, huge.state.value.issue)
        assertNotNull("a failed image may be tried again", broken.load())
    }

    @Test
    public fun `a revoked session closes the preview`(): Unit = runTest {
        val store = FakeFileStore().apply { file("photo.jpg", mimeType = "image/jpeg") }
        val model = preview(store, "photo.jpg")
        store.failNext = BridgeException.SessionRevoked()

        model.load()
        advanceUntilIdle()

        assertEquals(ImagePreviewModel.Status.REVOKED, model.state.value.status)
        assertNull(model.state.value.image)
    }

    @Test
    public fun `the gallery keeps three previews and loads the neighbours after the shown one`(): Unit = runTest {
        val store = FakeFileStore().apply {
            folder("Docs")
            repeat(5) { file("img-$it.jpg", ByteArray(10) { 4 }, mimeType = "image/jpeg") }
            file("notes.md", mimeType = "text/markdown")
        }
        val names = listOf("Docs") + (0 until 5).map { "img-$it.jpg" } + "notes.md"
        val items = names.map { store.item(store.named(it)) }
        val gallery = gallery(store, items, selected = store.named("img-2.jpg").id)
        advanceUntilIdle()

        val state = gallery.state.value
        assertEquals("only images are paged", 5, state.items.size)
        assertEquals(listOf("img-1.jpg", "img-2.jpg", "img-3.jpg"), state.previews.values.map { it.name }.sorted())
        assertTrue(state.previews.values.all { it.state.value.status == ImagePreviewModel.Status.READY })

        val first = state.previews.getValue(store.named("img-1.jpg").id)
        gallery.next()
        advanceUntilIdle()
        assertEquals("img-3.jpg", gallery.state.value.name)
        assertEquals(ImagePreviewModel.Status.REVOKED, first.state.value.status)
        assertEquals(
            listOf("img-2.jpg", "img-3.jpg", "img-4.jpg"),
            gallery.state.value.previews.values.map { it.name }.sorted(),
        )
        assertTrue(gallery.state.value.canGoBack)
    }

    @Test
    public fun `the gallery reads the folder's next page when it reaches the end`(): Unit = runTest {
        val store = FakeFileStore().apply {
            repeat(52) { file("img-%02d.jpg".format(it), ByteArray(4) { 5 }, mimeType = "image/jpeg") }
        }
        val firstPage = store.nodes.sortedBy { it.name }.take(50).map(store::item)
        val continuation = request(offset = 50)
        val gallery = gallery(store, firstPage, selected = store.named("img-49.jpg").id, continuation = continuation)
        advanceUntilIdle()
        // Near the end of the page the next one is read before it is needed.
        assertEquals(52, gallery.state.value.items.size)
        assertFalse(gallery.state.value.hasMore)

        gallery.next()
        advanceUntilIdle()
        assertEquals("img-50.jpg", gallery.state.value.name)
    }

    @Test
    public fun `a folder that changed stops the gallery's paging`(): Unit = runTest {
        val store = FakeFileStore().apply {
            repeat(52) { file("img-%02d.jpg".format(it), ByteArray(4) { 5 }, mimeType = "image/jpeg") }
        }
        val firstPage = store.nodes.sortedBy { it.name }.take(50).map(store::item)
        val gallery = gallery(
            store,
            firstPage,
            selected = store.named("img-10.jpg").id,
            continuation = request(offset = 50),
        )
        advanceUntilIdle()
        store.version++

        gallery.select(store.named("img-49.jpg").id)
        gallery.next()
        advanceUntilIdle()

        assertEquals(ImageGalleryModel.Issue.CHANGED, gallery.state.value.issue)
        assertFalse(gallery.state.value.canGoForward)
    }

    private fun request(offset: Long) = CatalogFolderPageRequest(
        expectedVersion = 1,
        filter = CatalogFolderFilter(fileTypes = emptyList(), includeHidden = false, query = ""),
        limit = 50,
        offset = offset,
        path = "/",
        sort = CatalogFolderSort("name", "asc"),
    )

    private fun TestScope.gallery(
        store: FakeFileStore,
        items: List<com.chromvoid.air.bridge.wire.CatalogListItem>,
        selected: Long,
        continuation: CatalogFolderPageRequest? = null,
    ): ImageGalleryModel {
        val scope = modelScope()
        return ImageGalleryModel(store, 1uL, scope, items, selected, continuation) { item ->
            ImagePreviewModel(
                store,
                item.id,
                1uL,
                item.name,
                item.sourceRevision,
                item.facts,
                scope,
                decode = decode,
                thumbnail = { null },
            )
        }
    }

    private companion object {
        const val BROKEN: Byte = 0x7F
    }
}
