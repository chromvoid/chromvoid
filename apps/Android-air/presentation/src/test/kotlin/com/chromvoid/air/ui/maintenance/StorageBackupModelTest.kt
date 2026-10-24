package com.chromvoid.air.ui.maintenance

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.ui.credentials.modelScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class StorageBackupModelTest {
    private class Run(private val files: Map<String, List<ByteArray>>) : BackupRun {
        var closed: Boolean = false
        private val cursors = files.keys.associateWith { 0 }.toMutableMap()

        override fun artifacts(): List<BackupArtifact> =
            files.map { (name, chunks) -> BackupArtifact(name, chunks.sumOf { it.size }.toLong()) }

        override suspend fun read(artifact: Int): ByteArray {
            val name = files.keys.elementAt(artifact)
            val index = cursors.getValue(name)
            val chunks = files.getValue(name)
            if (index >= chunks.size) return ByteArray(0)
            cursors[name] = index + 1
            return chunks[index]
        }

        override suspend fun close() {
            closed = true
        }
    }

    private class Store(val run: Run) : BackupStore {
        var failWith: Exception? = null
        var prepared: Int = 0

        override suspend fun prepareBackup(masterPassword: String, generation: ULong): BackupRun {
            prepared += 1
            failWith?.let { throw it }
            return run
        }
    }

    private class Destination(override val label: String = "Backups") : BackupDestination {
        val written: MutableMap<String, ByteArray> = linkedMapOf()
        var discarded: Boolean = false
        var failOn: String? = null

        override suspend fun writeArtifact(name: String, next: suspend () -> ByteArray) {
            if (name == failOn) throw java.io.IOException("no space")
            val bytes = mutableListOf<Byte>()
            while (true) {
                val chunk = next()
                if (chunk.isEmpty()) break
                bytes += chunk.toList()
            }
            written[name] = bytes.toByteArray()
        }

        override suspend fun discard() {
            discarded = true
        }
    }

    private val run = Run(
        linkedMapOf(
            "manifest.json" to listOf("{}".toByteArray()),
            "chunks.pack" to listOf("one".toByteArray(), "two".toByteArray()),
        ),
    )
    private val store = Store(run)
    private val destination = Destination()

    private fun TestScope.model(): StorageBackupModel =
        StorageBackupModel(store, generation = 1uL, scope = modelScope())

    @Test
    public fun `every artifact is streamed to the destination and the run is closed`(): Unit = runTest {
        val model = model()
        model.chooseDestination(destination)
        model.changePassword("admin")

        model.submit()
        advanceUntilIdle()

        assertEquals(StorageBackupModel.Status.DONE, model.state.value.status)
        assertEquals("Backups", model.state.value.savedTo)
        assertEquals(setOf("manifest.json", "chunks.pack"), destination.written.keys)
        assertEquals("onetwo", String(destination.written.getValue("chunks.pack")))
        assertTrue("Rust's handle is released", run.closed)
        assertEquals("", model.state.value.password)
    }

    @Test
    public fun `a missing destination or password is refused without asking Core`(): Unit = runTest {
        val model = model()

        model.submit()
        advanceUntilIdle()
        assertEquals(StorageBackupModel.Issue.DESTINATION_REQUIRED, model.state.value.issue)

        model.chooseDestination(destination)
        model.submit()
        advanceUntilIdle()
        assertEquals(StorageBackupModel.Issue.PASSWORD_REQUIRED, model.state.value.issue)
        assertEquals(0, store.prepared)
    }

    @Test
    public fun `a wrong administrative password is explained and leaves nothing behind`(): Unit = runTest {
        val model = model()
        store.failWith = CoreRefusal("INVALID_MASTER_PASSWORD", "storage:backup")
        model.chooseDestination(destination)
        model.changePassword("wrong")

        model.submit()
        advanceUntilIdle()

        assertEquals(StorageBackupModel.Issue.REAUTHENTICATION, model.state.value.issue)
        assertEquals(StorageBackupModel.Status.EDITING, model.state.value.status)
        assertTrue("a refused backup removes what it started", destination.discarded)
    }

    @Test
    public fun `a destination that fails midway removes the half-written backup`(): Unit = runTest {
        val model = model()
        destination.failOn = "chunks.pack"
        model.chooseDestination(destination)
        model.changePassword("admin")

        model.submit()
        advanceUntilIdle()

        assertEquals(StorageBackupModel.Issue.FAILED, model.state.value.issue)
        assertTrue(destination.discarded)
        assertTrue("the handle is released whatever happened", run.closed)
    }

    @Test
    public fun `a destination that cannot be cleaned up says so`(): Unit = runTest {
        val failing = object : BackupDestination by destination {
            override suspend fun discard(): Unit = throw java.io.IOException("locked")
        }
        val model = model()
        store.failWith = CoreRefusal("INTERNAL", "storage:backup")
        model.chooseDestination(failing)
        model.changePassword("admin")

        model.submit()
        advanceUntilIdle()

        assertEquals(StorageBackupModel.Issue.CLEANUP_FAILED, model.state.value.issue)
    }

    @Test
    public fun `a lock leaves no password and no destination`(): Unit = runTest {
        val model = model()
        model.chooseDestination(destination)
        model.changePassword("admin")

        model.revoke()

        val state = model.state.value
        assertEquals(StorageBackupModel.Status.REVOKED, state.status)
        assertEquals("", state.password)
        assertNull(state.destination)
    }
}
