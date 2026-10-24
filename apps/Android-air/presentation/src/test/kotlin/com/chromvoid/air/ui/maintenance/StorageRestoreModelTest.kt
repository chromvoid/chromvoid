package com.chromvoid.air.ui.maintenance

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.ffi.BridgeException
import com.chromvoid.air.ui.credentials.modelScope
import com.chromvoid.air.ui.maintenance.StorageRestoreModel.Issue
import com.chromvoid.air.ui.maintenance.StorageRestoreModel.Status
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class StorageRestoreModelTest {
    private class Run : RestoreRun {
        override val artifacts: List<RestoreArtifact> = listOf(
            RestoreArtifact("metadata", 64, required = true),
            RestoreArtifact("master.salt", 64, required = false),
            RestoreArtifact("chunks.pack", 64, required = true),
        )
        override val chunkBytes: Int = 3
        val appended = mutableListOf<Pair<Int, ByteArray>>()
        var reviewedWith: String? = null
        var reviewFailure: Exception? = null
        var commitFailure: Exception? = null
        var commitGate: CompletableDeferred<Unit>? = null
        var closeFailure: Exception? = null
        var closeGate: CompletableDeferred<Unit>? = null
        var committed = 0
        var cancelled = false
        var closed = 0

        override suspend fun append(artifact: Int, bytes: ByteArray) {
            appended += artifact to bytes
        }

        override suspend fun review(masterPassword: String): RestorePreview {
            reviewFailure?.let { throw it }
            reviewedWith = masterPassword
            return RestorePreview(byteCount = 7)
        }

        override suspend fun commit() {
            commitGate?.await()
            commitFailure?.let { throw it }
            committed += 1
        }

        override fun cancel() {
            cancelled = true
        }

        override suspend fun close() {
            closed += 1
            closeGate?.await()
            closeFailure?.let { throw it }
        }
    }

    private class Store(val run: Run) : RestoreStore {
        var begun = 0
        var failure: Exception? = null

        override suspend fun beginRestore(generation: ULong): RestoreRun {
            begun += 1
            failure?.let { throw it }
            return run
        }
    }

    /** A folder whose optional salt is absent and whose pack is read in chunks. */
    private class Folder(override val label: String = "chromvoid-backup-1") : RestoreSource {
        val files: Map<String, ByteArray?> = mapOf(
            "metadata" to "meta".toByteArray(),
            "master.salt" to null,
            "chunks.pack" to "pack".toByteArray(),
        )
        private var cursors = mutableMapOf<Int, Int>()
        private var names: List<String> = emptyList()
        var opened = 0
        var closed = 0
        var readGate: CompletableDeferred<Unit>? = null

        override suspend fun open(artifacts: List<RestoreArtifact>): Long {
            opened += 1
            names = artifacts.map { it.name }
            cursors = mutableMapOf()
            return files.values.sumOf { it?.size ?: 0 }.toLong()
        }

        override suspend fun read(artifact: Int, maximum: Int): ByteArray? {
            readGate?.await()
            val bytes = files[names[artifact]] ?: return null
            val from = cursors[artifact] ?: 0
            val to = minOf(bytes.size, from + maximum)
            cursors[artifact] = to
            return bytes.copyOfRange(from, to)
        }

        override suspend fun close() {
            closed += 1
        }
    }

    private val run = Run()
    private val store = Store(run)
    private val folder = Folder()
    private var restored = 0

    private fun TestScope.model(): StorageRestoreModel =
        StorageRestoreModel(store, generation = 1uL, scope = modelScope(), onRestored = { restored += 1 })

    private fun TestScope.reviewed(): StorageRestoreModel = model().apply {
        chooseSource(folder)
        changePassword("admin")
        submit()
        advanceUntilIdle()
    }

    private fun TestScope.reviewChosenFolderAgain(model: StorageRestoreModel) {
        model.submit()
        assertEquals(Issue.PASSWORD_REQUIRED, model.state.value.issue)
        assertEquals(1, store.begun)
        folder.readGate = null
        run.reviewFailure = null
        run.closeFailure = null
        run.closeGate = null
        model.changePassword("new admin")
        model.submit()
        advanceUntilIdle()

        assertEquals(Status.REVIEW, model.state.value.status)
        assertEquals(folder.label, model.state.value.source)
        assertEquals("", model.state.value.password)
        assertEquals("new admin", run.reviewedWith)
        assertEquals(2, store.begun)
        assertEquals(2, folder.opened)
    }

    private fun TestScope.cancelDuringFailedCheckCleanup(closeFailure: Exception?) {
        run.reviewFailure = CoreRefusal("INVALID_MASTER_PASSWORD", "restore")
        run.closeFailure = closeFailure
        val closeGate = CompletableDeferred<Unit>()
        run.closeGate = closeGate
        val model = reviewed()
        assertEquals(Status.REVIEWING, model.state.value.status)
        assertEquals("cleanup has already reached the suspended close", 1, run.closed)
        assertTrue(run.cancelled)

        model.cancel()
        assertEquals(Status.CANCELLING, model.state.value.status)
        assertEquals(folder.label, model.state.value.source)
        assertEquals("", model.state.value.password)
        closeGate.complete(Unit)
        advanceUntilIdle()

        assertEquals(Status.EDITING, model.state.value.status)
        assertEquals(folder.label, model.state.value.source)
        assertEquals("", model.state.value.password)
        assertNull(model.state.value.preview)
        assertEquals(if (closeFailure == null) null else Issue.CLEANUP_FAILED, model.state.value.issue)
        assertEquals(1, run.closed)
        assertEquals(0, run.committed)
        reviewChosenFolderAgain(model)
    }

    @Test
    public fun `adoption blocks restore before the backup is read`(): Unit = runTest {
        store.failure = BridgeException.AdoptionActionForbidden()

        val model = reviewed()

        assertEquals(Status.EDITING, model.state.value.status)
        assertEquals(Issue.ADOPTION_REQUIRED, model.state.value.issue)
        assertEquals("", model.state.value.password)
        assertEquals(0, folder.opened)
        assertEquals(1, folder.closed)
        assertEquals(0, run.committed)
    }

    @Test
    public fun `adoption refusal at restore commit has a known untouched outcome`(): Unit = runTest {
        val model = reviewed()
        run.commitFailure = BridgeException.AdoptionActionForbidden()

        model.confirm()
        advanceUntilIdle()

        assertEquals(Status.EDITING, model.state.value.status)
        assertEquals(Issue.ADOPTION_REQUIRED, model.state.value.issue)
        assertEquals("", model.state.value.password)
        assertNull(model.state.value.preview)
        assertEquals(1, run.closed)
        assertEquals(0, run.committed)
        assertEquals(0, restored)
    }

    @Test
    public fun `the whole backup reaches Core in chunks before it is checked`(): Unit = runTest {
        val model = reviewed()

        assertEquals(Status.REVIEW, model.state.value.status)
        assertEquals(RestorePreview(7), model.state.value.preview)
        assertEquals(folder.label, model.state.value.source)
        assertEquals("admin", run.reviewedWith)
        assertEquals("", model.state.value.password)
        // The absent optional file is skipped; each present file ends with an empty chunk.
        assertEquals(listOf(0, 0, 0, 2, 2, 2), run.appended.map { it.first })
        val metadata = run.appended.filter { it.first == 0 }.flatMap { it.second.toList() }.toByteArray()
        assertArrayEquals("meta".toByteArray(), metadata)
        assertTrue(run.appended.filter { it.first == 2 }.last().second.isEmpty())
        assertEquals("the folder is let go of once Core has it", 1, folder.closed)
        assertEquals("nothing is restored before the confirmation", 0, run.committed)
    }

    @Test
    public fun `only the confirmation restores, and the session reads what it became`(): Unit = runTest {
        val model = reviewed()

        model.confirm()
        advanceUntilIdle()

        assertEquals(Status.COMPLETED, model.state.value.status)
        assertNull(model.state.value.source)
        assertEquals("", model.state.value.password)
        assertEquals(1, run.committed)
        assertEquals(1, run.closed)
        assertEquals(1, restored)
    }

    @Test
    public fun `a commit whose outcome is unknown never offers another`(): Unit = runTest {
        val model = reviewed()
        run.commitFailure = java.io.IOException("the device went away")

        model.confirm()
        advanceUntilIdle()

        assertEquals(Status.UNCERTAIN, model.state.value.status)
        assertNull(model.state.value.source)
        assertEquals(0, restored)
        model.confirm()
        model.submit()
        advanceUntilIdle()
        assertEquals(Status.UNCERTAIN, model.state.value.status)
        assertEquals(1, store.begun)
    }

    @Test
    public fun `what Core refuses is explained, and the folder stays chosen for another try`(): Unit = runTest {
        val cases = mapOf(
            CoreRefusal("INVALID_BACKUP", "restore") to Issue.INVALID_BACKUP,
            CoreRefusal("INVALID_MASTER_PASSWORD", "restore") to Issue.INVALID_BACKUP,
            CoreRefusal("STORAGE_NOT_BLANK", "restore") to Issue.TARGET_NOT_EMPTY,
            BridgeException.AdoptionActionForbidden() to Issue.ADOPTION_REQUIRED,
            java.io.IOException("unreadable") to Issue.FAILED,
        )
        cases.forEach { (failure, issue) ->
            run.reviewFailure = failure
            val model = reviewed()
            assertEquals(Status.EDITING, model.state.value.status)
            assertEquals(issue, model.state.value.issue)
            assertEquals(folder.label, model.state.value.source)
            assertEquals("", model.state.value.password)
            assertEquals(0, run.committed)
            assertTrue("the restore slot is released", run.cancelled && run.closed > 0)
        }
        run.reviewFailure = null
        val model = reviewed()
        model.changePassword("admin")
        model.submit()
        advanceUntilIdle()
        assertEquals(Status.REVIEW, model.state.value.status)
    }

    @Test
    public fun `nothing starts without a folder and a password`(): Unit = runTest {
        val model = model()
        model.submit()
        assertEquals(Issue.SOURCE_REQUIRED, model.state.value.issue)
        model.chooseSource(folder)
        model.submit()
        assertEquals(Issue.PASSWORD_REQUIRED, model.state.value.issue)
        assertEquals(0, store.begun)
    }

    @Test
    public fun `cancelling a check releases Rust's slot and keeps the chosen folder for another try`(): Unit = runTest {
        folder.readGate = CompletableDeferred()
        val model = model()
        model.chooseSource(folder)
        model.changePassword("admin")
        model.submit()
        advanceUntilIdle()
        assertEquals(Status.REVIEWING, model.state.value.status)

        model.cancel()
        assertEquals(folder.label, model.state.value.source)
        advanceUntilIdle()

        assertEquals(Status.EDITING, model.state.value.status)
        assertEquals(folder.label, model.state.value.source)
        assertEquals("", model.state.value.password)
        assertNull(model.state.value.issue)
        assertTrue(folder.closed > 0)
        assertTrue(run.cancelled)
        assertEquals(1, run.closed)
        assertNull(run.reviewedWith)
        reviewChosenFolderAgain(model)
    }

    @Test
    public fun `cancelling during a failed check cleanup keeps the chosen folder for another try`(): Unit = runTest {
        cancelDuringFailedCheckCleanup(closeFailure = null)
    }

    @Test
    public fun `cancelling during cleanup keeps the chosen folder when closing fails`(): Unit = runTest {
        cancelDuringFailedCheckCleanup(closeFailure = java.io.IOException("the restore slot could not be released"))
    }

    @Test
    public fun `a revoked check stays revoked when cancelled during cleanup`(): Unit = runTest {
        run.reviewFailure = BridgeException.SessionRevoked()
        val closeGate = CompletableDeferred<Unit>()
        run.closeGate = closeGate
        val model = reviewed()
        assertEquals(Status.REVIEWING, model.state.value.status)
        assertEquals("cleanup has already reached the suspended close", 1, run.closed)

        model.cancel()
        closeGate.complete(Unit)
        advanceUntilIdle()

        assertEquals(Status.REVOKED, model.state.value.status)
        assertNull(model.state.value.source)
        assertEquals("", model.state.value.password)
        assertNull(model.state.value.preview)
        assertNull(model.state.value.issue)
        assertEquals(1, run.closed)
        model.submit()
        model.confirm()
        advanceUntilIdle()
        assertEquals(1, store.begun)
        assertEquals(0, run.committed)
    }

    @Test
    public fun `revoking a cancelled check clears the folder before cleanup finishes`(): Unit = runTest {
        run.reviewFailure = CoreRefusal("INVALID_MASTER_PASSWORD", "restore")
        val closeGate = CompletableDeferred<Unit>()
        run.closeGate = closeGate
        val model = reviewed()
        assertEquals(Status.REVIEWING, model.state.value.status)
        assertEquals("cleanup has already reached the suspended close", 1, run.closed)

        model.cancel()
        assertEquals(folder.label, model.state.value.source)
        model.revoke()
        assertNull(model.state.value.source)
        closeGate.complete(Unit)
        advanceUntilIdle()

        assertEquals(Status.REVOKED, model.state.value.status)
        assertNull(model.state.value.source)
        assertEquals("", model.state.value.password)
        assertNull(model.state.value.preview)
        assertNull(model.state.value.issue)
        assertEquals(1, run.closed)
        model.submit()
        advanceUntilIdle()
        assertEquals(1, store.begun)
    }

    @Test
    public fun `choosing another backup sets the checked one aside`(): Unit = runTest {
        val model = reviewed()

        model.cancel()
        advanceUntilIdle()

        assertEquals(Status.EDITING, model.state.value.status)
        assertTrue(run.cancelled)
        assertEquals(1, run.closed)
        assertNull("the folder is chosen again", model.state.value.source)
        assertEquals(0, run.committed)
    }

    @Test
    public fun `review identifies the newly checked folder after choosing another backup`(): Unit = runTest {
        val model = reviewed()
        assertEquals(folder.label, model.state.value.source)

        model.cancel()
        advanceUntilIdle()
        assertNull(model.state.value.source)
        val another = Folder("chromvoid-backup-2")
        model.chooseSource(another)
        model.submit()
        assertEquals(Issue.PASSWORD_REQUIRED, model.state.value.issue)
        assertEquals(1, store.begun)
        model.changePassword("another admin")
        model.submit()
        advanceUntilIdle()

        assertEquals(Status.REVIEW, model.state.value.status)
        assertEquals(another.label, model.state.value.source)
        assertEquals(RestorePreview(7), model.state.value.preview)
        assertEquals("another admin", run.reviewedWith)
        assertEquals("", model.state.value.password)
        assertEquals(2, store.begun)
        assertEquals(1, another.closed)
        assertEquals(0, run.committed)
    }

    @Test
    public fun `the session's end takes the checked backup and the password with it`(): Unit = runTest {
        val model = reviewed()

        model.revoke()
        advanceUntilIdle()

        assertEquals(Status.REVOKED, model.state.value.status)
        assertNull(model.state.value.source)
        assertEquals("", model.state.value.password)
        assertNull(model.state.value.preview)
        assertTrue(run.cancelled)
        assertEquals(1, run.closed)
        model.confirm()
        advanceUntilIdle()
        assertEquals(0, run.committed)
    }

    @Test
    public fun `a revoked session ends the check rather than blaming the backup`(): Unit = runTest {
        run.reviewFailure = BridgeException.SessionRevoked()
        val model = reviewed()

        assertEquals(Status.REVOKED, model.state.value.status)
        assertNull(model.state.value.source)
        assertEquals("", model.state.value.password)
        assertFalse(model.state.value.issue != null)
    }
}
