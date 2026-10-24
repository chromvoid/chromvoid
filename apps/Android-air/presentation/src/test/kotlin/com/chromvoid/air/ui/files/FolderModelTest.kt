package com.chromvoid.air.ui.files

import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.credentials.modelScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class FolderModelTest {
    private fun TestScope.folder(store: FakeFileStore, path: String = "/", hidden: Boolean = false): FolderModel =
        FolderModel(store, generation = 1uL, path = path, scope = modelScope(), includeHidden = hidden)
            .also { advanceUntilIdle() }

    private fun FolderModel.names(): List<String> = state.value.items.map { it.name }

    @Test
    public fun `a folder lists its folders first, then its files`(): Unit = runTest {
        val store = FakeFileStore().apply {
            file("b.txt")
            folder("Work")
            file("a.md")
            folder("Archive")
        }

        val folder = folder(store)

        assertEquals(FolderModel.Status.READY, folder.state.value.status)
        assertEquals(listOf("Archive", "Work", "a.md", "b.txt"), folder.names())
        assertEquals(4L, folder.state.value.total)
    }

    @Test
    public fun `typing a word costs one search, not one per letter`(): Unit = runTest {
        val store = FakeFileStore().apply {
            file("Passport.pdf")
            file("Taxes.pdf")
        }
        val folder = folder(store)
        store.pageRequests.clear()

        folder.search("p")
        advanceTimeBy(FolderModel.SEARCH_DELAY_MILLIS / 2)
        folder.search("pa")
        advanceTimeBy(FolderModel.SEARCH_DELAY_MILLIS / 2)
        folder.search("pass")
        advanceUntilIdle()

        assertEquals(listOf("pass"), store.pageRequests.map { it.filter?.query })
        assertEquals(listOf("Passport.pdf"), folder.names())
        assertTrue(folder.state.value.items.isNotEmpty())
    }

    @Test
    public fun `sort, order and hidden items go to Core as it names them`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a") }
        val folder = folder(store)

        folder.setSort(FolderModel.Sort.DATE)
        folder.setDescending(true)
        folder.setIncludeHidden(true)
        advanceUntilIdle()

        val last = store.pageRequests.last()
        assertEquals("date", last.sort?.by)
        assertEquals("desc", last.sort?.direction)
        assertEquals(true, last.filter?.includeHidden)
        assertEquals(false, last.filter?.recursive)
    }

    @Test
    public fun `Notes searches the notes of this folder and every folder below it`(): Unit = runTest {
        val store = FakeFileStore().apply {
            folder("Trips")
            file("Plan.md", parent = "/Trips")
            file("Scan.pdf")
            file("Ideas.md")
        }
        val folder = folder(store)

        folder.setNotesOnly(true)
        advanceUntilIdle()

        val request = store.pageRequests.last()
        assertEquals(listOf("markdown"), request.filter?.fileTypes)
        assertEquals(true, request.filter?.recursive)
        assertEquals(true, request.filter?.includeTextContent)
        assertEquals(listOf("Ideas.md", "Plan.md"), folder.names())
    }

    @Test
    public fun `a long folder reads page after page under one version`(): Unit = runTest {
        val store = FakeFileStore().apply { repeat(120) { file("file-%03d".format(it)) } }
        val folder = folder(store)
        assertEquals(50, folder.state.value.items.size)
        assertTrue(folder.state.value.canLoadMore)

        folder.loadMore()
        advanceUntilIdle()
        folder.loadMore()
        advanceUntilIdle()

        assertEquals(120, folder.state.value.items.size)
        assertFalse(folder.state.value.canLoadMore)
        assertEquals(listOf(null, 1L, 1L), store.pageRequests.map { it.expectedVersion })
    }

    @Test
    public fun `a folder that changed between pages asks to be read again`(): Unit = runTest {
        val store = FakeFileStore().apply { repeat(60) { file("file-%02d".format(it)) } }
        val folder = folder(store)

        store.version++
        folder.loadMore()
        advanceUntilIdle()

        assertEquals(FolderModel.Status.FAILED, folder.state.value.status)
        assertEquals(FolderModel.Issue.CHANGED, folder.state.value.issue)
        assertTrue(folder.state.value.items.isEmpty())

        folder.reload()
        advanceUntilIdle()
        assertEquals(FolderModel.Status.READY, folder.state.value.status)
        assertNull(folder.state.value.issue)
    }

    @Test
    public fun `a revoked session closes the folder instead of failing it`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a") }
        val folder = folder(store)

        store.failNext = BridgeException.SessionRevoked()
        folder.reload()
        advanceUntilIdle()

        assertEquals(FolderModel.Status.REVOKED, folder.state.value.status)
        folder.reload()
        advanceUntilIdle()
        assertEquals(FolderModel.Status.REVOKED, folder.state.value.status)
    }

    @Test
    public fun `a folder on the Settings default follows it, one switched by hand is left alone`(): Unit = runTest {
        val store = FakeFileStore().apply {
            file(".secret")
            file("visible")
        }
        val following = folder(store)
        val chosen = folder(store).also { it.setIncludeHidden(true) }
        advanceUntilIdle()
        store.pageRequests.clear()

        following.followHiddenDefault(previous = false, next = true)
        chosen.followHiddenDefault(previous = false, next = true)
        advanceUntilIdle()

        assertEquals(listOf(".secret", "visible"), following.names())
        // Already showing hidden items by hand: nothing to follow, nothing read again.
        assertEquals(1, store.pageRequests.size)

        following.followHiddenDefault(previous = true, next = false)
        advanceUntilIdle()
        assertEquals(listOf("visible"), following.names())
    }

    @Test
    public fun `a selection keeps what was chosen and drops what a batch finished`(): Unit = runTest {
        val store = FakeFileStore().apply {
            file("a")
            file("b")
        }
        val folder = folder(store)
        val (a, b) = folder.state.value.items

        folder.beginSelection(a)
        folder.toggleSelection(b)
        assertEquals(setOf(a.nodeID, b.nodeID), folder.state.value.selection?.keys)
        folder.toggleSelection(a)
        assertEquals(setOf(b.nodeID), folder.state.value.selection?.keys)

        folder.deselect(setOf(b.nodeID))
        assertEquals(emptySet<Long>(), folder.state.value.selection?.keys)
        folder.endSelection()
        assertNull(folder.state.value.selection)
    }

    @Test
    public fun `closing drops every item read`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a") }
        val folder = folder(store)
        folder.search("a")

        folder.close()
        advanceUntilIdle()

        assertEquals(FolderModel.Status.REVOKED, folder.state.value.status)
        assertTrue(folder.state.value.items.isEmpty())
        assertEquals("", folder.state.value.query)
    }
}
