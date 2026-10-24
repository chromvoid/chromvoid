package com.chromvoid.air.ui.files

import com.chromvoid.air.bridge.wire.CatalogListItem
import com.chromvoid.air.ui.credentials.modelScope
import java.io.IOException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class FileOperationModelTest {
    private fun TestScope.operation(
        kind: FileOperationModel.Kind,
        store: FakeFileStore,
        items: List<CatalogListItem>,
        finished: MutableList<Set<Long>> = mutableListOf(),
    ): FileOperationModel =
        FileOperationModel(kind, items, store, generation = 1uL, scope = modelScope()) { finished += it }
            .also { advanceUntilIdle() }

    @Test
    public fun `a chosen folder and its subtree are never offered as the destination`(): Unit = runTest {
        val store = FakeFileStore().apply {
            folder("Work")
            folder("Home")
            folder("Old", parent = "/Work")
        }
        val move = operation(FileOperationModel.Kind.MOVE, store, listOf(store.item(store.named("Work"))))

        val root = move.folders.value.single()
        assertEquals(listOf("Home"), move.destinations(root.state.value.items).map { it.name })
        move.openFolder(store.item(store.named("Work")))
        assertEquals(1, move.folders.value.size)
    }

    @Test
    public fun `a move into the folder the items are in is refused before anything runs`(): Unit = runTest {
        val store = FakeFileStore().apply { file("a") }
        val move = operation(FileOperationModel.Kind.MOVE, store, listOf(store.item(store.named("a"))))

        move.start()

        assertEquals(FileOperationModel.ReviewIssue.SAME_FOLDER, move.state.value.issue)
        assertEquals(FileOperationModel.Phase.REVIEWING, move.state.value.phase)
        assertTrue(store.calls.isEmpty())
    }

    @Test
    public fun `each item keeps its own result and a refusal does not stop the rest`(): Unit = runTest {
        val store = FakeFileStore().apply {
            file("a")
            file("b")
            file("c")
        }
        val items = listOf("a", "b", "c").map { store.item(store.named(it)) }
        store.refusals[store.named("b").id] = "NODE_NOT_FOUND"
        val finished = mutableListOf<Set<Long>>()
        val delete = operation(FileOperationModel.Kind.DELETE, store, items, finished)

        delete.start()
        advanceUntilIdle()

        val outcomes = delete.state.value.items.map { it.outcome }
        assertEquals(
            listOf(
                FileOperationModel.Outcome.Completed,
                FileOperationModel.Outcome.Failed(FileIssue.MISSING),
                FileOperationModel.Outcome.Completed,
            ),
            outcomes,
        )
        assertEquals(2, delete.state.value.completed)
        assertEquals(listOf(setOf(items[0].nodeID, items[2].nodeID)), finished)
    }

    @Test
    public fun `an unconfirmed result stops the batch there`(): Unit = runTest {
        val store = FakeFileStore().apply {
            folder("Dest")
            file("a")
            file("b")
        }
        val items = listOf("a", "b").map { store.item(store.named(it)) }
        store.breaks[store.named("a").id] = IOException("connection reset")
        val move = operation(FileOperationModel.Kind.MOVE, store, items)
        move.openFolder(store.item(store.named("Dest")))
        advanceUntilIdle()

        move.start()
        advanceUntilIdle()

        assertEquals(FileOperationModel.Phase.FINISHED, move.state.value.phase)
        assertEquals(
            listOf(FileOperationModel.Outcome.Uncertain, FileOperationModel.Outcome.Pending),
            move.state.value.items.map { it.outcome },
        )
        assertEquals("/Dest", move.state.value.destination)
    }

    @Test
    public fun `stop keeps what Core already confirmed`(): Unit = runTest {
        val store = FakeFileStore().apply {
            file("a")
            file("b")
        }
        val items = listOf("a", "b").map { store.item(store.named(it)) }
        val delete = operation(FileOperationModel.Kind.DELETE, store, items)
        // Stop arrives while the first delete is with Core.
        store.onWrite = { delete.stop() }

        delete.start()
        advanceUntilIdle()

        assertEquals(FileOperationModel.Phase.FINISHED, delete.state.value.phase)
        assertEquals(
            listOf(FileOperationModel.Outcome.Completed, FileOperationModel.Outcome.Pending),
            delete.state.value.items.map { it.outcome },
        )
        assertEquals(listOf("b"), store.nodes.map { it.name })
    }
}
