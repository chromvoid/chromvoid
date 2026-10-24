package com.chromvoid.air.ui.files

import com.chromvoid.air.ui.credentials.modelScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class FolderSelectionTest {
    @Test
    public fun `paging retains chosen files and leaving selection retains the loaded folder`(): Unit = runTest {
        val store = FakeFileStore().apply { repeat(120) { file("file-%03d.bin".format(it)) } }
        val folder = FolderModel(store, generation = 1uL, path = "/", scope = modelScope())
        advanceUntilIdle()
        val first = folder.state.value.items.first()

        folder.beginSelection(first)
        folder.loadMore()
        advanceUntilIdle()
        assertEquals(setOf(first.nodeID), folder.state.value.selection?.keys)
        folder.loadMore()
        advanceUntilIdle()
        val last = folder.state.value.items.last()
        folder.toggleSelection(last)

        assertEquals("file-119.bin", last.name)
        assertEquals(setOf(first.nodeID, last.nodeID), folder.state.value.selection?.keys)
        assertFalse(folder.state.value.canLoadMore)
        val loaded = folder.state.value.items
        folder.endSelection()

        assertNull(folder.state.value.selection)
        assertEquals(loaded, folder.state.value.items)
        assertEquals(FolderModel.Status.READY, folder.state.value.status)
        assertEquals(120L, folder.state.value.total)
        assertEquals(listOf(0L, 50L, 100L), store.pageRequests.map { it.offset })
    }
}
