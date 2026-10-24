package com.chromvoid.air.ui.transfer

import com.chromvoid.air.bridge.CoreRefusal
import com.chromvoid.air.bridge.wire.PassmanagerRootImportPreview
import com.chromvoid.air.ui.credentials.FakeClipboard
import com.chromvoid.air.ui.credentials.FakeCredentialStore
import com.chromvoid.air.ui.credentials.FakeCredentialStore.Companion.summary
import com.chromvoid.air.ui.credentials.modelScope
import com.chromvoid.air.ui.transfer.CredentialImportModel.Issue
import com.chromvoid.air.ui.transfer.CredentialImportModel.Status
import java.io.ByteArrayInputStream
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
public class TransferModelsTest {
    private val store = FakeCredentialStore().apply {
        importFiles["bitwarden.json"] = preview(entries = 3)
        importFiles["vault.kdbx"] = preview(entries = 2)
        importPasswords["vault.kdbx"] = "open sesame"
    }
    private val clipboard = FakeClipboard()

    private fun preview(entries: Long) = PassmanagerRootImportPreview(
        entryCount = entries,
        folderCount = 1,
        mode = "merge",
        revision = "r1",
        sshKeyCount = 0,
    )

    private fun file(name: String) = object : ImportSource {
        override val name = name

        override fun open() = ByteArrayInputStream(ByteArray(8))
    }

    private fun TestScope.importing(): CredentialImportModel =
        CredentialImportModel(store, generation = 1uL, scope = modelScope())

    @Test
    public fun `a merge is reviewed and then applied once`(): Unit = runTest {
        val model = importing()

        model.fileChosen(file("bitwarden.json"))
        advanceUntilIdle()
        assertEquals(Status.REVIEW, model.state.value.status)
        assertEquals(3L, model.state.value.preview?.entryCount)
        assertTrue("nothing is applied by a review", store.commits.isEmpty())

        model.requestImport()
        advanceUntilIdle()

        assertEquals(Status.FINISHED, model.state.value.status)
        assertEquals(listOf("bitwarden.json" to false), store.commits)
        assertEquals(0, store.openReviews)
    }

    @Test
    public fun `a replacement asks once more before it is applied`(): Unit = runTest {
        val model = importing()
        model.setReplacing(true)
        model.fileChosen(file("bitwarden.json"))
        advanceUntilIdle()

        model.requestImport()
        assertEquals(Status.CONFIRMING, model.state.value.status)
        model.cancelConfirmation()
        assertEquals(Status.REVIEW, model.state.value.status)
        assertTrue(store.commits.isEmpty())

        model.requestImport()
        model.confirmReplacement()
        advanceUntilIdle()
        assertEquals(listOf("bitwarden.json" to true), store.commits)
    }

    @Test
    public fun `an encrypted source asks for its password and says when it is wrong`(): Unit = runTest {
        val model = importing()
        model.fileChosen(file("vault.kdbx"))
        advanceUntilIdle()
        assertEquals(Status.PASSWORD, model.state.value.status)
        assertNull(model.state.value.issue)

        model.setSourcePassword("wrong")
        model.submitPassword()
        advanceUntilIdle()
        assertEquals(Status.PASSWORD, model.state.value.status)
        assertEquals(Issue.PASSWORD_INVALID, model.state.value.issue)
        assertEquals("the typed password is not kept", "", model.state.value.sourcePassword)

        model.setSourcePassword("open sesame")
        model.submitPassword()
        advanceUntilIdle()
        assertEquals(Status.REVIEW, model.state.value.status)
    }

    @Test
    public fun `an unsupported or oversized file fails with its reason`(): Unit = runTest {
        val model = importing()
        model.fileChosen(file("notes.txt"))
        advanceUntilIdle()
        assertEquals(Status.FAILED to Issue.UNSUPPORTED, model.state.value.status to model.state.value.issue)

        store.failWith = ImportFileTooLarge()
        model.fileChosen(file("huge.json"))
        advanceUntilIdle()
        assertEquals(Issue.TOO_LARGE, model.state.value.issue)
    }

    @Test
    public fun `choosing again drops the review held in Rust`(): Unit = runTest {
        val model = importing()
        model.fileChosen(file("bitwarden.json"))
        advanceUntilIdle()
        assertEquals(1, store.openReviews)

        model.chooseAgain()

        assertEquals(0, store.openReviews)
        assertEquals(Status.CHOOSING, model.state.value.status)
    }

    @Test
    public fun `a changed vault asks for the file again and an unknown outcome is not retried`(): Unit =
        runTest {
            val model = importing()
            model.fileChosen(file("bitwarden.json"))
            advanceUntilIdle()
            store.commitFailure = CoreRefusal("SYNC_CONFLICT", "passmanager:root:import:commit")
            model.requestImport()
            advanceUntilIdle()
            assertEquals(Status.FAILED to Issue.CHANGED, model.state.value.status to model.state.value.issue)

            model.fileChosen(file("bitwarden.json"))
            advanceUntilIdle()
            store.commitFailure = CoreRefusal("INTERNAL", "passmanager:root:import:commit")
            model.requestImport()
            advanceUntilIdle()
            assertEquals(Status.UNCERTAIN, model.state.value.status)
            model.requestImport()
            assertEquals(Status.UNCERTAIN, model.state.value.status)
            assertEquals(0, store.openReviews)
        }

    @Test
    public fun `an export is held only until the destination is chosen`(): Unit = runTest {
        val model = CredentialExportModel(store, generation = 1uL, scope = modelScope())

        model.prepare()
        advanceUntilIdle()
        val document = model.state.value.document!!
        assertArrayEquals(store.exportDocument, document)
        assertEquals(CredentialExportModel.Status.CHOOSING_DESTINATION, model.state.value.status)

        model.finish(saved = true)
        assertNull(model.state.value.document)
        assertTrue("the bytes are wiped", document.all { it == 0.toByte() })
        assertEquals(CredentialExportModel.Status.FINISHED, model.state.value.status)
    }

    @Test
    public fun `a cancelled destination returns to ready and a failed write says so`(): Unit = runTest {
        val model = CredentialExportModel(store, generation = 1uL, scope = modelScope())
        model.prepare()
        advanceUntilIdle()
        model.finish(saved = null)
        assertEquals(CredentialExportModel.Status.READY, model.state.value.status)

        model.prepare()
        advanceUntilIdle()
        model.finish(saved = false)
        assertEquals(CredentialExportModel.Issue.NOT_SAVED, model.state.value.issue)
    }

    @Test
    public fun `clearing asks first, takes back the clipboard, and a refusal is explained`(): Unit = runTest {
        store.entries += summary("mail", "Mail")
        val model = CredentialClearModel(store, generation = 1uL, scope = modelScope(), clipboard = clipboard)

        model.confirm()
        assertEquals("nothing without a confirmation", 0, store.clears)
        model.request()
        model.confirm()
        advanceUntilIdle()
        assertEquals(CredentialClearModel.Status.FINISHED, model.state.value)
        assertEquals(1, clipboard.clears)
        assertTrue(store.entries.isEmpty())

        store.failWith = CoreRefusal("ACCESS_DENIED", "passmanager:root:import")
        model.request()
        model.confirm()
        advanceUntilIdle()
        assertEquals(CredentialClearModel.Status.DENIED, model.state.value)
    }
}
